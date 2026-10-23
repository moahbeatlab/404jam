import { el } from "../core/util.js";
import { call, json } from "./client.js";
import { bufferOf, play, forget } from "./audio.js";
import { L, padLabel, say, padMeta, freePads } from "./state.js";
import { btn, row, note, head, chips, stepper, sheet } from "./ui.js";
import { choosePad } from "./padpick.js";
import { putOnPad } from "./pads.js";

/* CHORDS: chords and arps made from a pad's sample (by pitching it, like a sampler's chromatic mode), arp
   variations, a chord kit across pads, and a progression written as a pattern over the kit */
const A = {
  pad: -1, key: 0, root: 0, chord: 0, notes: [0, 4, 7],
  dir: 1, rate: 3, gate: 1, swing: 0, octaves: 2, shift: 0, bars: 1, bpm: 0, seed: 1,
  variants: [], vcount: 8, vseed: 1,
  kitRoot: 0, kitScale: 0, kitSev: false, kit: null, kitPads: [],
  prog: 0, rhythm: 0, pbars: 4, human: 0, ppat: 1,
};
let K = null, C = null, ui = {};
const cache = new Map(); /* arp JSON -> {id, meta} */
const arpOf = (over) => ({
  Key: A.key, Root: A.root, Notes: A.notes, Dir: A.dir, Octaves: A.octaves, Shift: A.shift, Rate: A.rate, Gate: A.gate,
  Swing: A.swing, BPM: A.bpm || L.info.tempo, Bars: A.bars, Seed: A.seed, ...over,
});
async function made(arp) {
  const src = await padMeta(A.pad);
  const key = A.pad + ":" + src.id + ":" + JSON.stringify(arp);
  if (cache.has(key)) return cache.get(key);
  const meta = await json("renderArp", src.id, JSON.stringify(arp));
  cache.set(key, meta);
  if (cache.size > 60) { const k = cache.keys().next().value; forget(cache.get(k).id); cache.delete(k); }
  return meta;
}
async function hear(arp) {
  try { const m = await made(arp); play(await bufferOf(m.id, m), { gain: 0.8 }); } catch (e) { say(String(e.message || e), "err"); }
}
async function toPad(arp, name, pad) {
  const m = await made(arp);
  /* the cached handle stays; the pad gets its own copy of the audio through the project */
  await putOnPad(pad, m.id, name, true);
}
function chordName() { return A.notes.length ? ui.names.chord(A) : ""; }
async function refreshChord() {
  A.notes = JSON.parse(await call("chordNotes", A.root, -1, A.chord, 0));
  A.notes = A.notes.length ? A.notes : [A.root];
  paintChord();
}
function paintChord() {
  ui.rootChips.set(A.root); ui.keyChips.set(A.key); ui.typeChips.set(A.chord);
  const names = K.pitchNames;
  ui.noteChips.buttons.forEach((b, i) => b.classList.toggle("on", A.notes.includes(i)));
  ui.notesNote.textContent = "Notes: " + A.notes.map((n) => names[n]).join(" ") + " · lowest " + names[A.root];
  ui.dir.set(A.dir); ui.rate.set(A.rate); ui.gate.set(A.gate); ui.swing.set(A.swing);
  ui.oct.show(); ui.shift.show(); ui.bars.show(); ui.bpm.show();
  ui.src.textContent = A.pad >= 0 ? "Sample: " + padLabel(A.pad) + " " + (L.info.pads[A.pad].name || "") : "Pick the pad whose sample is the base of the chords.";
  const kit = A.kit;
  ui.kitList.textContent = kit ? kit.map((c) => c.roman + " " + c.name).join("   ") : "";
  ui.kitPadsNote.textContent = A.kitPads.length ? "Kit on pads " + padLabel(A.kitPads[0]) + " to " + padLabel(A.kitPads[A.kitPads.length - 1]) + "." : "No kit built yet: build one above, then write a progression over it.";
  ui.ppat.textContent = "Pattern " + padLabel(A.ppat - 1);
}
function needPad() {
  if (A.pad < 0 || !L.info.pads[A.pad].file) { say("Pick a pad with a sample first (SOURCE).", "err"); return false; }
  return true;
}
async function variants(fresh) {
  if (!needPad()) return;
  if (fresh) A.vseed = (Math.random() * 1e6) | 0;
  try {
    A.variants = await json("arpVariants", JSON.stringify(arpOf()), A.vcount, A.vseed);
    paintVariants();
  } catch (e) { say(String(e.message || e), "err"); }
}
function paintVariants() {
  ui.vlist.textContent = "";
  A.variants.forEach((v, i) => {
    const c = el("div", "lb-card");
    c.appendChild(el("b", "", (i + 1) + ". " + v.name));
    const rate = K.rates[v.arp.Rate].name, dir = K.dirs[v.arp.Dir].name;
    c.appendChild(el("small", "", dir + " · " + rate + " · gate " + (K.gates[v.arp.Gate] || "ring") + (v.arp.Swing ? " · swing" : "") + " · " + v.arp.Octaves + " oct"));
    c.appendChild(row("lb-wrap lb-tight", btn("▶", "go", () => hear(v.arp)), btn("→ PAD…", "", async () => {
      const n = await choosePad("Put “" + v.name + "” on which pad?", L.pad);
      if (n < 0) return;
      try { await toPad(v.arp, ("ARP " + v.name).slice(0, 23), n); say(v.name + " is on " + padLabel(n)); } catch (e) { say(String(e.message || e), "err"); }
    })));
    ui.vlist.appendChild(c);
  });
}
async function allVariantsToPads() {
  if (!A.variants.length) { say("Make the variations first.", "err"); return; }
  const first = await choosePad("First pad for " + A.variants.length + " variations (free pads from there on)", L.pad);
  if (first < 0) return;
  const pads = freePads(first, A.variants.length);
  if (pads.length < A.variants.length) say("Only " + pads.length + " free pads from " + padLabel(first) + ": the rest are left out.", "err");
  try {
    for (let k = 0; k < pads.length; k++) { say("Rendering " + (k + 1) + "/" + pads.length + "…"); await toPad(A.variants[k].arp, ("ARP " + A.variants[k].name).slice(0, 23), pads[k]); }
    say(pads.length + " variations on " + padLabel(pads[0]) + " to " + padLabel(pads[pads.length - 1]));
  } catch (e) { say(String(e.message || e), "err"); }
}
async function buildKit() {
  if (!needPad()) return;
  try {
    A.kit = await json("chordKit", A.kitRoot, K.kitScales[A.kitScale].index, A.kitSev);
  } catch (e) { say(String(e.message || e), "err"); return; }
  paintChord();
  const first = await choosePad("First pad of the chord kit (7 chords on the pads from there)", L.pad, { hint: "The seven chords of the scale, I to VII, one per pad." });
  if (first < 0) return;
  const pads = A.kit.map((_, i) => first + i);
  if (pads[6] > 159) { say("The kit needs 7 pads from " + padLabel(first) + " on: pick an earlier pad.", "err"); return; }
  const taken = pads.filter((n) => L.info.pads[n].has || L.info.pads[n].file);
  if (taken.length) {
    const i = await sheet(taken.length + " of those pads have a sample. Replace them? (UNDO on PADS brings them back one by one)", ["Replace them", "Cancel"]);
    if (i !== 0) return;
  }
  try {
    for (let k = 0; k < 7; k++) {
      say("Building " + A.kit[k].name + " (" + (k + 1) + "/7)…");
      const arp = arpOf({ Notes: A.kit[k].notes, Root: A.kit[k].notes[0], Dir: 0, Octaves: 1, Shift: 0 });
      await toPad(arp, A.kit[k].name, pads[k]);
    }
    A.kitPads = pads;
    paintChord();
    say("Chord kit " + K.pitchNames[A.kitRoot] + " " + K.kitScales[A.kitScale].name + " is on " + padLabel(pads[0]) + " to " + padLabel(pads[6]) + ". Now write a progression over it.");
  } catch (e) { say(String(e.message || e), "err"); }
}
async function writeProgression(open) {
  if (A.kitPads.length < 7) { say("Build the chord kit first.", "err"); return; }
  const pr = K.progressions[A.prog];
  const spec = { pads: A.kitPads, degrees: pr.degrees, bars: A.pbars, rhythm: K.rhythms[A.rhythm], velocity: 100, humanize: A.human, seed: (Math.random() * 1e6) | 0 };
  try {
    await call("writeProgression", A.ppat, JSON.stringify(spec));
    const { changed } = await import("./state.js");
    await changed({ pads: [] });
    say("Progression " + pr.name + " is pattern " + padLabel(A.ppat - 1) + " (" + A.pbars + " bars, " + K.rhythms[A.rhythm] + ").");
    if (open) {
      const lab = await import("./lab.js");
      await lab.show("patterns");
      const { views } = await import("./state.js");
      await views.patterns.openPattern(A.ppat);
    }
  } catch (e) { say(String(e.message || e), "err"); }
}

