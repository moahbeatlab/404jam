import { Clock } from "../core/clock.js";
import { Midi } from "../core/midi.js";
import { Pulse } from "../core/pulse.js";
import { saveState, state } from "../core/store.js";
import { $, NOTE_NAMES, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { openPick } from "./lfo-page.js";
import { SCALES, noteName, playCh } from "./play-view.js";

/* ===== ARP: turns one-shot (or any chromatic sample) into chords and arps, with trig conditions per step.
   It sends notes on the chromatic channel (the sample last tapped in PADS), on the beat of the unit's clock (else the tap tempo).
   Lists only ever get entries appended, so saved indices stay valid. ===== */
const RATES = [["1/4", 24], ["1/8", 12], ["1/8T", 8], ["1/16", 6], ["1/16T", 4], ["1/32", 3]]; /* pulses per step (24 per beat) */
const DIRS = ["UP", "DOWN", "UP-DN", "DN-UP", "RANDOM", "ORDER", "GLISS", "THIRDS", "PEDAL", "CHORD"];
const DIR_NOTE = ["low to high", "high to low", "up and back", "down and back", "random", "as you entered them", "chromatic run", "1 3 2 4 3 5…", "root between notes", "all at once"];
const GATES = [25, 50, 75, 100];
const SWINGS = [["OFF", 0], ["LIGHT", 1 / 6], ["TRIPLET", 1 / 3]]; /* odd steps come later by this part of a step */
const CHORDS = [["MAJ", [0, 4, 7]], ["MIN", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["MAJ7", [0, 4, 7, 11]], ["MIN7", [0, 3, 7, 10]], ["SUS2", [0, 2, 7]],
  ["SUS4", [0, 5, 7]], ["DIM", [0, 3, 6]], ["AUG", [0, 4, 8]], ["5", [0, 7]], ["6", [0, 4, 7, 9]], ["9", [0, 4, 7, 10, 14]]];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const DEGS = [{ t: "SCALE", s: "all notes" }].concat(ROMAN.map((r) => ({ t: r, s: "triad" })), ROMAN.map((r) => ({ t: r + "7", s: "7th" })));
const COND = [{ t: "●", s: "always" }, { t: "75%", p: 75 }, { t: "50%", p: 50 }, { t: "25%", p: 25 }, { t: "10%", p: 10 }];
[[1, 2], [2, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [4, 4]].forEach(([a, b]) => COND.push({ t: a + ":" + b, a, b, s: a === 1 ? "of " + b + " loops" : "" }));
COND.push({ t: "1st", first: true, s: "first loop" }, { t: "!1st", first: false, s: "not first" }, { t: "FILL", fill: true, s: "while held" }, { t: "!FILL", fill: false, s: "not held" }, { t: "✕", rest: true, s: "rest" });
const ORIGIN = 48; /* the note that plays the sample at its own pitch: assumed C3 (not verified); SHIFT moves it by octaves */

const run = { on: false, wait: false, quant: false, step: 0, idx: 0, last: 0, fill: false, active: [], later: [], warned: false };
const clockAlive = () => Clock.last > 0 && performance.now() - Clock.last <= 1500;

/* one step's condition: is the note played this time? cyc = how many times the lane has looped since the start */
function cond(c, cyc, fill) {
  const k = COND[c] || COND[0];
  if (k.rest) return false;
  if (k.p) return Math.random() * 100 < k.p;
  if (k.a) return cyc % k.b === k.a - 1;
  if (k.first !== undefined) return k.first ? cyc === 0 : cyc > 0;
  if (k.fill !== undefined) return k.fill ? fill : !fill;
  return true;
}

/* the set of notes (pitch classes) from ROOT + SCALE + CHORD / degree; stacking order kept */
function fillNotes() {
  const a = state.arp;
  if (a.scale === 0) a.pcs = CHORDS[a.chord][1].map((i) => (a.root + i) % 12);
  else {
    const iv = SCALES[a.scale - 1][1], n = iv.length, pc = (d) => (a.root + iv[d % n] + 12 * Math.floor(d / n)) % 12;
    if (a.deg === 0) a.pcs = iv.map((x) => (a.root + x) % 12);
    else {
      const k = (a.deg - 1) % 7, seven = a.deg > 7;
      a.pcs = (seven ? [k, k + 2, k + 4, k + 6] : [k, k + 2, k + 4]).map(pc);
    }
  }
  a.pcs = a.pcs.filter((p, i, all) => all.indexOf(p) === i);
}

/* the sounding notes. The chord is placed relative to the SAMPLE key, so a sample in F still sounds the pitches you picked */
function playRange() { return state.play.target === "sample" ? [36, 60] : [24, 96]; }
function pitches() {
  const a = state.arp, sample = state.play.target === "sample", [lo, hi] = playRange();
  const d0 = sample ? ((a.root - a.key + 18) % 12) - 6 : a.root;
  const base = ORIGIN + a.shift * 12 + d0;
  const out = [];
  for (let o = 0; o < a.oct; o++) a.pcs.forEach((pc) => {
    let n = base + ((pc - a.root + 12) % 12) + o * 12;
    while (n > hi) n -= 12;
    while (n < lo) n += 12;
    if (!out.includes(n)) out.push(n);
  });
  return out;
}
function sequence() {
  const a = state.arp, ord = pitches(), asc = ord.slice().sort((x, y) => x - y), desc = asc.slice().reverse();
  const bounce = (l) => l.concat(l.slice(1, -1).reverse());
  switch (DIRS[a.dir]) {
    case "DOWN": return desc;
    case "UP-DN": return bounce(asc);
    case "DN-UP": return bounce(desc);
    case "ORDER": return ord;
    case "GLISS": {
      if (asc.length < 2) return asc;
      const run2 = []; for (let n = asc[0]; n <= asc[asc.length - 1] && run2.length < 25; n++) run2.push(n);
      return bounce(run2);
    }
    case "THIRDS": return asc.length < 3 ? asc : asc.reduce((s, _, i) => s.concat([asc[i], asc[(i + 2) % asc.length]]), []);
    case "PEDAL": return asc.length < 2 ? asc : asc.slice(1).reduce((s, n) => s.concat([asc[0], n]), []);
    default: return asc;
  }
}

/* ---- the engine ---- */
function sendOn(n, gateAt, vel) {
  if (!Midi.sendNote(playCh(), n, true, vel)) {
    if (!run.warned) { run.warned = true; showBanner("SP-404 not connected - nothing sent", "warn", 4000); }
    return false;
  }
  run.active.push({ ch: playCh(), note: n, off: gateAt });
  return true;
}
function flush() {
  run.active.forEach((h) => Midi.sendNote(h.ch, h.note, false));
  run.active = []; run.later = [];
}
function fireStep(n) {
  const a = state.arp, per = RATES[a.rate][1], i = run.step % a.len, cyc = Math.floor(run.step / a.len);
  paintNow(i);
  const seq = sequence();
  const k = run.idx++;
  run.step++;
  if (!seq.length || !cond(a.steps[i], cyc, run.fill)) return;
  const delay = run.step % 2 === 0 ? Math.round(per * SWINGS[a.swing][1]) : 0; /* step index already advanced: even = the odd step of the lane */
  const notes = DIRS[a.dir] === "CHORD" ? seq : [DIRS[a.dir] === "RANDOM" ? seq[Math.floor(Math.random() * seq.length)] : seq[k % seq.length]];
  const gate = Math.max(1, Math.round(per * GATES[a.gate] / 100));
  const go = (at) => notes.forEach((nt) => sendOn(nt, at + gate, i === 0 ? 120 : 100));
  if (delay) run.later.push({ at: n + delay, go }); else go(n);
}
function tick(n) {
  if (n < run.last && (run.on || run.wait)) { /* the unit started over */
    flush();
    run.step = 0; run.idx = 0;
  }
  run.last = n;
  if (!run.on && !run.wait) return;
  /* the first clock pulse after the unit's start is its downbeat (n = 1), so the grid is (n - 1) */
  const g = (n - 1) % RATES[state.arp.rate][1] === 0;
  if (run.wait) {
    if (run.quant && (n - 1) % 96 !== 0) return;
    run.wait = false; run.on = true; run.step = 0; run.idx = 0; paintRun();
  }
  run.active = run.active.filter((h) => { if (h.off <= n) { Midi.sendNote(h.ch, h.note, false); return false; } return true; });
  run.later = run.later.filter((l) => { if (l.at <= n) { l.go(l.at); return false; } return true; });
  if (g) fireStep(n);
}
function start() {
  if (run.on || run.wait) return;
  if (!pitches().length) { showBanner("ARP: pick some notes first", "warn", 3000); return; }
  run.warned = false;
  run.quant = clockAlive();
  run.wait = true;
  paintRun();
}
function stop() {
  const was = run.on || run.wait;
  run.on = false; run.wait = false;
  flush();
  paintNow(-1); paintRun();
  return was;
}
Pulse.subs.add(tick);
Pulse.busyFns.add(() => run.on || run.wait);

/* ---- the page ---- */
let built = false;
const cells = {};
let laneEls = [];
function cell(id, label, onTap) {
  const b = el("button", "big lf-cell");
  b.appendChild(el("small", "", label));
  b.appendChild(el("b"));
  b.addEventListener("click", onTap);
  $("ar-grid").appendChild(b);
  cells[id] = b;
}
const apply = () => { fillNotes(); saveState(); render(); };
function build() {
  if (built) return;
  built = true;
  const a = state.arp;
  for (let pc = 0; pc < 12; pc++) {
    const b = el("button", "pad", NOTE_NAMES[pc]);
    b.addEventListener("click", () => {
      const i = a.pcs.indexOf(pc);
      if (i >= 0) a.pcs.splice(i, 1); else a.pcs.push(pc);
      saveState(); render();
    });
    $("ar-notes").appendChild(b);
  }
  $("ar-root").addEventListener("click", () => openPick("Root (lowest note)", NOTE_NAMES.map((n) => ({ t: n })), a.root, (i) => { a.root = i; apply(); }, 4));
  $("ar-scale").addEventListener("click", () => openPick("Scale of the music", [{ t: "OFF", s: "chord types" }].concat(SCALES.map((s) => ({ t: s[0] }))), a.scale, (i) => { a.scale = i; apply(); }, 3));
  $("ar-chord").addEventListener("click", () => {
    if (a.scale === 0) openPick("Chord", CHORDS.map((c) => ({ t: c[0] })), a.chord, (i) => { a.chord = i; apply(); }, 4);
    else openPick("Chord on the scale", DEGS, a.deg, (i) => { a.deg = i; apply(); }, 4);
  });
  $("ar-clear").addEventListener("click", () => { a.pcs = []; saveState(); render(); });
  cell("dir", "PATTERN", () => openPick("Arp pattern", DIRS.map((d, i) => ({ t: d, s: DIR_NOTE[i] })), a.dir, (i) => { a.dir = i; saveState(); render(); }, 2));
  cell("rate", "RATE", () => openPick("Rate", RATES.map((r) => ({ t: r[0] })), a.rate, (i) => { a.rate = i; saveState(); render(); }, 3));
  cell("gate", "GATE", () => openPick("Gate (note length)", GATES.map((g) => ({ t: g + "%" })), a.gate, (i) => { a.gate = i; saveState(); render(); }, 4));
  cell("swing", "SWING", () => openPick("Swing", SWINGS.map((s) => ({ t: s[0] })), a.swing, (i) => { a.swing = i; saveState(); render(); }, 3));
  cell("oct", "OCTAVES", () => openPick("Octaves", [1, 2, 3].map((o) => ({ t: String(o) })), a.oct - 1, (i) => { a.oct = i + 1; saveState(); render(); }, 3));
  cell("shift", "SHIFT", () => openPick("Octave shift", [-1, 0, 1].map((o) => ({ t: (o > 0 ? "+" : "") + o })), a.shift + 1, (i) => { a.shift = i - 1; saveState(); render(); }, 3));
  cell("key", "SAMPLE KEY", () => openPick("Key of the sample", NOTE_NAMES.map((n) => ({ t: n })), a.key, (i) => { a.key = i; saveState(); render(); }, 4));
  cell("len", "STEPS", () => openPick("Steps in the loop", Array.from({ length: 16 }, (_, i) => ({ t: String(i + 1) })), a.len - 1, (i) => { a.len = i + 1; saveState(); render(); }, 4));
  const lane = $("ar-lane");
  for (let i = 0; i < 16; i++) {
    const b = el("button", "ar-step");
    b.appendChild(el("small", "", String(i + 1)));
    b.appendChild(el("b"));
    b.addEventListener("click", () => openPick("Step " + (i + 1), COND.map((c) => ({ t: c.t, s: c.s })), a.steps[i], (c) => { a.steps[i] = c; saveState(); render(); }, 4));
    lane.appendChild(b);
    laneEls.push(b);
  }
  $("ar-all").addEventListener("click", () => openPick("All steps", COND.map((c) => ({ t: c.t, s: c.s })), -1, (c) => { a.steps = a.steps.map(() => c); saveState(); render(); }, 4));
  $("ar-go").addEventListener("click", () => { if (run.on || run.wait) stop(); else start(); });
  const fill = $("ar-fill");
  fill.addEventListener("pointerdown", (e) => { e.preventDefault(); try { fill.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } run.fill = true; fill.classList.add("on"); });
  const off = () => { run.fill = false; fill.classList.remove("on"); };
  fill.addEventListener("pointerup", off);
  fill.addEventListener("pointercancel", off);
}
function paintNow(i) { laneEls.forEach((b, k) => b.classList.toggle("now", k === i)); }
function paintRun() {
  document.body.classList.toggle("arp-run", run.on || run.wait);
  if (!built) return;
  const b = $("ar-go");
  b.classList.toggle("on", run.on || run.wait);
  b.textContent = run.on ? "STOP" : run.wait ? (run.quant ? "STARTS ON THE BAR…" : "STARTING…") : "START";
}
function render() {
  if (!built) return;
  const a = state.arp, sample = state.play.target === "sample";
  [...$("ar-notes").children].forEach((b, pc) => { b.classList.toggle("on", a.pcs.includes(pc)); b.classList.toggle("root", pc === a.root); });
  $("ar-root").querySelector("b").textContent = NOTE_NAMES[a.root];
  $("ar-scale").querySelector("b").textContent = a.scale === 0 ? "OFF" : SCALES[a.scale - 1][0];
  $("ar-chord").querySelector("b").textContent = a.scale === 0 ? CHORDS[a.chord][0] : DEGS[a.deg].t;
  $("ar-chord").querySelector("small").textContent = a.scale === 0 ? "CHORD" : "CHORD ON SCALE";
  cells.dir.querySelector("b").textContent = DIRS[a.dir];
  cells.rate.querySelector("b").textContent = RATES[a.rate][0];
  cells.gate.querySelector("b").textContent = GATES[a.gate] + "%";
  cells.swing.querySelector("b").textContent = SWINGS[a.swing][0];
  cells.oct.querySelector("b").textContent = String(a.oct);
  cells.shift.querySelector("b").textContent = (a.shift > 0 ? "+" : "") + a.shift;
  cells.key.querySelector("b").textContent = sample ? NOTE_NAMES[a.key] : "–";
  cells.key.disabled = !sample;
  cells.len.querySelector("b").textContent = String(a.len);
  laneEls.forEach((b, i) => {
    b.querySelector("b").textContent = COND[a.steps[i]].t;
    b.classList.toggle("off", i >= a.len);
    b.classList.toggle("set", a.steps[i] !== 0);
  });
  const seq = pitches();
  $("ar-hint").textContent = (sample ? "Chromatic sample (CH16, the pad you last tapped in PADS), tuned to " + NOTE_NAMES[a.key] + ". " : "Vocoder pitch (CH11). ")
    + seq.length + " note" + (seq.length === 1 ? "" : "s") + (seq.length ? " (" + seq.slice().sort((x, y) => x - y).map(noteName).join(" ") + ")" : "") + ". "
    + (clockAlive() ? "Follows the unit's clock and starts on the next bar." : "No clock: runs on the tap tempo (" + Math.round(state.tapBpm) + " BPM, set on PERF > LFO) and starts at once.");
  paintRun();
}
export { COND, CHORDS, DIRS, RATES, cond, fillNotes, pitches, sequence, start, stop, build as buildArp, render as renderArp, run as ArpRun };
