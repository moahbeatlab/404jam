import { saveState, state } from "../core/store.js";
import { $, NOTE_NAMES, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { openPick } from "./lfo-page.js";
import { SCALES, noteName } from "./play-view.js";
import { ORIGIN, hitPad, pickSample, sampleLabel } from "./sample-pick.js";
import { GATES, RATES, SWINGS, makeRunner } from "./stepper.js";

/* ===== ARP: turns one-shot (or any chromatic sample) into chords and arps. The notes you pick are placed relative to the key the
   sample is tuned to, and played by the shared step engine (stepper.js). Lists only ever get entries appended. ===== */
const DIRS = ["UP", "DOWN", "UP-DN", "DN-UP", "RANDOM", "ORDER", "GLISS", "THIRDS", "PEDAL", "CHORD"];
const DIR_NOTE = ["low to high", "high to low", "up and back", "down and back", "random", "as you entered them", "chromatic run", "1 3 2 4 3 5…", "root between notes", "all at once"];
const CHORDS = [["MAJ", [0, 4, 7]], ["MIN", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["MAJ7", [0, 4, 7, 11]], ["MIN7", [0, 3, 7, 10]], ["SUS2", [0, 2, 7]],
  ["SUS4", [0, 5, 7]], ["DIM", [0, 3, 6]], ["AUG", [0, 4, 8]], ["5", [0, 7]], ["6", [0, 4, 7, 9]], ["9", [0, 4, 7, 10, 14]]];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const DEGS = [{ t: "SCALE", s: "all notes" }].concat(ROMAN.map((r) => ({ t: r, s: "triad" })), ROMAN.map((r) => ({ t: r + "7", s: "7th" })));
const RANGE = [36, 60]; /* the chromatic channel: C2-C4 */

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
function pitches() {
  const a = state.arp, [lo, hi] = RANGE;
  const d0 = ((a.root - a.key + 18) % 12) - 6;
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
      const r = []; for (let n = asc[0]; n <= asc[asc.length - 1] && r.length < 25; n++) r.push(n);
      return bounce(r);
    }
    case "THIRDS": return asc.length < 3 ? asc : asc.reduce((s, _, i) => s.concat([asc[i], asc[(i + 2) % asc.length]]), []);
    case "PEDAL": return asc.length < 2 ? asc : asc.slice(1).reduce((s, n) => s.concat([asc[0], n]), []);
    default: return asc;
  }
}

const runner = makeRunner({
  rate: () => state.arp.rate, gate: () => state.arp.gate, swing: () => state.arp.swing, len: () => 1 << 30,
  step: (i, cyc, k) => {
    const seq = sequence();
    if (!seq.length) return null;
    if (DIRS[state.arp.dir] === "CHORD") return seq.map((n) => ({ n, v: 100 }));
    return [{ n: DIRS[state.arp.dir] === "RANDOM" ? seq[Math.floor(Math.random() * seq.length)] : seq[k % seq.length], v: 100 }];
  },
  can: () => { if (pitches().length) return true; showBanner("ARP: pick some notes first", "warn", 3000); return false; },
  onStep: () => {},
  onRun: () => paintRun(),
});
const run = runner.run;

/* ---- the page ---- */
let built = false;
const cells = {};
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
  $("ar-sample").addEventListener("click", () => pickSample(a.sample, (s) => { a.sample = s; saveState(); render(); }));
  $("ar-key").addEventListener("click", () => openPick("Key the sample is tuned to", NOTE_NAMES.map((n) => ({ t: n })), a.key, (i) => { a.key = i; saveState(); render(); }, 4));
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
  $("ar-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { $("view-arp").dataset.page = b.dataset.p; render(); }));
  $("ar-go").addEventListener("click", () => runner.toggle());
}
function paintRun() {
  document.body.classList.toggle("arp-run", runner.isOn());
  if (!built) return;
  const b = $("ar-go");
  b.classList.toggle("on", runner.isOn());
  b.textContent = run.on ? "STOP" : run.wait ? (run.quant ? "STARTS ON THE BAR…" : "STARTING…") : "START";
}
function render() {
  if (!built) return;
  const a = state.arp, page = $("view-arp").dataset.page;
  $("ar-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === page));
  $("ar-sample").querySelector("b").textContent = sampleLabel(a.sample);
  $("ar-key").querySelector("b").textContent = NOTE_NAMES[a.key];
  [...$("ar-notes").children].forEach((b, pc) => { b.classList.toggle("on", a.pcs.includes(pc)); b.classList.toggle("root", pc === a.root); });
  $("ar-root").querySelector("b").textContent = NOTE_NAMES[a.root];
  $("ar-scale").querySelector("b").textContent = a.scale === 0 ? "OFF" : SCALES[a.scale - 1][0];
  $("ar-chord").querySelector("b").textContent = a.scale === 0 ? CHORDS[a.chord][0] : DEGS[a.deg].t;
  $("ar-chord").querySelector("small").textContent = a.scale === 0 ? "CHORD" : "ON SCALE";
  cells.dir.querySelector("b").textContent = DIRS[a.dir];
  cells.rate.querySelector("b").textContent = RATES[a.rate][0];
  cells.gate.querySelector("b").textContent = GATES[a.gate] + "%";
  cells.swing.querySelector("b").textContent = SWINGS[a.swing][0];
  cells.oct.querySelector("b").textContent = String(a.oct);
  cells.shift.querySelector("b").textContent = (a.shift > 0 ? "+" : "") + a.shift;
  const seq = pitches().sort((x, y) => x - y);
  $("ar-hint").textContent = seq.length ? seq.length + " notes: " + seq.map(noteName).join(" ") : "No notes yet: tap the note buttons or pick a chord.";
  $("ar-clock").textContent = runner.clockAlive() ? "Follows the unit's clock, starts on the next bar." : "No clock: tap tempo (" + Math.round(state.tapBpm) + " BPM, set on PERF > LFO), starts at once.";
  paintRun();
}
export { CHORDS, DIRS, fillNotes, pitches, sequence, runner as arpRunner, build as buildArp, render as renderArp };
