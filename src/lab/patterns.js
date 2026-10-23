import { el } from "../core/util.js";
import { call, json } from "./client.js";
import { bufferOf, play, stopAll, now, context } from "./audio.js";
import { L, BANKS, padLabel, say, changed, onChange, padMeta } from "./state.js";
import { btn, row, note, head, chips, sheet, stepper, ask } from "./ui.js";
import { choosePad } from "./padpick.js";

/* PTN: the patterns of the project: a step grid per pad, tools, and a player that uses the project's own sounds */
const STEP = 120; /* ticks of a 16th (480 per quarter note) */
const P = { slots: false, doc: null, rows: new Set(), rowPad: -1, page: 0, scope: 0, undo: [], playing: false, token: 0, bpm: 0 };
let C = null;
const patBytes = (n) => call("patternBytes", n);

async function load(n) {
  L.ptn = n;
  const p = L.info.patterns.find((x) => x.n === n);
  P.doc = p ? await json("pattern", n) : null;
  if (P.doc) {
    P.doc.notes.forEach((x) => P.rows.add(x.pad));
    P.page = Math.min(P.page, pages() - 1);
  }
  P.rowPad = P.rowPad >= 0 && P.rows.has(P.rowPad) ? P.rowPad : -1;
}
const stepsPerBar = () => (P.doc ? P.doc.beats * 4 : 16);
const pages = () => (P.doc ? Math.max(Math.ceil((P.doc.bars * stepsPerBar()) / 8), 1) : 1);
async function op(name, args) {
  if (!P.doc) return false;
  const n = L.ptn;
  try {
    const before = await patBytes(n);
    await call("patternOp", n, name, JSON.stringify(args || {}));
    P.undo.push({ n, bytes: before }); if (P.undo.length > 30) P.undo.shift();
    await changed({ pads: [] });
    return true;
  } catch (e) { say(String(e.message || e), "err"); return false; }
}
async function undo() {
  const u = P.undo.pop();
  if (!u) { say("Nothing to undo."); return; }
  try { await call("setPatternBytes", u.n, u.bytes); L.ptn = u.n; await changed({ pads: [] }); } catch (e) { say(String(e.message || e), "err"); }
}

/* ---- the player ---- */
const voices = new Map();
async function ensureBuffers() {
  const bufs = new Map();
  for (const pad of P.rows) {
    if (!L.info.pads[pad].file) continue;
    try { const m = await padMeta(pad); bufs.set(pad, await bufferOf(m.id, m)); } catch (e) { /* silent pad */ }
  }
  return bufs;
}
async function startPlay() {
  if (!P.doc) return;
  stopPlay();
  const token = ++P.token; P.playing = true;
  C.play.textContent = "■ STOP"; C.play.classList.add("on");
  const bufs = await ensureBuffers();
  if (token !== P.token) return;
  const bpm = P.bpm || L.info.tempo || 120;
  const tickSec = 60 / bpm / P.doc.ppq;
  const loopSec = P.doc.length * tickSec;
  const notes = [...P.doc.notes].sort((a, b) => a.tick - b.tick);
  const t0 = now() + 0.08;
  let cycle = 0, idx = 0;
  const gain = (v) => Math.pow(v / 127, 1.5);
  const sched = () => {
    if (token !== P.token) return;
    const horizon = now() + 0.2;
    while (true) {
      if (idx >= notes.length) { idx = 0; cycle++; }
      const nt = notes[idx], at = t0 + cycle * loopSec + nt.tick * tickSec;
      if (at > horizon) break;
      const b = bufs.get(nt.pad);
      if (b && at > now() - 0.05) {
        const old = voices.get(nt.pad); if (old) old.stop();
        voices.set(nt.pad, play(b, { when: Math.max(at, now()), gain: 0.8 * gain(nt.vel) }));
      }
      idx++;
    }
    setTimeout(sched, 25);
  };
  sched();
  const follow = () => {
    if (token !== P.token) return;
    const t = (now() - t0) / tickSec;
    if (t >= 0) {
      const tick = t % P.doc.length, step = Math.floor(tick / STEP), pg = Math.floor(step / 8);
      if (pg !== P.page) { P.page = pg; paint(); }
      C.grid.querySelectorAll(".lb-cell.now").forEach((c) => c.classList.remove("now"));
      C.grid.querySelectorAll('.lb-cell[data-step="' + (step % 8) + '"]').forEach((c) => c.classList.add("now"));
    }
    requestAnimationFrame(follow);
  };
  follow();
}
function stopPlay() {
  P.token++; P.playing = false;
  voices.forEach((v) => v.stop()); voices.clear();
  stopAll();
  if (C) { C.play.textContent = "▶ PLAY"; C.play.classList.remove("on"); C.grid.querySelectorAll(".lb-cell.now").forEach((c) => c.classList.remove("now")); }
}