function build(host) {
  const root = el("div", "lb-scroll");
  host.appendChild(root);
  C = {};
  const body = el("div", "");
  root.appendChild(body);
  async function init() {
    K = JSON.parse(await call("arpConsts"));
    K.pitchNames = K.pitchNames;
    K.kitScales = K.scales.map((s, i) => ({ ...s, index: i })).filter((s) => s.iv.length === 7);
    K.gates = K.gates.map((g) => (g === 0 ? "ring" : g + "%"));
    K.rates = K.rates; K.dirs = K.dirs;
    ui.names = { chord: (a) => a.notes.map((n) => K.pitchNames[n]).join(" ") };
    body.textContent = "";
    /* source */
    body.appendChild(head("Sample"));
    ui.src = note("");
    body.appendChild(ui.src);
    body.appendChild(row("lb-wrap", btn("USE THE SELECTED PAD", "go", () => { A.pad = L.pad; if (!L.info.pads[A.pad].file) { say("That pad has no sample.", "err"); A.pad = -1; } paintChord(); }), btn("CHOOSE A PAD…", "", async () => { const n = await choosePad("Base the chords on which pad?", L.pad); if (n >= 0) { A.pad = n; paintChord(); } })));
    body.appendChild(el("div", "lb-note", "The sample is tuned to (the key it is played in; a C chord needs a sample in C to sound right)"));
    ui.keyChips = chips(K.pitchNames, A.key, (i) => { A.key = i; paintChord(); });
    body.appendChild(ui.keyChips.root);
    /* the chord */
    body.appendChild(head("Chord"));
    body.appendChild(el("div", "lb-note", "Root"));
    ui.rootChips = chips(K.pitchNames, A.root, (i) => { A.root = i; refreshChord(); });
    body.appendChild(ui.rootChips.root);
    body.appendChild(el("div", "lb-note", "Type"));
    ui.typeChips = chips(K.chords.map((c) => c.name), A.chord, (i) => { A.chord = i; refreshChord(); });
    body.appendChild(ui.typeChips.root);
    body.appendChild(el("div", "lb-note", "Notes (tap to add or take one out)"));
    ui.noteChips = chips(K.pitchNames, -1, (i) => {
      if (A.notes.includes(i)) { if (A.notes.length > 1) A.notes = A.notes.filter((n) => n !== i); } else A.notes = [...A.notes, i];
      if (!A.notes.includes(A.root)) A.root = A.notes[0];
      paintChord();
    });
    body.appendChild(ui.noteChips.root);
    ui.notesNote = note("");
    body.appendChild(ui.notesNote);
    /* how it plays */
    body.appendChild(head("Play style"));
    body.appendChild(el("div", "lb-note", "Pattern"));
    ui.dir = chips(K.dirs.map((d) => ({ t: d.name, s: d.note })), A.dir, (i) => { A.dir = i; });
    body.appendChild(ui.dir.root);
    ui.dirNote = note("CHORD plays all notes at once, held for as long as the sample is. The others lay the notes out in time as an arp.");
    body.appendChild(ui.dirNote);
    body.appendChild(el("div", "lb-note", "Rate"));
    ui.rate = chips(K.rates.map((r) => r.name), A.rate, (i) => { A.rate = i; });
    body.appendChild(ui.rate.root);
    body.appendChild(el("div", "lb-note", "Gate (how long each note lasts)"));
    ui.gate = chips(K.gates, A.gate, (i) => { A.gate = i; });
    body.appendChild(ui.gate.root);
    body.appendChild(el("div", "lb-note", "Swing"));
    ui.swing = chips(K.swings.map((s) => s.name), A.swing, (i) => { A.swing = i; });
    body.appendChild(ui.swing.root);
    const num = (label, get, fmt, lo, hi, set) => stepper(label, get, fmt, (d) => { set(Math.min(Math.max(get() + d, lo), hi)); paintChord(); });
    ui.oct = num("Octaves", () => A.octaves, (v) => v, 1, 3, (v) => { A.octaves = v; });
    ui.shift = num("Shift", () => A.shift, (v) => (v > 0 ? "+" : "") + v + " oct", -2, 2, (v) => { A.shift = v; });
    ui.bars = num("Bars", () => A.bars, (v) => v, 1, 8, (v) => { A.bars = v; });
    ui.bpm = stepper("Tempo", () => A.bpm || L.info.tempo, (v) => v + " BPM", (d) => { A.bpm = Math.min(Math.max((A.bpm || L.info.tempo) + d * 2, 40), 240); paintChord(); });
    body.appendChild(row("lb-wrap", ui.oct.root, ui.shift.root));
    body.appendChild(row("lb-wrap", ui.bars.root, ui.bpm.root));
    body.appendChild(row("lb-wrap",
      btn("▶ HEAR IT", "go", () => { if (needPad()) hear(arpOf()); }),
      btn("PUT ON A PAD…", "", async () => {
        if (!needPad()) return;
        const n = await choosePad("Put the chord or arp on which pad?", L.pad);
        if (n < 0) return;
        try { await toPad(arpOf(), ((A.dir === 0 ? "CHORD " : "ARP ") + A.notes.map((x) => K.pitchNames[x]).join("")).slice(0, 23), n); say("It is on " + padLabel(n)); } catch (e) { say(String(e.message || e), "err"); }
      }),
      btn("NEW SEED", "", () => { A.seed = (Math.random() * 1e6) | 0; say("Seed " + A.seed + " (only the RANDOM pattern uses it)"); })));
    /* variations */
    body.appendChild(head("Arp variations"));
    body.appendChild(note("Different ways to play the chord above: the first twelve are classic patterns, the rest are random mixes. Hear them, keep the ones you like."));
    ui.count = chips(["4", "8", "12", "16", "24"], 1, (i) => { A.vcount = [4, 8, 12, 16, 24][i]; });
    body.appendChild(ui.count.root);
    body.appendChild(row("lb-wrap", btn("MAKE VARIATIONS", "go", () => variants(false)), btn("NEW SET", "", () => variants(true)), btn("ALL TO FREE PADS…", "", allVariantsToPads)));
    ui.vlist = el("div", "lb-cards");
    body.appendChild(ui.vlist);
    /* kit */
    body.appendChild(head("Chord kit"));
    body.appendChild(note("The seven chords of a scale, one on each pad, so you can play a progression on the pads. Built from the sample and the settings above (held chords, one octave)."));
    body.appendChild(el("div", "lb-note", "Key"));
    ui.kitRoot = chips(K.pitchNames, A.kitRoot, (i) => { A.kitRoot = i; });
    body.appendChild(ui.kitRoot.root);
    body.appendChild(el("div", "lb-note", "Scale"));
    ui.kitScale = chips(K.kitScales.map((s) => s.name), A.kitScale, (i) => { A.kitScale = i; });
    body.appendChild(ui.kitScale.root);
    ui.kitSev = chips(["triads", "sevenths"], 0, (i) => { A.kitSev = i === 1; });
    body.appendChild(ui.kitSev.root);
    ui.kitList = note("");
    body.appendChild(ui.kitList);
    body.appendChild(btn("BUILD THE KIT ON PADS…", "go", buildKit));
    /* progression */
    body.appendChild(head("Progression pattern"));
    ui.kitPadsNote = note("");
    body.appendChild(ui.kitPadsNote);
    ui.prog = chips(K.progressions.map((p) => ({ t: p.name, s: p.note })), A.prog, (i) => { A.prog = i; ui.progNote.textContent = K.progressions[i].note + " (written for " + K.progressions[i].scale + ")"; });
    body.appendChild(ui.prog.root);
    ui.progNote = note(K.progressions[0].note + " (written for " + K.progressions[0].scale + ")");
    body.appendChild(ui.progNote);
    body.appendChild(el("div", "lb-note", "Rhythm"));
    ui.rhythm = chips(K.rhythms, A.rhythm, (i) => { A.rhythm = i; });
    body.appendChild(ui.rhythm.root);
    body.appendChild(el("div", "lb-note", "Length"));
    ui.pbars = chips(["1 bar", "2 bars", "4 bars", "8 bars"], 2, (i) => { A.pbars = [1, 2, 4, 8][i]; });
    body.appendChild(ui.pbars.root);
    body.appendChild(el("div", "lb-note", "Humanize"));
    ui.human = chips(["off", "light", "medium", "loose"], 0, (i) => { A.human = [0, 25, 50, 100][i]; });
    body.appendChild(ui.human.root);
    ui.ppat = btn("Pattern A1", "", async () => {
      const n = await choosePad("Write the progression into which pattern? (the pattern of that pad)", A.ppat - 1, { hint: "It replaces that pattern." });
      if (n >= 0) { A.ppat = n + 1; paintChord(); }
    });
    body.appendChild(row("lb-wrap", el("span", "lb-note", "Into:"), ui.ppat));
    body.appendChild(row("lb-wrap", btn("WRITE THE PATTERN", "", () => writeProgression(false)), btn("WRITE AND OPEN IT", "go", () => writeProgression(true))));
    body.appendChild(note("Chords are made by pitching the sample like the unit's chromatic mode does, so the result depends on the sample: sustained sounds (keys, pads, strings) work best, drums do not. Not tested on a real SP-404MKII yet."));
    ui.names.chord = (a) => a.notes.map((n) => K.pitchNames[n]).join(" ");
    paintChord();
  }
  return {
    root,
    async use(n) { if (K) { A.pad = n; paintChord(); } else { A.pad = n; } },
    async show() {
      if (!L.info || !L.info.open) { body.textContent = ""; body.appendChild(note("Open or start a project first (PROJECT).")); K = null; return; }
      if (!K) await init();
      if (A.pad < 0 || !L.info.pads[A.pad].file) A.pad = L.info.pads[L.pad].file ? L.pad : -1;
      if (!A.bpm) A.bpm = Math.round(L.info.tempo);
      paintChord();
    },
  };
}
export { build };