/* ---- the screen ---- */
function cellNotes(pad, step) {
  const lo = (P.page * 8 + step) * STEP, hi = lo + STEP;
  return P.doc.notes.filter((x) => x.pad === pad && x.tick >= lo && x.tick < hi);
}
async function toggle(pad, step) {
  const ns = cellNotes(pad, step);
  if (ns.length) await op("edit", { notes: ns.map((x) => ({ pad: x.pad, tick: x.tick })), delete: true });
  else {
    const tick = (P.page * 8 + step) * STEP;
    if (tick >= P.doc.length) return;
    await op("insert", { pad, tick, vel: 100, len: 110 });
    if (L.info.pads[pad].file) { const m = await padMeta(pad); play(await bufferOf(m.id, m), { gain: 0.8 }); }
  }
}
async function noteSheet(pad, step) {
  const ns = cellNotes(pad, step);
  const vi = await sheet("Velocity of this step", ["127 (hard)", "100", "80", "64", "40 (soft)"]);
  if (vi < 0) return;
  const vel = [127, 100, 80, 64, 40][vi];
  const li = await sheet("Length of this step", [{ t: "1/16" }, { t: "1/8" }, { t: "1/4" }, { t: "1/2" }, { t: "1 bar" }, { t: "to the end of the pattern" }]);
  if (li < 0) return;
  const tick = (P.page * 8 + step) * STEP;
  const len = [110, 230, 470, 950, 1900, Math.max(P.doc.length - tick, 1)][li];
  if (!ns.length) await op("insert", { pad, tick, vel, len: Math.min(len, P.doc.length - tick) });
  else await op("edit", { notes: ns.map((x) => ({ pad: x.pad, tick: x.tick })), vel, len: Math.min(len, P.doc.length - ns[0].tick) });
}
function paintSlots() {
  C.slots.textContent = "";
  for (let k = 0; k < 16; k++) {
    const n = L.bank * 16 + k + 1, p = L.info.patterns.find((x) => x.n === n);
    const t = el("button", "lb-pad" + (p ? " has" : "") + (n === L.ptn ? " sel" : ""));
    t.appendChild(el("small", "", padLabel(n - 1)));
    t.appendChild(el("span", "lb-pad-name", p ? p.notes + " notes" : ""));
    t.appendChild(el("small", "lb-pad-len", p ? p.bars + (p.bars === 1 ? " bar" : " bars") : "empty"));
    t.addEventListener("click", async () => { stopPlay(); P.page = 0; P.rows = new Set(); await load(n); P.slots = !P.doc; paint(); });
    C.slots.appendChild(t);
  }
}
function paint() {
  if (!C) return;
  if (!L.info || !L.info.open) { C.body.textContent = ""; C.body.appendChild(note("Open or start a project first (PROJECT).")); C.slots.textContent = ""; return; }
  C.banks.set(L.bank);
  C.slotbar.textContent = "";
  const cur = L.info.patterns.find((x) => x.n === L.ptn);
  C.slotbar.appendChild(btn((P.slots ? "\u25B4 " : "\u25BE ") + "PATTERN " + padLabel(L.ptn - 1) + (cur ? " · " + cur.bars + (cur.bars === 1 ? " bar" : " bars") : " · empty") + (P.slots ? "" : " (tap to choose another)"), "", () => { P.slots = !P.slots; paint(); }));
  C.banks.root.style.display = P.slots ? "" : "none";
  C.slots.style.display = P.slots ? "" : "none";
  if (P.slots) paintSlots();
  C.body.textContent = "";
  if (!P.doc) {
    C.body.appendChild(head("Pattern " + padLabel(L.ptn - 1) + " is empty"));
    C.body.appendChild(note("Make a new empty pattern: how many bars?"));
    C.body.appendChild(row("lb-wrap", [1, 2, 4, 8].map((b) => btn(b + (b === 1 ? " bar" : " bars"), "go", async () => {
      try { await call("newPattern", L.ptn, b); P.rows = new Set(); P.page = 0; P.slots = false; await changed({ pads: [] }); } catch (e) { say(String(e.message || e), "err"); }
    }))));
    C.body.appendChild(btn("COPY ANOTHER PATTERN HERE…", "", async () => {
      const n = await choosePad("Copy which pattern? (the pad number is the pattern number)", L.ptn - 1, { hint: "Pattern A1 is the pattern of pad A1." });
      if (n < 0) return;
      if (!L.info.patterns.find((x) => x.n === n + 1)) { say("That pattern is empty.", "err"); return; }
      try { await call("copyPattern", n + 1, L.ptn); await changed({ pads: [] }); } catch (e) { say(String(e.message || e), "err"); }
    }));
    return;
  }
  const d = P.doc;
  C.body.appendChild(head("Pattern " + d.label + " · " + d.bars + (d.bars === 1 ? " bar" : " bars") + " · " + d.notes.length + " notes"));
  const tr = row("lb-wrap lb-tight");
  C.play = btn(P.playing ? "■ STOP" : "▶ PLAY", P.playing ? "go on" : "go", () => (P.playing ? stopPlay() : startPlay()));
  tr.appendChild(C.play);
  tr.appendChild(stepper("BPM", () => P.bpm || L.info.tempo, (v) => v, (dd) => { P.bpm = Math.min(Math.max((P.bpm || L.info.tempo) + dd * 2, 40), 240); if (P.playing) { stopPlay(); startPlay(); } }).root);
  tr.appendChild(btn("UNDO" + (P.undo.length ? " (" + P.undo.length + ")" : ""), "", undo));
  C.body.appendChild(tr);
  /* pages of 8 steps */
  const pg = el("div", "lb-chips");
  for (let i = 0; i < pages(); i++) {
    const per = stepsPerBar() / 8, bar = Math.floor(i / per) + 1, half = i % per + 1;
    const b = el("button", "lb-chip" + (i === P.page ? " on" : ""), per > 1 ? bar + "." + half : String(bar));
    b.addEventListener("click", () => { P.page = i; paint(); });
    pg.appendChild(b);
  }
  C.body.appendChild(pg);
  /* the grid */
  C.grid = el("div", "lb-seq");
  const rows = [...P.rows].sort((a, b) => a - b);
  rows.forEach((pad) => {
    const r = el("div", "lb-seq-row" + (pad === P.rowPad ? " sel" : ""));
    const lab = el("button", "lb-seq-lab");
    lab.appendChild(el("b", "", padLabel(pad)));
    lab.appendChild(el("small", "", L.info.pads[pad].name || ""));
    lab.addEventListener("click", async () => {
      P.rowPad = P.rowPad === pad ? -1 : pad; paint();
      if (L.info.pads[pad].file) { const m = await padMeta(pad); play(await bufferOf(m.id, m), { gain: 0.8 }); }
    });
    r.appendChild(lab);
    for (let s = 0; s < 8; s++) {
      const ns = cellNotes(pad, s), global = P.page * 8 + s;
      const c = el("button", "lb-cell" + (ns.length ? " on" : "") + (global % 4 === 0 ? " beat" : "") + (global * STEP >= d.length ? " off" : ""));
      c.dataset.step = s;
      if (ns.length) c.style.opacity = String(0.45 + 0.55 * Math.max(...ns.map((x) => x.vel)) / 127);
      if (ns.some((x) => x.tick % STEP !== 0)) c.classList.add("loose");
      let t = null, long = false;
      c.addEventListener("pointerdown", () => { long = false; t = setTimeout(() => { long = true; noteSheet(pad, s); }, 550); });
      c.addEventListener("pointerup", () => { clearTimeout(t); });
      c.addEventListener("pointerleave", () => { clearTimeout(t); });
      c.addEventListener("click", () => { if (!long) toggle(pad, s); });
      r.appendChild(c);
    }
    C.grid.appendChild(r);
  });
  if (!rows.length) C.grid.appendChild(note("No pad plays in this pattern yet: add a row, then tap the steps."));
  C.body.appendChild(C.grid);
  C.body.appendChild(row("lb-wrap lb-tight", btn("+ ADD A ROW (PAD)…", "", async () => {
    const n = await choosePad("Which pad plays in a new row?", L.pad);
    if (n >= 0) { P.rows.add(n); P.rowPad = n; paint(); }
  }), btn("REMOVE EMPTY ROWS", "", () => { P.rows = new Set(P.doc.notes.map((x) => x.pad)); paint(); })));
  C.body.appendChild(note("Tap a step to put or take a note. Hold a step for velocity and length. Tap a row name to hear the pad and to limit the tools to that row. Dim steps off the grid (a dot) are notes not on a 16th."));
  /* the tools */
  const tools = el("div", "lb-sec");
  tools.appendChild(head("Tools"));
  const scope = chips(["all pads", P.rowPad >= 0 ? "row " + padLabel(P.rowPad) : "selected row"], P.scope, (i) => { P.scope = i; });
  tools.appendChild(scope.root);
  const sc = () => (P.scope === 1 && P.rowPad >= 0 ? { pad: P.rowPad } : {});
  tools.appendChild(row("lb-wrap",
    btn("QUANTIZE 1/16", "", () => op("quantize", { grid: 120, strength: 1, ...sc() })),
    btn("1/8", "", () => op("quantize", { grid: 240, strength: 1, ...sc() })),
    btn("HALF-WAY", "", () => op("quantize", { grid: 120, strength: 0.5, ...sc() })),
    btn("REVERSE", "", () => op("reverse", sc())),
    btn("◀ SHIFT", "", () => op("shift", { grid: STEP, steps: -1, ...sc() })),
    btn("SHIFT ▶", "", () => op("shift", { grid: STEP, steps: 1, ...sc() }))));
  tools.appendChild(el("div", "lb-note", "Swing (on the 16ths)"));
  tools.appendChild(row("lb-wrap", [54, 58, 62, 66, 70].map((a) => btn(a + "%", "", () => op("swing", { grid: STEP, amount: a, ...sc() })))));
  tools.appendChild(row("lb-wrap",
    btn("HUMANIZE", "", () => op("humanize", { timing: 12, velocity: 12, seed: (Math.random() * 1e6) | 0, tighten: [], ...sc() })),
    btn("CLEAR ROW", "warn", () => { if (P.rowPad >= 0) op("clearPad", { pad: P.rowPad }); else say("Tap a row name first."); })));
  tools.appendChild(el("div", "lb-note", "Length"));
  tools.appendChild(row("lb-wrap",
    btn("DOUBLE", "", () => op("double")), btn("EXTEND (EMPTY 2ND HALF)", "", () => op("extend")), btn("HALVE", "", () => op("halve"))));
  tools.appendChild(row("lb-wrap",
    btn("COPY TO…", "", async () => {
      const n = await choosePad("Copy this pattern onto which pattern?", L.ptn - 1, { hint: "It replaces that pattern." });
      if (n < 0) return;
      try { P.undo.push({ n: n + 1, bytes: await patBytes(n + 1) }); await call("copyPattern", L.ptn, n + 1); await changed({ pads: [] }); say("Copied to " + padLabel(n)); } catch (e) { say(String(e.message || e), "err"); }
    }),
    btn("DELETE PATTERN", "warn", async () => {
      stopPlay();
      try { P.undo.push({ n: L.ptn, bytes: await patBytes(L.ptn) }); await call("deletePattern", L.ptn); P.doc = null; P.rows = new Set(); await changed({ pads: [] }); } catch (e) { say(String(e.message || e), "err"); }
    })));
  tools.appendChild(note("Patterns are not checked on a real SP-404MKII yet. A pattern is stored in the pad of the same name: A1 is pattern 1."));
  C.body.appendChild(tools);
}
function build(host) {
  const root = el("div", "lb-scroll");
  host.appendChild(root);
  C = {};
  C.banks = chips(BANKS.split(""), L.bank, async (i) => { L.bank = i; paint(); }, "lb-banks");
  C.slots = el("div", "lb-grid");
  C.body = el("div", "lb-detail");
  C.slotbar = el("div", "");
  root.append(C.slotbar, C.banks.root, C.slots, C.body);
  onChange(async () => { if (L.view === "patterns") { if (L.info && L.info.open) await load(L.ptn); paint(); } });
  return {
    root,
    async show() {
      if (L.info && L.info.open) await load(L.ptn);
      if (!P.doc) P.slots = true;
      paint();
    },
    async openPattern(n) { L.bank = Math.floor((n - 1) / 16); P.rows = new Set(); P.page = 0; await load(n); P.slots = !P.doc; paint(); },
  };
}
export { build };
