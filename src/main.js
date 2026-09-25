import { EFFECTS, BUS_TABLES, CAT_LABELS, CAT_ORDER } from "./data/effects-db.js";

/* 404 Busdriver - app logic. One IIFE, no dependencies.
   MIDI spec (SP-404MK2 v5, MIDI Mode B): CH 1-5 = BUS1-4 + INPUT.
   CC#19 EFX switch (0-63 off / 64-127 on), CC#83 EFX number,
   CC#16/17/18/80/81/82 = Ctrl 1-6. Bidirectional. No SysEx. */
(function () {
"use strict";

const BUILD = "2026-07-25.19"; /* bump on deploy - shown in Setup to spot stale caches */
const LAST_CHANGED = "2026-08-31 (a241f90)"; /* date + short git hash of the last commit;
   stamped by a follow-up commit right after the real one lands, since a commit can't
   contain its own hash - shown in Setup so anyone can tell exactly which commit they're
   running */

/* ===== 02 UTIL ===== */
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const PHONE = window.matchMedia("(max-width: 520px)");

const CC_CTRL = [16, 17, 18, 80, 81, 82];
const CC_SW = 19, CC_FX = 83;
const RECV_CCS = new Set([16, 17, 18, 19, 80, 81, 82, 83]);
const BUSES = [
  { label: "BUS 1", short: "1", ch: 0, table: "bus12" },
  { label: "BUS 2", short: "2", ch: 1, table: "bus12" },
  { label: "BUS 3", short: "3", ch: 2, table: "bus34" },
  { label: "BUS 4", short: "4", ch: 3, table: "bus34" },
  { label: "INPUT", short: "IN", ch: 4, table: "input" },
];
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/* ===== 03 CONV : cc 0-127 <-> display ===== */
function fxNameFor(table, num) {
  const t = BUS_TABLES[table];
  return (num >= 0 && num < t.length) ? t[num] : "?" + num;
}
function fxDefFor(table, num) {
  const name = fxNameFor(table, num);
  if (num === 0) return null;
  if (name.startsWith("Direct FX")) {
    /* if the user told us what sits on this DFX slot, use the real effect */
    const a = (table === "bus12") ? directName(num) : null;
    return EFFECTS[a || "Direct FX"] || null;
  }
  return EFFECTS[name] || null;
}
const enumFromCc = (cc, n) => Math.min(n - 1, Math.floor(cc * n / 128));
const ccFromEnum = (i, n) => Math.floor((2 * i + 1) * 64 / n); /* zone center */

function dispFromCc(p, cc, syncOn) {
  switch (p.t) {
    case "b": return cc >= 64 ? "ON" : "OFF";
    case "e": return p.v[enumFromCc(cc, p.v.length)];
    case "bal": { const w = Math.round(cc * 100 / 127); return (100 - w) + ":" + w; }
    case "pan": { const v = Math.round(cc * 100 / 127) - 50; return v < 0 ? "L" + (-v) : v > 0 ? "R" + v : "CTR"; }
    case "nt": return NOTE_NAMES[cc % 12] + (Math.floor(cc / 12) - 1);
    case "c": default: {
      if (p.sv && syncOn) {
        if (Array.isArray(p.sv)) return p.sv[enumFromCc(cc, p.sv.length)];
        const v = p.sv.hi + (p.sv.lo - p.sv.hi) * cc / 127;
        return v.toFixed(3) + " " + p.sv.u;
      }
      if (p.inf && cc === 0) return "-INF";
      const v = p.a + (p.b - p.a) * cc / 127;
      const span = Math.abs(p.b - p.a);
      const dec = span >= 20 ? 0 : span >= 2 ? 1 : span >= 0.5 ? 2 : 3;
      const f = Math.pow(10, dec);
      const s = String(Math.round(v * f) / f);
      return p.u ? s + " " + p.u : s;
    }
  }
}
function ccFromDefault(p) {
  switch (p.t) {
    case "b": return p.d ? 127 : 0;
    case "e": return ccFromEnum(p.d, p.v.length);
    case "bal": return Math.round(p.d * 127 / 100);
    case "pan": return Math.round((p.d + 50) * 127 / 100);
    case "nt": return clamp(p.d, 0, 127);
    case "c": default: return clamp(Math.round((p.d - p.a) / (p.b - p.a) * 127), 0, 127);
  }
}
function defaultCcs(def) {
  const out = [64, 64, 64, 64, 64, 64];
  if (def) def.p.forEach((p, i) => { if (i < 6) out[i] = ccFromDefault(p); });
  return out;
}
/* inverse of dispFromCc - lets the Recipe editor accept the same units a
   recipe card prints (dB, ms, %, note names, ...) instead of raw 0-127,
   which is the entire point of typing a card in directly. Mirrors
   dispFromCc's branches; returns null for anything unparseable so the
   caller can leave the field alone rather than write garbage. */
function ccFromDisp(p, v, syncOn) {
  switch (p.t) {
    case "b": return /^(on|1|true|yes)$/i.test(String(v).trim()) ? 127 : 0;
    case "e": {
      const s = String(v).trim().toLowerCase();
      const i = p.v.findIndex((o) => o.toLowerCase() === s);
      if (i >= 0) return ccFromEnum(i, p.v.length);
      const n = Number(v);
      return Number.isFinite(n) ? ccFromEnum(clamp(Math.round(n), 0, p.v.length - 1), p.v.length) : null;
    }
    case "bal": {
      /* accepts the app's own "50:50" display format (right side is what
         matters) as well as a recipe card's likely "80/20" and a bare
         number, so whatever's printed on a card round-trips */
      const s = String(v).trim();
      const m = s.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
      const n = m ? Number(m[2]) : Number(s);
      return Number.isFinite(n) ? clamp(Math.round(n * 127 / 100), 0, 127) : null;
    }
    case "pan": {
      /* accepts the app's own "L12"/"R12"/"CTR" display format as well as
         a bare signed number */
      const s = String(v).trim().toUpperCase();
      let n;
      if (s === "CTR" || s === "C" || s === "0") n = 0;
      else if (s.startsWith("L")) n = -Number(s.slice(1));
      else if (s.startsWith("R")) n = Number(s.slice(1));
      else n = Number(s);
      return Number.isFinite(n) ? clamp(Math.round((n + 50) * 127 / 100), 0, 127) : null;
    }
    case "nt": { const n = Number(v); return Number.isFinite(n) ? clamp(Math.round(n), 0, 127) : null; }
    case "c": default: {
      if (p.sv && syncOn) {
        if (Array.isArray(p.sv)) {
          const s = String(v).trim().toLowerCase();
          const i = p.sv.findIndex((o) => o.toLowerCase() === s);
          if (i >= 0) return ccFromEnum(i, p.sv.length);
        } else {
          /* continuous {hi,lo,u} bar-multiplier range (Phaser/Flanger/Wah/
             Tremolo RATE when synced) - inverse of dispFromCc's own v =
             hi + (lo-hi)*cc/127 */
          const n = Number(v);
          if (Number.isFinite(n)) return clamp(Math.round((n - p.sv.hi) / (p.sv.lo - p.sv.hi) * 127), 0, 127);
        }
      }
      const n = Number(v);
      return Number.isFinite(n) ? clamp(Math.round((n - p.a) / (p.b - p.a) * 127), 0, 127) : null;
    }
  }
}
function syncOnFor(bus, def) {
  /* is the SYNC bool of this effect currently ON? */
  if (!def) return false;
  const i = def.p.findIndex((p) => p.n === "SYNC" && p.t === "b");
  return i >= 0 && state.buses[bus].cc[i] >= 64;
}
/* same question, but for an offline cc array (the Recipe editor's draft
   isn't in state.buses yet) */
function syncOnForCc(def, cc) {
  if (!def) return false;
  const i = def.p.findIndex((p) => p.n === "SYNC" && p.t === "b");
  return i >= 0 && cc[i] >= 64;
}

/* factory-shipped recipes: SP-404 "FX Recipe" cards from
   electronoir.gumroad.com (@noirtdc), transcribed straight from their own
   printed values. Each bus spec lists only the fields the card actually
   gives; everything else keeps that effect's own real default (via
   defaultCcs), never a generic 64. Values go through ccFromDisp so they
   land on exactly what the card intends (dB, Hz, note values, "L10"/"R10",
   ratio splits, ...) instead of being hand-rounded here. A few cards give
   a *range* for a field ("10 to 20") rather than one number - those are
   meant as a live-tweak/automation range, not a fixed setting, so the
   midpoint is used as a starting value; still fully editable afterward
   like any recipe. The blank INPUT bus at the end of every chain is left
   alone since none of these use it. */
function buildFactoryBus(table, fxName, vals) {
  const num = BUS_TABLES[table].indexOf(fxName);
  const def = fxDefFor(table, num);
  const cc = defaultCcs(def);
  Object.keys(vals).forEach((n) => {
    const i = def.p.findIndex((p) => p.n === n);
    if (i < 0) return;
    const v = ccFromDisp(def.p[i], vals[n], syncOnForCc(def, cc));
    if (v != null) cc[i] = v;
  });
  return { fx: num, cc, on: true };
}
const BLANK_BUS = { fx: 0, cc: [64, 64, 64, 64, 64, 64], on: false };
const FACTORY_RECIPES = [
  {
    id: "rc-house-chord-synth",
    name: "House Chord Synth (noir)",
    buses: () => [
      /* Overdrive -> Chorus -> Chromatic PS -> SX Reverb. Chromatic PS
         does the actual "chord": +12/+7 semitones (octave + fifth) panned
         apart, turning one held note into a chord-like stack. */
      buildFactoryBus("bus12", "Overdrive", { DRIVE: 32, TONE: 67, BALANCE: "80/20", LEVEL: 80 }),
      buildFactoryBus("bus12", "Chorus", { DEPTH: 35, RATE: 1.20, "EQ LOW": -15, "EQ HIGH": 3, BALANCE: "80/20", LEVEL: 100 }),
      buildFactoryBus("bus34", "Chromatic PS", { PITCH1: 12, PITCH2: 7, PAN1: "L10", PAN2: "R10", BALANCE: "70/30" }),
      buildFactoryBus("bus34", "SX Reverb", { TIME: 100, TONE: 100, BALANCE: "70/30" }),
      BLANK_BUS,
    ],
  },
  {
    id: "rc-quack-bass",
    name: "\"Quack\" Bass (noir)",
    buses: () => [
      buildFactoryBus("bus12", "Super Filter", { CUTOFF: 36, RESONANCE: 32, "FLT TYPE": "LPF", DEPTH: 100, SYNC: "ON", RATE: "1/2" }),
      buildFactoryBus("bus12", "Phaser", { DEPTH: 29, RESONANCE: 24, MANUAL: 59, SYNC: "ON", RATE: 0.016, BALANCE: "50/50" }),
      buildFactoryBus("bus34", "Compressor", { SUSTAIN: 12, ATTACK: 61, RATIO: 15, LEVEL: 100 }), /* RATIO: card says "10 to 20" */
      buildFactoryBus("bus34", "Reverb", { TYPE: "HALL2", TIME: 60, LEVEL: 47, "LOW CUT": "315", "HIGH CUT": "5000" }),
      BLANK_BUS,
    ],
  },
  {
    id: "rc-risers",
    name: "Risers (noir)",
    buses: () => [
      buildFactoryBus("bus12", "Super Filter", { CUTOFF: 59, RESONANCE: 0, "FLT TYPE": "HPF", DEPTH: 0, SYNC: "OFF", RATE: 0 }),
      buildFactoryBus("bus12", "Tremolo/Pan", { DEPTH: 36, WAVE: "TRI", TYPE: "PAN", SYNC: "ON", RATE: 0.300 }),
      buildFactoryBus("bus34", "Overdrive", { DRIVE: 70, TONE: 40, BALANCE: "90/10", LEVEL: 100 }),
      buildFactoryBus("bus34", "Ha-Dou", { "MOD DEPTH": 18, TIME: 100, LEVEL: 90, "LOW CUT": "250", "HIGH CUT": "5000" }),
      BLANK_BUS,
    ],
  },
  {
    id: "rc-bass-destroyer",
    name: "Bass Destroyer (noir)",
    buses: () => [
      buildFactoryBus("bus12", "Super Filter", { CUTOFF: 5, RESONANCE: 30, "FLT TYPE": "HPF" }), /* CUTOFF: card says "1 to 10" */
      buildFactoryBus("bus12", "Distortion", { DRIVE: 48, TONE: -100, BALANCE: "90/10", LEVEL: 100 }),
      buildFactoryBus("bus34", "JUNO Chorus", { MODE: "JX-1 2", NOISE: 0, BALANCE: "90/10" }),
      buildFactoryBus("bus34", "Compressor", { SUSTAIN: 10, ATTACK: 47, RATIO: 8, LEVEL: 100 }),
      BLANK_BUS,
    ],
  },
  {
    id: "rc-techno-kick-fattener",
    name: "Techno Kick Fattener (noir)",
    buses: () => [
      /* CUTOFF/RESONANCE: card says "5 to 10" / "15 to 25" */
      buildFactoryBus("bus12", "Super Filter", { CUTOFF: 8, RESONANCE: 20, "FLT TYPE": "HPF" }),
      buildFactoryBus("bus12", "Equalizer", { "LOW GAIN": 4, "LOW FREQ": "100", "MID GAIN": -3, "MID FREQ": "200", "HIGH GAIN": 2, "HIGH FREQ": "2000" }),
      buildFactoryBus("bus34", "Lo-fi", { "PRE FILT": 1, "LOFI TYPE": 9, TONE: 50, CUTOFF: "8000", BALANCE: "45/55", LEVEL: 100 }),
      /* SUSTAIN/ATTACK/RATIO: card says "5 to 10" / "50 to 70" / "2 to 4" */
      buildFactoryBus("bus34", "Compressor", { SUSTAIN: 8, ATTACK: 60, RATIO: 3 }),
      BLANK_BUS,
    ],
  },
  {
    id: "rc-top-loops-sauce",
    name: "Top Loops Sauce (noir)",
    buses: () => [
      buildFactoryBus("bus12", "Super Filter", { CUTOFF: 50, RESONANCE: 0, "FLT TYPE": "HPF", DEPTH: 0 }),
      buildFactoryBus("bus12", "Tremolo/Pan", { DEPTH: 76, WAVE: "TRI", TYPE: "PAN", SYNC: "ON", RATE: 0.175 }), /* RATE: card says "0.150 to 0.200" */
      buildFactoryBus("bus34", "Crusher", { FILTER: 9000, RATE: 0, BALANCE: "70/30" }), /* FILTER: card says "6000 to 12000" */
      /* L/H DAMP F: card gives a range too wide for exact enum entries -
         nearest available option within it */
      buildFactoryBus("bus34", "Sync Delay", { TIME: "1/8D", FEEDBACK: 30, LEVEL: 30, "L DAMP F": "630", "H DAMP F": "6300" }),
      BLANK_BUS,
    ],
  },
];

/* ===== 04 STORE ===== */
const LS_KEY = "busdriver.v1";
let state = {
  activeBus: 0,
  buses: BUSES.map(() => ({ on: false, fx: 0, cc: [64, 64, 64, 64, 64, 64] })),
  mem: {},           /* "bus12:16" -> [6 cc] */
  favs: { bus12: {}, bus34: {}, input: {} }, /* num -> {on, t}; tombstones for sync */
  recents: { bus12: [], bus34: [], input: [] },
  snapshots: [null, null, null, null, null, null, null, null], /* {t, name, buses} | {t, del} */
  directFx: [null, null, null, null, null], /* mirrors device DFX slots: {name|null, t} */
  xy: { x: null, y: null, mom: false }, /* axis -> {bus, slot} | null; device-local */
  lfos: [ /* 4 modulator slots; slot 4 preset = slow RND drift */
    { target: null, wave: 0, rate: 4, depth: 1 },
    { target: null, wave: 0, rate: 3, depth: 1 },
    { target: null, wave: 0, rate: 2, depth: 1 },
    { target: null, wave: 4, rate: 0, depth: 0 },
  ],
  tapBpm: 120,
  ptn: { bank: 0, last: null },
  play: { mode: "keys", target: "sample", oct: 0, padBank: 0, padChPair: 0,
    scaleRoot: 0, scaleType: 0, iso: true,
    custom: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null] },
  midi: { outName: null, inName: null },
  wake: false,
  horizFaders: false, /* Setup toggle: sideways-drag full-width fader strips */
  jamKnobs: false, /* Setup toggle: rotary knobs instead of bars for JAM faders */
  theme: "dark", /* Setup toggle: "dark" | "light" */
  jam: { slots: [] }, /* JAM tab: user-programmable pinned bus params + raw MIDI */
  xyPresets: [], /* XY tab: user-saved axis combos, { id, name, x:{bus,slot}, y:{bus,slot}, mom } */
  recipes: FACTORY_RECIPES.map((r) => ({ id: r.id, name: r.name, buses: r.buses() })), /* full 5-bus presets typed in from recipe cards, { id, name, buses:[{fx,cc[6],on} x5] } */
};
function directName(num) { /* num = CC#83 value 1..5 in the bus12 table */
  const r = state.directFx[num - 1];
  return (r && r.name) ? r.name : null;
}
function fxDisplayName(table, num) {
  const name = fxNameFor(table, num);
  if (table === "bus12" && num >= 1 && num <= 5) {
    const a = directName(num);
    if (a) return "DFX" + num + " · " + a;
  }
  return name;
}
function setDirectFx(i, name) {
  state.directFx[i] = { name: name || null, t: Date.now() };
  saveState(); scheduleSync();
  renderBus(0); renderBus(1); /* both buses share the bus12 table */
  renderSetup();
}
function assignableNames() {
  const set = new Set([...BUS_TABLES.bus12, ...BUS_TABLES.bus34]);
  set.delete("(OFF)");
  for (const n of [...set]) if (n.startsWith("Direct FX")) set.delete(n);
  return [...set];
}
function isFav(table, num) { const r = state.favs[table][num]; return !!(r && r.on); }
function favList(table) {
  return Object.keys(state.favs[table]).map(Number).filter((n) => isFav(table, n)).sort((a, b) => a - b);
}
let allOffSaved = null; /* [bool x5] while ALL OFF armed */

const JAM_MAX = 24;
/* validates + clamps a JAM slot loaded from storage/import; returns null to
   drop anything malformed rather than let a corrupt slot crash rendering */
function sanitizeJamSlot(c) {
  if (!c || typeof c !== "object") return null;
  if (c.kind !== "pad" && c.kind !== "fader") return null;
  if (c.source !== "bus" && c.source !== "raw" && c.source !== "scene") return null;
  const o = {
    id: (typeof c.id === "string" && c.id) ? c.id : "j" + Date.now() + Math.random().toString(36).slice(2, 7),
    kind: c.kind, source: c.source,
    label: (typeof c.label === "string" ? c.label : "").slice(0, 16),
  };
  if (o.source === "scene") {
    /* momentary/toggle recall of one bus's full state (fx + 6 cc + on/off) -
       always a pad, a captured effect can't be smoothly dragged like a
       single CC can */
    if (!(c.bus >= 0 && c.bus < 5)) return null;
    o.kind = "pad";
    o.bus = c.bus | 0;
    o.fx = clamp(c.fx | 0, 0, 127);
    o.cc = Array.isArray(c.cc) && c.cc.length === 6 ? c.cc.map((v) => clamp(v | 0, 0, 127)) : [64, 64, 64, 64, 64, 64];
    o.on = !!c.on;
    o.mode = c.mode === "toggle" ? "toggle" : "momentary";
    return o;
  }
  if (o.source === "bus") {
    if (!(c.bus >= 0 && c.bus < 5)) return null;
    if (!(c.ctrl >= 0 && c.ctrl < 6)) return null;
    o.bus = c.bus | 0; o.ctrl = c.ctrl | 0;
  } else {
    o.port = (typeof c.port === "string" && c.port) ? c.port : null;
    o.ch = clamp(c.ch | 0, 0, 15);
    o.type = ["cc", "note", "pc"].indexOf(c.type) >= 0 ? c.type : "cc";
    if (o.kind === "fader") o.type = "cc"; /* only CC is continuous */
    o.num = clamp(c.num | 0, 0, 127);
    o.val = clamp((c.val != null ? c.val : 64) | 0, 0, 127);
  }
  if (o.kind === "pad") {
    o.mode = (c.mode === "momentary" || o.type === "pc") ? "momentary" : "toggle";
    o.onVal = clamp((c.onVal != null ? c.onVal : 127) | 0, 0, 127);
    o.offVal = clamp((c.offVal != null ? c.offVal : 0) | 0, 0, 127);
    o.vel = clamp((c.vel != null ? c.vel : 110) | 0, 1, 127);
  }
  return o;
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.v !== 1) return;
    for (let i = 0; i < 5; i++) {
      const b = s.buses && s.buses[i];
      if (b && Array.isArray(b.cc) && b.cc.length === 6) {
        state.buses[i] = { on: !!b.on, fx: b.fx | 0, cc: b.cc.map((v) => clamp(v | 0, 0, 127)) };
      }
    }
    if (s.mem) state.mem = s.mem;
    if (s.favs) for (const tbl of ["bus12", "bus34", "input"]) {
      const f = s.favs[tbl];
      if (Array.isArray(f)) { /* migrate pre-sync array shape */
        const m = {}; f.forEach((n) => { m[n] = { on: true, t: 1 }; });
        state.favs[tbl] = m;
      } else if (f && typeof f === "object") state.favs[tbl] = f;
    }
    if (Array.isArray(s.snapshots)) {
      for (let i = 0; i < 8; i++) {
        const r = s.snapshots[i];
        if (r && typeof r.t === "number") state.snapshots[i] = r;
      }
    }
    if (Array.isArray(s.directFx)) {
      for (let i = 0; i < 5; i++) {
        const r = s.directFx[i];
        if (r && typeof r.t === "number") state.directFx[i] = r;
      }
    }
    if (s.xy && typeof s.xy === "object") {
      for (const ax of ["x", "y"]) {
        const r = s.xy[ax];
        if (r && r.bus >= 0 && r.bus < 5 && r.slot >= 0 && r.slot < 6) state.xy[ax] = { bus: r.bus | 0, slot: r.slot | 0 };
      }
      state.xy.mom = !!s.xy.mom;
    }
    const lfoSrcs = Array.isArray(s.lfos) ? s.lfos : (s.lfo ? [s.lfo] : []);
    lfoSrcs.slice(0, 4).forEach((l, i) => {
      if (!l || typeof l !== "object") return;
      if (l.target && l.target.bus >= 0 && l.target.bus < 5 && l.target.slot >= 0 && l.target.slot < 6)
        state.lfos[i].target = { bus: l.target.bus | 0, slot: l.target.slot | 0 };
      if (l.wave >= 0 && l.wave < 5) state.lfos[i].wave = l.wave | 0;
      if (l.rate >= 0 && l.rate < 7) state.lfos[i].rate = l.rate | 0;
      if (l.depth >= 0 && l.depth < 4) state.lfos[i].depth = l.depth | 0;
    });
    const tb = s.tapBpm || (s.lfo && s.lfo.tapBpm);
    if (tb >= 30 && tb <= 300) state.tapBpm = tb;
    if (s.play && typeof s.play === "object") {
      if (s.play.mode === "pads" || s.play.mode === "scale") state.play.mode = s.play.mode;
      if (s.play.target === "voc") state.play.target = "voc";
      if (s.play.scaleRoot >= 0 && s.play.scaleRoot < 12) state.play.scaleRoot = s.play.scaleRoot | 0;
      if (s.play.scaleType >= 0 && s.play.scaleType < 7) state.play.scaleType = s.play.scaleType | 0;
      if (typeof s.play.iso === "boolean") state.play.iso = s.play.iso;
      if (typeof s.play.oct === "number") state.play.oct = clamp(s.play.oct | 0, -2, 2);
      if (s.play.padBank >= 0 && s.play.padBank <= 10) state.play.padBank = s.play.padBank | 0;
      if (s.play.padChPair >= 0 && s.play.padChPair < 10) state.play.padChPair = s.play.padChPair | 0;
      if (Array.isArray(s.play.custom)) for (let i = 0; i < 16; i++) {
        const c = s.play.custom[i];
        if (c && c.bank >= 0 && c.bank < 10 && c.pad >= 1 && c.pad <= 16)
          state.play.custom[i] = { bank: c.bank | 0, pad: c.pad | 0 };
      }
    }
    if (s.ptn && typeof s.ptn === "object") {
      if (s.ptn.bank >= 0 && s.ptn.bank < 10) state.ptn.bank = s.ptn.bank | 0;
      if (s.ptn.last && s.ptn.last.bank >= 0 && s.ptn.last.bank < 10 && s.ptn.last.pc >= 0 && s.ptn.last.pc < 16)
        state.ptn.last = { bank: s.ptn.last.bank | 0, pc: s.ptn.last.pc | 0 };
    }
    if (s.recents) state.recents = Object.assign(state.recents, s.recents);
    if (s.midi) state.midi = Object.assign(state.midi, s.midi);
    state.wake = !!s.wake;
    state.horizFaders = !!s.horizFaders;
    state.jamKnobs = !!s.jamKnobs;
    if (s.theme === "light" || s.theme === "dark") state.theme = s.theme;
    if (s.jam && Array.isArray(s.jam.slots)) {
      state.jam.slots = s.jam.slots.map(sanitizeJamSlot).filter(Boolean).slice(0, JAM_MAX);
    }
    if (Array.isArray(s.xyPresets)) {
      state.xyPresets = s.xyPresets.map(sanitizeXyPreset).filter(Boolean).slice(0, XY_PRESETS_MAX);
    }
    if (Array.isArray(s.recipes)) {
      state.recipes = s.recipes.map(sanitizeRecipe).filter(Boolean).slice(0, RECIPE_MAX);
    }
    /* one-time backfill: storage saved before a given factory recipe
       existed (even just an empty recipes:[] from opening the panel once)
       would otherwise silently override the in-code default above and
       that card would never actually show up. Runs per-recipe so cards
       added in a later update still get backfilled without duplicating
       ones the user already has. */
    const missing = FACTORY_RECIPES.filter((r) => !state.recipes.some((sr) => sr.id === r.id));
    if (missing.length) {
      state.recipes = [...missing.map((r) => ({ id: r.id, name: r.name, buses: r.buses() })), ...state.recipes].slice(0, RECIPE_MAX);
      saveState(); /* don't depend on some later, unrelated action to persist this */
    }
  } catch (e) { /* corrupt storage: start fresh */ }
}
let saveTimer = null;
function writeState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, buses: state.buses, mem: state.mem, favs: state.favs, recents: state.recents, snapshots: state.snapshots, directFx: state.directFx, xy: state.xy, lfos: state.lfos, tapBpm: state.tapBpm, ptn: state.ptn, play: state.play, midi: state.midi, wake: state.wake, horizFaders: state.horizFaders, jamKnobs: state.jamKnobs, jam: state.jam, xyPresets: state.xyPresets, recipes: state.recipes, theme: state.theme }));
  } catch (e) { /* quota/private mode: ignore */ }
}
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeState(); }, 400);
}
function flushState() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeState(); }
}

/* ===== 05 MIDI (transport seam: all bytes leave through sendBytes,
        arrive through handleBytes - a future WebSocket bridge plugs in here) ===== */
const Midi = {
  access: null, demo: false,
  echoLog: new Map(), lastSent: new Map(),
  activeCCs: new Set(), /* keys ch<<8|cc currently owned by a finger */
  /* state check tolerant of shims that report undefined instead of "connected" */
  live(p) { return p && p.state !== "disconnected"; },
  out() {
    if (!this.access || !state.midi.outName) return null;
    let found = null;
    this.access.outputs.forEach((p) => { if (!found && p.name === state.midi.outName && this.live(p)) found = p; });
    return found;
  },
  in_() {
    if (!this.access || !state.midi.inName) return null;
    let found = null;
    this.access.inputs.forEach((p) => { if (!found && p.name === state.midi.inName && this.live(p)) found = p; });
    return found;
  },
  /* any currently-connected output by name - lets custom controls (JAM tab)
     target a second device (e.g. an MC-101) simultaneously with the SP-404,
     which stays bound to state.midi.outName via out() as before */
  outByName(name) {
    if (!this.access) return null;
    let found = null;
    this.access.outputs.forEach((p) => { if (!found && p.name === name && this.live(p)) found = p; });
    return found;
  },
  sendBytesTo(portName, bytes) {
    if (this.demo) return true;
    const o = portName ? this.outByName(portName) : this.out();
    if (!o) return false;
    try { o.send(bytes); return true; } catch (e) { return false; }
  },
  sendBytes(bytes) { return this.sendBytesTo(null, bytes); },
  sendPc(ch, pc) {
    const ok = this.sendBytes([0xC0 | ch, pc & 0x7F]);
    if (ok) blinkTx();
    return ok;
  },
  sendNote(ch, note, on, vel) {
    const ok = this.sendBytes(on ? [0x90 | ch, note & 0x7F, vel || 110] : [0x80 | ch, note & 0x7F, 0]);
    if (ok) blinkTx();
    return ok;
  },
  sendBend(ch, v14) { /* 0..16383, center 8192 */
    v14 = clamp(v14 | 0, 0, 16383);
    if (this.sendBytes([0xE0 | ch, v14 & 0x7F, v14 >> 7])) blinkTx();
  },
  send(ch, ccNum, val, force) {
    val = clamp(val | 0, 0, 127);
    const key = ch << 8 | ccNum;
    if (!force && this.lastSent.get(key) === val) return;
    this.lastSent.set(key, val);
    this.echoLog.set(key, { val, t: performance.now() });
    if (this.sendBytes([0xB0 | ch, ccNum, val])) blinkTx();
  },
  /* -To variants: same messages, but routed to an explicit port name
     (null = primary SP-404 output) instead of always the primary port */
  sendToPort(portName, ch, ccNum, val) {
    val = clamp(val | 0, 0, 127);
    /* log to echoLog same as send() - lets applyRawCC recognize this value
       bouncing back from a device that echoes its own incoming CCs, instead
       of misreading it as an external change a moment later */
    this.echoLog.set(ch << 8 | ccNum, { val, t: performance.now() });
    if (this.sendBytesTo(portName, [0xB0 | ch, ccNum, val])) blinkTx();
  },
  sendNoteTo(portName, ch, note, on, vel) {
    if (this.sendBytesTo(portName, on ? [0x90 | ch, note & 0x7F, vel || 110] : [0x80 | ch, note & 0x7F, 0])) blinkTx();
  },
  sendPcTo(portName, ch, pc) {
    if (this.sendBytesTo(portName, [0xC0 | ch, pc & 0x7F])) blinkTx();
  },
  async connect(interactive) {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      if (interactive) showBanner("MIDI access denied - check browser permission", "warn", 5000);
      updateConnUi(); renderSetup();
      return;
    }
    this.access.onstatechange = () => { this.refreshPorts(); };
    this.refreshPorts();
  },
  refreshPorts() {
    if (!this.access) return;
    const outs = [], ins = [];
    this.access.outputs.forEach((p) => { if (this.live(p)) outs.push(p); });
    this.access.inputs.forEach((p) => { if (this.live(p)) ins.push(p); });
    /* auto-match: the SP-404 wins as soon as it shows up - virtual fallback
       ports (e.g. the shim's own MIDIWeb pair) are only kept while the
       device is absent, so stale selections never swallow sends */
    const spOut = outs.find((p) => /sp-?404/i.test(p.name));
    if (spOut && !/sp-?404/i.test(state.midi.outName || "")) state.midi.outName = spOut.name;
    if (!outs.some((p) => p.name === state.midi.outName)) {
      state.midi.outName = spOut ? spOut.name : (outs.length === 1 ? outs[0].name : state.midi.outName);
    }
    const spIn = ins.find((p) => /sp-?404/i.test(p.name));
    if (spIn && !/sp-?404/i.test(state.midi.inName || "")) state.midi.inName = spIn.name;
    if (!ins.some((p) => p.name === state.midi.inName)) {
      const cand = ins.find((p) => p.name === state.midi.outName);
      state.midi.inName = cand ? cand.name : spIn ? spIn.name : (ins.length === 1 ? ins[0].name : state.midi.inName);
    }
    /* bind ALL inputs unconditionally (midimonitor.com pattern - proven to
       receive clock in the iOS shim browsers): selected port gets the full
       handler, every other port is listened to for clock only */
    this.access.inputs.forEach((p) => {
      p.onmidimessage = (p.name === state.midi.inName) ? onMidiMessage : onClockOnly;
    });
    saveState(); updateConnUi(); renderSetup();
  },
};

function onMidiMessage(e) {
  const d = e.data;
  if (!d || !d.length) return;
  const src = (e.target && e.target.name) || "";
  if (window.busdriver && window.busdriver.monitor && d[0] !== 0xF8 && d[0] !== 0xFE)
    console.log("MIDI in:", Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" "));
  /* realtime bytes (clock/start/stop) may arrive alone, batched, or
     interleaved with channel messages (shim browsers do this) - scan all */
  let msg = d, rt = false;
  for (let i = 0; i < d.length; i++) if (d[i] >= 0xF8) { rt = true; onClockByte(d[i], src); }
  if (rt) msg = Array.from(d).filter((b) => b < 0xF8);
  if (msg.length < 3) return;
  const type = msg[0] & 0xF0, ch = msg[0] & 0x0F;
  /* JAM raw controls can be pinned to any channel (e.g. a second device),
     so this check runs independently of the ch<=4/RECV_CCS gate below,
     which is specific to the SP-404's own 5-bus CC set */
  if (type === 0xB0) applyRawCC(ch, msg[1], msg[2]);
  if (type !== 0xB0 || ch > 4 || !RECV_CCS.has(msg[1])) return;
  handleBytes(ch, msg[1], msg[2]);
}
function handleBytes(ch, ccNum, val) {
  const key = ch << 8 | ccNum;
  /* R1: while a finger owns this control, the device never wins */
  if (Midi.activeCCs.has(key)) return;
  /* R2: drop echoes of our own sends (value match within 400 ms) */
  const e = Midi.echoLog.get(key);
  if (e && e.val === val && performance.now() - e.t < 400) return;
  /* R3: device-sourced apply renders only, never re-sends */
  Midi.lastSent.set(key, val); /* device now holds val - keeps send dedupe truthful */
  applyCC(ch, ccNum, val, "device");
}

function applyCC(bus, ccNum, val, source) {
  const b = state.buses[bus];
  if (ccNum === CC_SW) {
    b.on = val >= 64;
    updateBusChrome(bus);
  } else if (ccNum === CC_FX) {
    if (b.fx !== val) fxChange(bus, val, source);
  } else {
    const slot = CC_CTRL.indexOf(ccNum);
    if (slot < 0) return;
    b.cc[slot] = clamp(val, 0, 127);
    queueSlotRender(bus, slot);
    queueSyncSiblings(bus, slot);
  }
  saveState();
}
function queueSyncSiblings(bus, slot) {
  /* a SYNC flip changes sibling displays (msec <-> note values) */
  const def = fxDefFor(BUSES[bus].table, state.buses[bus].fx);
  if (def && def.p[slot] && def.p[slot].n === "SYNC") {
    def.p.forEach((p, i) => { if (p.sv) queueSlotRender(bus, i); });
  }
}

/* incoming CC from ANY connected input, matched against JAM raw controls by
   channel+CC number - applyCC/handleBytes above is the SP-404-specific
   pipeline (bus-indexed, only looks at the primary input's ch 0-4), so a
   second device pinned in JAM (e.g. an MC-101's own hardware knobs on ch
   11-14) needs its own path that scans every connected port instead of
   just the one selected as the primary SP-404 input. */
const jamRawRenderQueue = new Set(); /* cfg.id values needing repaint */
let jamRawFlushReq = 0;
function queueJamRawRender(id) {
  jamRawRenderQueue.add(id);
  if (jamRawFlushReq) return;
  jamRawFlushReq = requestAnimationFrame(() => {
    jamRawFlushReq = 0;
    const q = [...jamRawRenderQueue];
    jamRawRenderQueue.clear();
    q.forEach((rid) => {
      const fns = jamRawUpdateFns.get(rid);
      if (fns) fns.forEach((fn) => { try { fn(); } catch (e) { /* one broken control must never freeze the render loop */ } });
    });
  });
}
function applyRawCC(ch, ccNum, val) {
  const key = ch << 8 | ccNum;
  if (Midi.activeCCs.has(key)) return; /* a finger is dragging this control */
  const e = Midi.echoLog.get(key);
  if (e && e.val === val && performance.now() - e.t < 400) return; /* our own send bouncing back */
  let touched = false;
  state.jam.slots.forEach((cfg) => {
    if (cfg.source === "raw" && cfg.type === "cc" && cfg.ch === ch && cfg.num === ccNum) {
      cfg.val = clamp(val, 0, 127);
      touched = true;
      queueJamRawRender(cfg.id);
    }
  });
  if (touched) saveState();
}

/* ===== effect change sequence (the one deterministic sync point) ===== */
function memKey(table, num) {
  if (table === "bus12" && num >= 1 && num <= 5) {
    const a = directName(num);
    if (a) return "dfx:" + a; /* per assigned effect, not per slot */
  }
  return table + ":" + num;
}
const fxTimers = BUSES.map(() => []);
function fxChange(bus, num, source) {
  const B = BUSES[bus], b = state.buses[bus];
  /* cancel a still-running ctrl push of a previous change (any source) */
  fxTimers[bus].forEach(clearTimeout);
  fxTimers[bus] = [];
  if (b.fx > 0) state.mem[memKey(B.table, b.fx)] = b.cc.slice();
  b.fx = num;
  const def = fxDefFor(B.table, num);
  const saved = state.mem[memKey(B.table, num)];
  b.cc = saved ? saved.slice() : defaultCcs(def);
  LfoRt.forEach((rt, i) => { /* effect switch moved the ground under running LFOs */
    const t = state.lfos[i].target;
    if (rt.on && t && t.bus === bus) rt.center = b.cc[t.slot];
  });
  if (source === "user" && num > 0) {
    const r = state.recents[B.table].filter((n) => n !== num);
    r.unshift(num); state.recents[B.table] = r.slice(0, 6);
  }
  if (source === "user") {
    Midi.send(B.ch, CC_FX, num, true);
    b.cc.forEach((v, i) => fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_CTRL[i], v, true), 5 * (i + 1))));
    if ((bus === 2 || bus === 3) && b.on && num > 0) {
      /* BUS 3/4 can sit in device-side bypass; an OFF->ON cycle re-arms
         them (verified at the device by Martin) */
      fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_SW, 0, true), 42));
      fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_SW, 127, true), 50));
    }
  }
  renderBus(bus);
  saveState();
}

/* ===== 06 UI: TX led, banner, conn ===== */
let txTimer = null, txLast = 0;
function blinkTx() {
  const now = performance.now();
  if (now - txLast < 100) return;
  txLast = now;
  $("tx").classList.add("blink");
  clearTimeout(txTimer);
  txTimer = setTimeout(() => $("tx").classList.remove("blink"), 60);
}
let bannerTimer = null;
function showBanner(text, cls, ms) {
  const b = $("banner");
  b.textContent = text;
  b.className = "show" + (cls === "info" ? " info" : "");
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.remove("show"), ms);
}
function updateConnUi() {
  const dot = $("conn-dot"), name = $("conn-name");
  if (Midi.demo) { dot.className = ""; name.textContent = "Demo mode (no MIDI)"; return; }
  if (!navigator.requestMIDIAccess) { dot.className = "err"; name.textContent = "no Web MIDI"; return; }
  const o = Midi.out();
  if (o) {
    dot.className = "ok"; name.textContent = o.name;
    $("banner").classList.remove("show");
  } else {
    dot.className = Midi.access ? "err" : "";
    name.textContent = Midi.access ? "SP-404 not connected" : "not connected";
    if (Midi.access && state.midi.outName) showBanner("SP-404 not connected - tap to open Setup", "warn", 6000);
  }
}

/* ===== 07 controls (fader / toggle / stepper) ===== */
const controls = BUSES.map(() => [null, null, null, null, null, null]); /* focus view */
const stripControls = BUSES.map(() => [null, null, null, null, null, null]);
/* drags must survive DOM rebuilds (device fx change, bus switch mid-drag):
   otherwise activeCCs leaks and the CC goes deaf for device input */
const liveDrags = new Map(); /* key ch<<8|cc -> { node, finish } */
/* JAM tiles pinned to a bus/ctrl slot need repainting on the same events as
   the focus/overview faders for that slot (hardware encoder input, effect
   switch, snapshot load) - keyed the same as renderQueue (bus*8+slot) */
const jamByBusSlot = new Map(); /* key -> Set<() => void> */
/* same idea for JAM raw controls pinned to a second device (e.g. an MC-101's
   own hardware knobs) - keyed by the JAM slot's own id since raw controls
   aren't tied to a bus/slot pair the way jamByBusSlot's keys are */
const jamRawUpdateFns = new Map(); /* cfg.id -> Set<() => void> */
function finishDragsIn(host) {
  for (const [k, d] of [...liveDrags]) {
    if (host.contains(d.node)) d.finish();
  }
}
const renderQueue = new Set();
function queueSlotRender(bus, slot) {
  renderQueue.add(bus * 8 + slot);
  scheduleFlush();
}
let flushReq = 0;
function scheduleFlush() {
  if (flushReq) return;
  flushReq = requestAnimationFrame(() => {
    flushReq = 0;
    const q = [...renderQueue];
    renderQueue.clear();
    for (const k of q) {
      const bus = Math.floor(k / 8), slot = k % 8;
      try {
        if (controls[bus][slot]) controls[bus][slot].update();
        if (stripControls[bus][slot]) stripControls[bus][slot].update();
        const jc = jamByBusSlot.get(k);
        if (jc) jc.forEach((fn) => fn());
      } catch (e) { /* one broken control must never freeze the whole render loop */ }
    }
  });
}

function setBusCc(bus, slot, cc, opts) {
  cc = clamp(cc | 0, 0, 127);
  const b = state.buses[bus];
  if (b.cc[slot] === cc && !(opts && opts.force)) return;
  b.cc[slot] = cc;
  Midi.send(BUSES[bus].ch, CC_CTRL[slot], cc, opts && opts.force);
  queueSlotRender(bus, slot);
  queueSyncSiblings(bus, slot);
  saveState();
}

/* stepper popover (surgical +/-1) */
const stepCtx = { bus: 0, slot: 0 };
function openStepper(x, y, bus, slot) {
  stepCtx.bus = bus; stepCtx.slot = slot;
  const s = $("stepper");
  s.classList.add("open");
  const w = 136, h = 64;
  s.style.left = clamp(x - w / 2, 8, window.innerWidth - w - 8) + "px";
  s.style.top = clamp(y - h - 16, 8, window.innerHeight - h - 8) + "px";
}
function closeStepper() { $("stepper").classList.remove("open"); }

/* paints a fader's fill/thumb from a single 0-100 percent - orientation
   (vertical vs. body.horiz-faders) is resolved entirely in CSS via --pct */
function paintFader(fill, thumb, pct) {
  fill.style.setProperty("--pct", pct + "%");
  thumb.style.setProperty("--pct", pct + "%");
}

/* JAM's alternate "rotary knob" style (Setup > JAM style). Same 0-100 pct
   as paintFader, remapped as a left/right tilt from straight-up (12
   o'clock = the 0-127 midpoint, ~64): drag right of center to increase
   toward 127, left of center to decrease toward 0, same balance-pot
   convention as .fader's "bal" display. The arc fills from the 12 o'clock
   reference out toward whichever side the pointer has tilted, so a
   centered value shows an empty ring. */
/* 135deg off vertical = the classic 270deg-total hardware-pot sweep (7:30
   to 4:30), just re-centered so 12 o'clock is the value's midpoint instead
   of the sweep's start - at +-60deg the fill barely showed at either
   extreme, this reads as "maxed out" the way a real knob does. */
const KNOB_MAX_TILT = 135;
function paintKnob(dial, pointer, pct) {
  const angle = (pct - 50) / 50 * KNOB_MAX_TILT;
  pointer.style.transform = "rotate(" + angle + "deg)";
  const lo = Math.min(0, angle), hi = Math.max(0, angle);
  dial.style.background =
    "conic-gradient(from " + lo + "deg, var(--accent) 0deg " + (hi - lo) + "deg, var(--track-bg) " + (hi - lo) + "deg 360deg)";
}

/* generic relative-drag fader engine, shared by bus focus faders and
   custom MIDI faders (index.html custom tab). Orientation-aware: reads
   body.horiz-faders so the same code drives vertical and sideways drag,
   swapping which axis is "value" vs. "fine-tune pull". */
function attachFaderDrag(fader, dom, opts) {
  let drag = null, hideT = 0, lastTap = 0;
  /* horiz-faders is scoped off for callers that pass allowHoriz:false (the
     JAM grid: its tiles are narrow columns, a sideways fader has no travel
     to work with there regardless of the Focus-view toggle) */
  const horiz = () => opts.allowHoriz !== false && document.body.classList.contains("horiz-faders");
  function finishDrag() {
    if (!drag) return;
    drag = null;
    if (opts.key != null) liveDrags.delete(opts.key);
    if (opts.echoKey != null) Midi.activeCCs.delete(opts.echoKey);
    fader.classList.remove("drag");
    hideT = setTimeout(() => { dom.big.classList.remove("show"); dom.big.style.marginLeft = ""; }, 800);
    if (opts.trailingSend) opts.trailingSend();
  }
  fader.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fader.setPointerCapture(e.pointerId);
    const h = horiz();
    drag = {
      id: e.pointerId, startX: e.clientX, startY: e.clientY,
      lastPos: h ? e.clientX : e.clientY, horiz: h,
      acc: opts.get(), moved: 0,
      /* sensitivity (finger travel for full 0-127 sweep) is normally derived
         from the visible track size, floored at 60px - but a small tile
         (JAM grid) would make that floor the operative value, giving a
         twitchy few-cm sweep. opts.sensitivity overrides it with a fixed,
         comfortable travel distance decoupled from how small the control
         is drawn - the same principle as pointer capture already letting a
         drag continue past the tile's edges. */
      h: opts.sensitivity || Math.max(h ? dom.track.clientWidth : dom.track.clientHeight, 60),
    };
    if (opts.key != null) liveDrags.set(opts.key, { node: fader, finish: finishDrag });
    if (opts.echoKey != null) Midi.activeCCs.add(opts.echoKey);
    fader.classList.add("drag");
    clearTimeout(hideT);
    dom.big.classList.add("show");
    /* clamp the big readout to the viewport (edge slots) */
    const r = dom.big.getBoundingClientRect();
    dom.big.style.marginLeft = (Math.max(0, 8 - r.left) - Math.max(0, r.right - window.innerWidth + 8)) + "px";
  });
  fader.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pos = drag.horiz ? e.clientX : e.clientY;
    const perp = drag.horiz ? Math.abs(e.clientY - drag.startY) : Math.abs(e.clientX - drag.startX);
    const fine = perp > 120 ? 0.1 : perp > 60 ? 0.25 : 1;
    const dv = drag.horiz ? (pos - drag.lastPos) : (drag.lastPos - pos);
    drag.lastPos = pos;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.startY), Math.abs(e.clientX - drag.startX));
    drag.acc = clamp(drag.acc + dv * fine * 127 / drag.h, 0, 127);
    const target = opts.snapN ? ccFromEnum(enumFromCc(Math.round(drag.acc), opts.snapN), opts.snapN) : Math.round(drag.acc);
    if (target !== opts.get()) opts.set(target, {});
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    finishDrag();
    if (moved < 6) {
      const now = performance.now();
      if (now - lastTap < 300) { /* double tap -> default */
        if (opts.onDefault) opts.set(opts.onDefault(), { force: true });
        lastTap = 0;
      } else lastTap = now;
    }
  }
  fader.addEventListener("pointerup", endDrag);
  fader.addEventListener("pointercancel", endDrag);
  fader.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (e.deltaY < 0 ? 1 : -1);
    opts.set(opts.get() + step, { force: true });
  }, { passive: false });
  if (dom.val && opts.onStepperOpen) {
    dom.val.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      const r = dom.val.getBoundingClientRect();
      opts.onStepperOpen(r.left + r.width / 2, r.top);
    });
  }
  return { finishDrag };
}

/* one control in a slot; kind: "fader" | "snap" | "seg" | "toggle" */
function buildControl(slotEl, bus, slot, mini) {
  const B = BUSES[bus];
  const def = fxDefFor(B.table, state.buses[bus].fx);
  const p = def && def.p[slot];
  slotEl.textContent = "";
  slotEl.className = mini ? "slot" : "slot";
  if (!p) {
    slotEl.classList.add("empty");
    slotEl.appendChild(el("div", "fader"));
    slotEl.appendChild(el("div", "slot-label", "–"));
    return null;
  }
  const label = el("div", "slot-label", p.n);
  /* each branch defines its own block-scoped update() and MUST bind it here -
     a shared { update } literal would capture the hoisted fader update */
  const api = {};

  if (!mini && p.t === "b") {
    const btn = el("button", "slot-toggle pad", p.n);
    slotEl.appendChild(btn);
    slotEl.appendChild(label);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const cur = state.buses[bus].cc[slot];
      setBusCc(bus, slot, cur >= 64 ? 0 : 127, { force: true });
    });
    function update() {
      const on = state.buses[bus].cc[slot] >= 64;
      btn.classList.toggle("on", on);
      btn.textContent = p.n + " " + (on ? "ON" : "OFF");
    }
    api.update = update;
    update();
    return api;
  }

  if (!mini && p.t === "e" && p.v.length <= 6) {
    const seg = el("div", "seg");
    const btns = p.v.map((v, i) => {
      const b2 = el("button", "", v);
      b2.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        setBusCc(bus, slot, ccFromEnum(i, p.v.length), { force: true });
      });
      seg.appendChild(b2);
      return b2;
    });
    slotEl.appendChild(seg);
    slotEl.appendChild(label);
    function update() {
      const cur = enumFromCc(state.buses[bus].cc[slot], p.v.length);
      btns.forEach((b2, i) => b2.classList.toggle("on", i === cur));
    }
    api.update = update;
    update();
    return api;
  }

  /* fader (continuous, snapped enum, bal, pan, nt, and everything in mini strips) */
  const snapN = (p.t === "e") ? p.v.length : 0;
  const fader = el("div", "fader");
  const val = el("button", "fader-val display mono");
  const wrap = el("div", "fader-track-wrap");
  const track = el("div", "fader-track");
  const fill = el("div", "fader-fill");
  const thumb = el("div", "fader-thumb");
  const big = el("div", "bigval display mono");
  track.appendChild(fill); track.appendChild(thumb);
  wrap.appendChild(track);
  fader.appendChild(val); fader.appendChild(wrap); fader.appendChild(big);
  slotEl.appendChild(fader);
  slotEl.appendChild(label);

  function curCc() { return state.buses[bus].cc[slot]; }
  function disp(cc) { return dispFromCc(p, cc, syncOnFor(bus, def)); }
  function update() {
    const cc = curCc();
    paintFader(fill, thumb, cc / 127 * 100);
    const d = disp(cc);
    val.textContent = d;
    big.textContent = d;
  }
  api.update = update;
  update();

  const key = B.ch << 8 | CC_CTRL[slot];
  attachFaderDrag(fader, { val: mini ? null : val, big, track }, {
    key, echoKey: key, snapN,
    get: curCc,
    set: (v, o) => setBusCc(bus, slot, v, o),
    onDefault: () => ccFromDefault(p),
    trailingSend: () => Midi.send(B.ch, CC_CTRL[slot], curCc(), true),
    onStepperOpen: mini ? null : (x, y) => openStepper(x, y, bus, slot),
  });
  return api;
}

/* ===== 08 views ===== */
function renderFocusSlots() {
  const bus = state.activeBus;
  const host = $("faders");
  finishDragsIn(host);
  host.textContent = "";
  for (let i = 0; i < 6; i++) {
    const slotEl = el("div", "slot");
    host.appendChild(slotEl);
    controls[bus][i] = buildControl(slotEl, bus, i, false);
  }
  /* other buses' focus controls are stale references now */
  BUSES.forEach((_, b) => { if (b !== bus) controls[b] = [null, null, null, null, null, null]; });
  renderFocusScenes();
}
/* saved bus-scene JAM pads for the active bus, recalled right here instead
   of needing a trip to the JAM tab - same cfg objects, same attachJamPad
   interaction (hold/toggle), just a second place they're rendered.
   Pressing one of these applies a full bus state -> renderBus() -> (since
   it's the active bus) renderFocusSlots() -> this function again, all while
   the finger is still down. A naive rebuild here would tear down the very
   button mid-press, breaking its pointer capture before release ever fires
   (release lands on a fresh button whose "down" never went true). The
   signature check makes this a no-op unless the actual scene *set* (which
   bus, which scenes, their labels) changed, so applying a scene - which
   only changes bus values, not the JAM list - never touches the DOM. */
let lastFocusScenesSig = null;
function renderFocusScenes() {
  const host = $("focus-scenes");
  if (!host) return;
  const scenes = state.jam.slots.filter((cfg) => cfg.source === "scene" && cfg.bus === state.activeBus);
  const sig = state.activeBus + ":" + scenes.map((c) => c.id + "=" + c.label).join(",");
  if (sig === lastFocusScenesSig) return;
  lastFocusScenesSig = sig;
  host.textContent = "";
  host.classList.toggle("has-scenes", scenes.length > 0);
  scenes.forEach((cfg) => {
    const item = el("div", "focus-scene-item");
    const btn = el("button", "pad focus-scene-btn", jamLabel(cfg));
    item.appendChild(btn);
    const editBtn = el("button", "focus-scene-edit", "✎");
    editBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = state.jam.slots.indexOf(cfg);
      if (idx >= 0) openJamEditor(idx);
    });
    item.appendChild(editBtn);
    host.appendChild(item);
    attachJamPad(btn, cfg);
  });
}
function updateFocusHead() {
  const bus = state.activeBus, b = state.buses[bus], B = BUSES[bus];
  $("efx-pad").classList.toggle("on", b.on);
  $("efx-pad").textContent = b.on ? "EFX ON" : "EFX";
  $("fx-name").querySelector(".fx-title").textContent = fxDisplayName(B.table, b.fx);
  $("fx-name").querySelector(".fx-sub").textContent = B.label + " · choose effect";
  renderFocusFavs();
}
/* one-tap favorite-effect chips for the bus currently shown in Focus - the
   same favorites the picker's FAVORITES section and its "FA" jump button
   surface, just reachable without opening the picker at all. Re-rendered
   from updateFocusHead() (covers setActiveBus/renderBus/bus switches) and
   from the picker's star-hold handler (favoriting doesn't change fx, so
   nothing else would refresh this strip). */
function renderFocusFavs() {
  const host = $("focus-favs");
  if (!host) return;
  const bus = state.activeBus, B = BUSES[bus], table = B.table;
  const nums = favList(table).filter((n) => n < BUS_TABLES[table].length);
  host.classList.toggle("show", nums.length > 0);
  host.textContent = "";
  nums.forEach((n) => {
    const chip = el("button", "focus-fav-chip" + (n === state.buses[bus].fx ? " sel" : ""), fxNameFor(table, n));
    chip.addEventListener("click", () => {
      fxChange(bus, n, "user");
      /* a favorite chip is for loading an effect to go tweak it, not for
         punching it in live - always land with EFX off so nothing is heard
         until you deliberately hit EFX, unlike the picker (which is a more
         deliberate action to begin with) */
      sendSw(bus, false);
    });
    host.appendChild(chip);
  });
}
function updateBusChrome(bus) {
  const b = state.buses[bus];
  tabLeds[bus].classList.toggle("on", b.on);
  strips[bus].root.classList.toggle("on", b.on);
  strips[bus].efx.classList.toggle("on", b.on);
  strips[bus].efx.textContent = b.on ? "ON" : "EFX";
  if (bus === state.activeBus) updateFocusHead();
}
function renderBus(bus) {
  strips[bus].fx.textContent = fxDisplayName(BUSES[bus].table, state.buses[bus].fx);
  buildStripFaders(bus);
  if (bus === state.activeBus) { renderFocusSlots(); updateFocusHead(); }
  updateBusChrome(bus);
}
function setActiveBus(bus) {
  state.activeBus = bus;
  tabs.forEach((t, i) => t.classList.toggle("active", i === bus));
  renderFocusSlots();
  updateFocusHead();
  updateRndBtn();
}
function currentView() {
  const b = document.body.classList;
  return b.contains("xy") ? "xy" : b.contains("pattern") ? "pattern" : b.contains("play") ? "play" : b.contains("jam") ? "jam" : b.contains("overview") ? "overview" : "focus";
}
function setView(v) {
  const b = document.body.classList;
  b.remove("overview", "xy", "pattern", "play", "jam");
  if (v !== "focus") b.add(v);
  $("xy-btn").classList.toggle("on", v === "xy");
  if (patternTab) patternTab.classList.toggle("active", v === "pattern");
  if (playTab) playTab.classList.toggle("active", v === "play");
  if (jamTab) jamTab.classList.toggle("active", v === "jam");
  $("view-toggle").textContent = v === "overview" ? "Focus" : "Overview";
  if (v === "xy") renderXy();
  if (v === "pattern") renderPattern();
  if (v === "play") renderPlay();
  if (v === "jam") buildJam();
}
function gotoFocus(bus) {
  setActiveBus(bus);
  setView("focus");
}
function toggleView() {
  setView(currentView() === "overview" ? "focus" : "overview");
}

/* bus tabs */
const tabs = [], tabLeds = [];
let patternTab = null, playTab = null, jamTab = null;
function buildTabs() {
  const host = $("bustabs");
  BUSES.forEach((B, i) => {
    const t = el("button", "bustab");
    const led = el("span", "led");
    t.appendChild(led);
    t.appendChild(el("span", "", B.short));
    t.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      /* in the playable tablet/desktop overview a tab tap only sets the
         active bus - it must not yank the user out of the overview */
      if (document.body.classList.contains("overview") && !PHONE.matches) setActiveBusSilent(i);
      else gotoFocus(i);
    });
    host.appendChild(t);
    tabs.push(t); tabLeds.push(led);
  });
  const pl = el("button", "bustab");
  pl.appendChild(el("span", "", "PLAY"));
  pl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setView(currentView() === "play" ? "focus" : "play");
  });
  host.appendChild(pl);
  playTab = pl;
  const pt = el("button", "bustab");
  pt.appendChild(el("span", "", "PTN"));
  pt.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setView(currentView() === "pattern" ? "focus" : "pattern");
  });
  host.appendChild(pt);
  patternTab = pt;
  const jm = el("button", "bustab");
  jm.appendChild(el("span", "", "JAM"));
  jm.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setView(currentView() === "jam" ? "focus" : "jam");
  });
  host.appendChild(jm);
  jamTab = jm;
}

/* overview strips */
const strips = [];
function buildOverview() {
  const host = $("view-overview");
  BUSES.forEach((B, i) => {
    const root = el("div", "busstrip");
    const head = el("div", "strip-head");
    const lab = el("button", "label", B.label);
    const efx = el("button", "strip-efx pad", "EFX");
    head.appendChild(lab); head.appendChild(efx);
    const fx = el("button", "strip-fx display mono", "(OFF)");
    const fads = el("div", "strip-faders");
    root.appendChild(head); root.appendChild(fx); root.appendChild(fads);
    host.appendChild(root);
    /* click, not pointerdown: on phone these sit in a scroll container and
       click does not fire after a pan gesture */
    lab.addEventListener("click", () => gotoFocus(i));
    fx.addEventListener("click", () => {
      if (PHONE.matches) { gotoFocus(i); return; }
      setActiveBusSilent(i); openPicker(i);
    });
    attachEfxPad(efx, i);
    root.addEventListener("click", (e) => {
      if (PHONE.matches && e.target === root) gotoFocus(i);
    });
    strips.push({ root, efx, fx, fads });
  });
}
function setActiveBusSilent(bus) { /* picker needs a target without leaving overview */
  state.activeBus = bus;
  tabs.forEach((t, i) => t.classList.toggle("active", i === bus));
  renderFocusSlots(); updateFocusHead();
}
function buildStripFaders(bus) {
  const host = strips[bus].fads;
  finishDragsIn(host);
  host.textContent = "";
  for (let i = 0; i < 6; i++) {
    const slotEl = el("div", "slot");
    host.appendChild(slotEl);
    stripControls[bus][i] = buildControl(slotEl, bus, i, true);
  }
}

/* EFX pad with momentary long-press (hold >=350ms from OFF: on while held) */
function attachEfxPad(btn, busIdx) {
  let t = null, momentary = false, downAt = 0;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    clearTimeout(t); t = null;
    downAt = performance.now(); momentary = false;
    const b = state.buses[busIdx];
    if (!b.on) {
      t = setTimeout(() => {
        momentary = true;
        sendSw(busIdx, true);
      }, 350);
    }
  });
  function up(e) {
    clearTimeout(t); t = null;
    if (!downAt) return;
    downAt = 0;
    const b = state.buses[busIdx];
    if (momentary) { sendSw(busIdx, false); momentary = false; return; }
    sendSw(busIdx, !b.on);
  }
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", (e) => {
    clearTimeout(t); t = null; downAt = 0;
    if (momentary) { sendSw(busIdx, false); momentary = false; }
  });
}
function sendSw(bus, on) {
  state.buses[bus].on = on;
  Midi.send(BUSES[bus].ch, CC_SW, on ? 127 : 0, true);
  updateBusChrome(bus);
  saveState();
}

/* ALL OFF with restore */
function allOff() {
  const btn = $("alloff");
  if (!allOffSaved) {
    allOffSaved = state.buses.map((b) => b.on);
    if (!allOffSaved.some(Boolean)) { allOffSaved = null; return; }
    BUSES.forEach((B, i) => { if (state.buses[i].on) sendSw(i, false); });
    btn.classList.add("armed");
    btn.textContent = "RESTORE";
  } else {
    BUSES.forEach((B, i) => { if (allOffSaved[i]) sendSw(i, true); });
    allOffSaved = null;
    btn.classList.remove("armed");
    btn.textContent = "ALL OFF";
  }
}

/* ===== snapshots ===== */
function applyFullState(buses) {
  /* full push: per bus CC#83, then ctrl CCs, then EFX switch, staggered */
  allOffSaved = null;
  $("alloff").classList.remove("armed");
  $("alloff").textContent = "ALL OFF";
  let d = 0;
  BUSES.forEach((B, b) => {
    const src = buses[b];
    if (!src || !Array.isArray(src.cc)) return;
    fxTimers[b].forEach(clearTimeout); fxTimers[b] = [];
    const cur = state.buses[b];
    if (cur.fx > 0) state.mem[memKey(B.table, cur.fx)] = cur.cc.slice();
    cur.fx = src.fx | 0;
    cur.cc = src.cc.map((v) => clamp(v | 0, 0, 127));
    cur.on = !!src.on;
    fxTimers[b].push(setTimeout(() => Midi.send(B.ch, CC_FX, cur.fx, true), d)); d += 6;
    cur.cc.forEach((v, j) => { fxTimers[b].push(setTimeout(() => Midi.send(B.ch, CC_CTRL[j], v, true), d)); d += 6; });
    fxTimers[b].push(setTimeout(() => Midi.send(B.ch, CC_SW, cur.on ? 127 : 0, true), d)); d += 6;
    renderBus(b);
  });
  LfoRt.forEach((rt, i) => { /* snapshot moved the ground under running LFOs */
    const t = state.lfos[i].target;
    if (rt.on && t) rt.center = state.buses[t.bus].cc[t.slot];
  });
  saveState();
}
/* per-bus instant apply (fx + 6 cc + on/off) - same staggered-send shape as
   applyFullState but scoped to one bus and its own timing (kept separate
   from applyFullState rather than refactored into it, so the already-relied
   -on multi-bus snapshot load path stays untouched). Used by JAM scene pads
   to jump into a captured bus state on press and back out on release. */
function applyBusState(bus, src) {
  const B = BUSES[bus], cur = state.buses[bus];
  fxTimers[bus].forEach(clearTimeout); fxTimers[bus] = [];
  if (cur.fx > 0) state.mem[memKey(B.table, cur.fx)] = cur.cc.slice();
  cur.fx = src.fx | 0;
  cur.cc = src.cc.map((v) => clamp(v | 0, 0, 127));
  cur.on = !!src.on;
  let d = 0;
  fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_FX, cur.fx, true), d)); d += 6;
  cur.cc.forEach((v, j) => { fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_CTRL[j], v, true), d)); d += 6; });
  fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_SW, cur.on ? 127 : 0, true), d)); d += 6;
  renderBus(bus);
  saveState();
}
function busesSummary(buses, compact) {
  /* compact: "1● Tape Echo · 3○ Lo-fi" (● an, ○ gesetzt aber aus) */
  const parts = [];
  BUSES.forEach((B, i) => {
    const b = buses[i];
    if (!b) return;
    const name = b.fx > 0 ? fxDisplayName(B.table, b.fx) : null;
    if (compact) {
      if (name) parts.push((i + 1) + (b.on ? "●" : "○") + " " + name);
    } else {
      parts.push(B.label.padEnd(6) + " " + (name || "–") + (name ? (b.on ? "  ON" : "  off") : ""));
    }
  });
  if (compact) return parts.length ? parts.join(" · ") : "all buses empty";
  return parts.join("\n");
}
function snapSave(i) {
  /* saves immediately (offline, no dialog - prompt() is broken in some
     WKWebView shim browsers); the name is edited inline afterwards */
  const cur = state.snapshots[i];
  state.snapshots[i] = {
    t: Date.now(),
    name: (cur && !cur.del && cur.name) || "Snapshot " + (i + 1),
    buses: state.buses.map((b) => ({ on: b.on, fx: b.fx, cc: b.cc.slice() })),
  };
  saveState(); scheduleSync(); renderSnaps();
  startRename(i);
}
function startRename(i) {
  const slotEl = snapEls[i];
  const s = state.snapshots[i];
  if (!slotEl || !s || s.del) return;
  const nameEl = slotEl.querySelector(".sn-name");
  if (!nameEl) return;
  const input = el("input", "sn-edit");
  input.type = "text"; input.maxLength = 24; input.value = s.name;
  nameEl.replaceWith(input);
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") { input.value = s.name; input.blur(); }
  });
  input.addEventListener("blur", () => {
    const v = input.value.trim();
    if (v && v !== s.name) { s.name = v.slice(0, 24); s.t = Date.now(); saveState(); scheduleSync(); }
    renderSnaps();
  });
  setTimeout(() => { input.focus(); input.select(); }, 30);
}
function snapLoad(i) {
  const s = state.snapshots[i];
  if (!s || s.del || !Array.isArray(s.buses)) return;
  applyFullState(s.buses);
  $("snaps").classList.remove("open");
  showBanner("\"" + s.name + "\" loaded", "info", 2000);
}
function snapDelete(i) {
  state.snapshots[i] = { t: Date.now(), del: 1 }; /* tombstone so no device resurrects it */
  saveState(); scheduleSync(); renderSnaps();
}
let snapEls = [];
function renderSnaps() {
  updateImportBtn();
  $("snap-current").textContent = busesSummary(state.buses, false);
  const grid = $("snap-grid");
  grid.textContent = "";
  snapEls = [];
  for (let i = 0; i < 8; i++) {
    const s = state.snapshots[i];
    const filled = !!(s && !s.del && Array.isArray(s.buses));
    const slot = el("div", "snap-slot" + (filled ? "" : " empty")); /* div: contains the del button */
    slot.appendChild(el("span", "sn-name", filled ? s.name : "Slot " + (i + 1)));
    if (filled) slot.appendChild(el("span", "sn-sum", busesSummary(s.buses, true)));
    slot.appendChild(el("span", "sn-meta", filled
      ? new Date(s.t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "empty"));
    let armed = false, moved = false, held = false, sx = 0, sy = 0, hT = null;
    slot.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      armed = true; moved = false; held = false; sx = e.clientX; sy = e.clientY;
      hT = setTimeout(() => { held = true; snapSave(i); }, 500);
    });
    slot.addEventListener("pointermove", (e) => {
      if (armed && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { moved = true; clearTimeout(hT); }
    });
    slot.addEventListener("pointerup", () => {
      clearTimeout(hT);
      if (!armed) return;
      armed = false;
      if (held || moved) return;
      if (filled) snapLoad(i); else snapSave(i);
    });
    slot.addEventListener("pointercancel", () => { clearTimeout(hT); armed = false; });
    if (filled) {
      const del = el("button", "sn-del", "✕");
      del.addEventListener("pointerdown", (e) => e.stopPropagation());
      del.addEventListener("click", (e) => { e.stopPropagation(); snapDelete(i); });
      slot.appendChild(del);
    }
    grid.appendChild(slot);
    snapEls.push(slot);
  }
  updateSyncStatus();
}
function openSnaps() {
  renderSnaps();
  $("snaps").classList.add("open");
  pullSync();
}
function doExport() {
  const ta = $("exchange");
  ta.value = JSON.stringify({ busdriver: 1, snapshots: state.snapshots, jam: state.jam.slots, xyPresets: state.xyPresets, recipes: state.recipes }, null, 1);
  ta.focus(); ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value)
      .then(() => showBanner("JSON copied to clipboard", "info", 2500))
      .catch(() => {});
  }
}
/* same window.confirm() unreliability as clearJam() (see its comment) -
   act immediately and allow undo instead of gating on a dialog that some
   Web MIDI wrapper browsers silently stub to false */
let importUndo = null; /* { snapshots, jam, xyPresets, recipes, t } */
function doImport() {
  if (importUndo && performance.now() - importUndo.t < 8000) {
    state.snapshots = importUndo.snapshots;
    state.jam.slots = importUndo.jam;
    state.xyPresets = importUndo.xyPresets;
    state.recipes = importUndo.recipes;
    importUndo = null;
    saveState(); scheduleSync(); renderSnaps(); buildJam();
    updateImportBtn();
    showBanner("Import undone", "info", 2000);
    return;
  }
  let d = null;
  try { d = JSON.parse($("exchange").value); } catch (e) {}
  if (!d || d.busdriver !== 1 || (!Array.isArray(d.snapshots) && !Array.isArray(d.jam) && !Array.isArray(d.xyPresets) && !Array.isArray(d.recipes))) {
    showBanner("No valid Busdriver JSON in the text field", "warn", 3000);
    return;
  }
  importUndo = { snapshots: state.snapshots.slice(), jam: state.jam.slots.slice(), xyPresets: state.xyPresets.slice(), recipes: state.recipes.slice(), t: performance.now() };
  let n = 0;
  if (Array.isArray(d.snapshots)) {
    for (let i = 0; i < 8; i++) {
      const r = d.snapshots[i];
      if (r && !r.del && Array.isArray(r.buses)) {
        state.snapshots[i] = { t: Date.now(), name: String(r.name || "Import " + (i + 1)).slice(0, 24), buses: r.buses };
        n++;
      }
    }
  }
  let jn = 0;
  if (Array.isArray(d.jam)) {
    state.jam.slots = d.jam.map(sanitizeJamSlot).filter(Boolean).slice(0, JAM_MAX);
    jn = state.jam.slots.length;
    buildJam();
  }
  let xn = 0;
  if (Array.isArray(d.xyPresets)) {
    state.xyPresets = d.xyPresets.map(sanitizeXyPreset).filter(Boolean).slice(0, XY_PRESETS_MAX);
    xn = state.xyPresets.length;
    renderXyCustomList();
  }
  let rn = 0;
  if (Array.isArray(d.recipes)) {
    state.recipes = d.recipes.map(sanitizeRecipe).filter(Boolean).slice(0, RECIPE_MAX);
    rn = state.recipes.length;
    renderRecipesList();
  }
  saveState(); scheduleSync(); renderSnaps();
  showBanner(n + " snapshot(s), " + jn + " JAM control(s), " + xn + " XY combo(s), " + rn + " recipe(s) imported – tap Import again within 8s to undo", "info", 3500);
  updateImportBtn();
  setTimeout(updateImportBtn, 8100);
}
function updateImportBtn() {
  const btn = $("imp-btn");
  if (!btn) return;
  const active = importUndo && performance.now() - importUndo.t < 8000;
  btn.textContent = active ? "Undo Import" : "Import";
}

/* ===== Recipes: full 5-bus presets typed in directly (e.g. from an
   SP-404 "recipe card" pack) rather than captured from live state like
   Snapshots. Same {fx, cc[6], on} per-bus shape as a Snapshot's buses
   array and loaded the same way (applyFullState), just entered by hand -
   the whole point is letting a card's own printed values (dB, ms, %, note
   names) go straight into the app via ccFromDisp instead of eyeballing
   knob positions. Not capped at 8 like the Snapshot slots. ===== */
const RECIPE_MAX = 60;
function sanitizeRecipe(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.buses) || r.buses.length !== 5) return null;
  const buses = r.buses.map((b) => ({
    fx: clamp((b && b.fx | 0) || 0, 0, 127),
    cc: (b && Array.isArray(b.cc) && b.cc.length === 6) ? b.cc.map((v) => clamp(v | 0, 0, 127)) : [64, 64, 64, 64, 64, 64],
    on: !!(b && b.on),
  }));
  return {
    id: (typeof r.id === "string" && r.id) ? r.id : "rc" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: (typeof r.name === "string" && r.name.trim()) ? r.name.slice(0, 30) : "Recipe",
    buses,
  };
}
function blankRecipeBuses() {
  return BUSES.map(() => ({ fx: 0, cc: [64, 64, 64, 64, 64, 64], on: false }));
}
function openRecipes() {
  renderRecipesList();
  $("recipes").classList.add("open");
}
function renderRecipesList() {
  const host = $("recipes-list");
  if (!host) return;
  host.textContent = "";
  if (!state.recipes.length) {
    host.appendChild(el("p", "pick-note", "No recipes yet — tap “+ New Recipe” below and type one in from a card."));
    return;
  }
  state.recipes.forEach((r, i) => {
    const row = el("div", "xy-custom-row");
    const nameBtn = el("button", "setup-btn xy-custom-name", r.name);
    nameBtn.addEventListener("click", () => loadRecipe(r));
    const ren = el("button", "xy-custom-icon", "✎");
    ren.addEventListener("click", (e) => { e.stopPropagation(); openRecipeEditor(i); });
    const del = el("button", "xy-custom-icon", "✕");
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteRecipe(r.id); });
    row.appendChild(nameBtn); row.appendChild(ren); row.appendChild(del);
    host.appendChild(row);
  });
}
function loadRecipe(r) {
  applyFullState(r.buses);
  $("recipes").classList.remove("open");
  showBanner("\"" + r.name + "\" loaded", "info", 2000);
}
function deleteRecipe(id) {
  state.recipes = state.recipes.filter((r) => r.id !== id);
  saveState();
  renderRecipesList();
}
let recipeDraft = null; /* { id, name, buses[5] } while the editor is open */
let recipeEditIndex = null;
function openRecipeEditor(index) {
  recipeEditIndex = index;
  const r = (index != null) ? state.recipes[index] : null;
  recipeDraft = r
    ? { id: r.id, name: r.name, buses: r.buses.map((b) => ({ fx: b.fx, cc: b.cc.slice(), on: b.on })) }
    : { id: null, name: "Recipe " + (state.recipes.length + 1), buses: blankRecipeBuses() };
  $("recipe-edit-title").textContent = (index != null) ? "EDIT RECIPE" : "NEW RECIPE";
  $("re-name").value = recipeDraft.name;
  renderRecipeBuses();
  $("recipes").classList.remove("open");
  $("recipe-edit").classList.add("open");
}
function renderRecipeBuses() {
  const host = $("re-buses");
  host.textContent = "";
  BUSES.forEach((B, bus) => {
    const draft = recipeDraft.buses[bus];
    const table = BUS_TABLES[B.table];
    const def = fxDefFor(B.table, draft.fx);
    const block = el("div", "re-bus-block");
    block.appendChild(el("h4", "", B.label));
    const sel = el("select", "re-fx-select");
    table.forEach((name, num) => {
      const o = document.createElement("option");
      o.value = String(num); o.textContent = name;
      if (num === draft.fx) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      draft.fx = +sel.value;
      /* start from that effect's own defaults - a leftover cc set from
         whatever the previous effect was here means nothing on the new one */
      draft.cc = defaultCcs(fxDefFor(B.table, draft.fx));
      renderRecipeBuses();
    });
    block.appendChild(sel);
    const onRow = el("label", "re-onoff");
    const onCb = document.createElement("input");
    onCb.type = "checkbox"; onCb.checked = draft.on;
    onCb.addEventListener("change", () => { draft.on = onCb.checked; });
    onRow.appendChild(onCb);
    onRow.appendChild(document.createTextNode("EFX on"));
    block.appendChild(onRow);
    if (def) {
      const fields = el("div", "re-fields");
      def.p.forEach((p, i) => {
        if (i >= 6) return;
        const syncOn = syncOnForCc(def, draft.cc);
        const field = el("label", "je-field", p.n + (p.u ? " (" + p.u + ")" : ""));
        if (p.t === "e") {
          const s = document.createElement("select");
          s.className = "re-fx-select";
          p.v.forEach((opt, oi) => {
            const o = document.createElement("option");
            o.value = String(oi); o.textContent = opt;
            if (oi === enumFromCc(draft.cc[i], p.v.length)) o.selected = true;
            s.appendChild(o);
          });
          s.addEventListener("change", () => { draft.cc[i] = ccFromEnum(+s.value, p.v.length); });
          field.appendChild(s);
        } else if (p.t === "b") {
          const cb = document.createElement("input");
          cb.type = "checkbox"; cb.checked = draft.cc[i] >= 64;
          cb.addEventListener("change", () => {
            draft.cc[i] = cb.checked ? 127 : 0;
            if (p.n === "SYNC") renderRecipeBuses(); /* flips sibling fields between ms/note display */
          });
          field.appendChild(cb);
        } else if (p.t === "c" && p.sv && syncOn && Array.isArray(p.sv)) {
          const s = document.createElement("select");
          s.className = "re-fx-select";
          p.sv.forEach((opt, oi) => {
            const o = document.createElement("option");
            o.value = String(oi); o.textContent = opt;
            if (oi === enumFromCc(draft.cc[i], p.sv.length)) o.selected = true;
            s.appendChild(o);
          });
          s.addEventListener("change", () => { draft.cc[i] = ccFromEnum(+s.value, p.sv.length); });
          field.appendChild(s);
        } else {
          const inp = document.createElement("input");
          inp.type = "text"; inp.inputMode = "decimal";
          inp.value = dispFromCc(p, draft.cc[i], syncOn);
          inp.addEventListener("change", () => {
            const v = ccFromDisp(p, inp.value, syncOn);
            if (v != null) draft.cc[i] = v;
          });
          field.appendChild(inp);
        }
        fields.appendChild(field);
      });
      block.appendChild(fields);
    }
    host.appendChild(block);
  });
}
function saveRecipeDraft() {
  const name = $("re-name").value.trim().slice(0, 30) || recipeDraft.name;
  const saved = { id: recipeDraft.id || ("rc" + Date.now() + Math.random().toString(36).slice(2, 7)), name, buses: recipeDraft.buses };
  if (recipeEditIndex != null) state.recipes[recipeEditIndex] = saved;
  else {
    if (state.recipes.length >= RECIPE_MAX) { showBanner("Recipe list is full (" + RECIPE_MAX + ") — delete one first", "warn", 3000); return; }
    state.recipes.push(saved);
  }
  saveState();
  $("recipe-edit").classList.remove("open");
  openRecipes();
  showBanner("\"" + name + "\" saved", "info", 2000);
}

/* ===== randomizer (one-step undo via second tap within 6 s) ===== */
const RND_SKIP = new Set(["LEVEL", "SEND", "GAIN"]);
let rndUndo = null; /* { bus, cc, t } */
function randomize(bus) {
  const B = BUSES[bus], b = state.buses[bus];
  const def = fxDefFor(B.table, b.fx);
  if (!def) { showBanner("Choose an effect first", "info", 2200); return; }
  if (rndUndo && rndUndo.bus === bus && performance.now() - rndUndo.t < 6000) {
    rndUndo.cc.forEach((v, i) => setBusCc(bus, i, v, { force: true }));
    rndUndo = null;
    updateRndBtn();
    return;
  }
  rndUndo = { bus, cc: b.cc.slice(), t: performance.now() };
  def.p.forEach((p, i) => {
    if (i >= 6 || p.t !== "c" || RND_SKIP.has(p.n)) return;
    setBusCc(bus, i, Math.floor(Math.random() * 128), { force: true });
  });
  updateRndBtn();
  setTimeout(updateRndBtn, 6100);
}
function updateRndBtn() {
  const active = rndUndo && rndUndo.bus === state.activeBus && performance.now() - rndUndo.t < 6000;
  $("rnd-btn").textContent = active ? "UNDO" : "RND";
  $("rnd-btn").classList.toggle("undo", !!active);
}

/* ===== device sync: removed in the public build =====
   Snapshots live in localStorage; use export/import (Snap panel) to move
   them between devices. */
let syncTimer = null;
function mergeRemote() { return false; }
function pushSync() {}
function scheduleSync() {}
function pullSync() {}
function updateSyncStatus() {
  $("sync-status").textContent = "Stored locally - move snapshots between devices via export/import.";
}

/* ===== 09 picker ===== */
let pickerBus = 0, pressTimer = null, pressFired = false;
function openPicker(bus, assignSlot) {
  pickerBus = bus;
  const B = BUSES[bus];
  const body = $("picker-body");
  body.textContent = "";
  /* assign mode: choose which effect sits on a device Direct-FX slot */
  if (typeof assignSlot === "number") {
    const oj = $("jumpbar"); if (oj) oj.remove();
    $("picker-title").textContent = "DIRECT FX" + (assignSlot + 1) + " · ASSIGNMENT";
    body.appendChild(el("div", "pick-note",
      "Tell the app which effect sits on the device Direct FX slot " + (assignSlot + 1) +
      " (SP-404 SYSTEM setting) - the faders then show the real parameter names."));
    const curName = directName(assignSlot + 1);
    const mkA = (name, isClear) => {
      const it = el("button", "pick-item" + (isClear ? " off-item" : "") +
        ((isClear ? !curName : curName === name) ? " sel" : ""));
      it.appendChild(el("span", "", isClear ? "(not set)" : name));
      it.addEventListener("click", () => { setDirectFx(assignSlot, isClear ? null : name); closePicker(); });
      return it;
    };
    const g0 = el("div", "pick-grid");
    g0.appendChild(mkA(null, true));
    body.appendChild(g0);
    const byCat = {};
    CAT_ORDER.forEach((c) => { byCat[c] = []; });
    assignableNames().forEach((n) => {
      const c = EFFECTS[n] ? EFFECTS[n].c : "weird";
      (byCat[c] || byCat.weird).push(n);
    });
    CAT_ORDER.forEach((c) => {
      if (!byCat[c] || !byCat[c].length) return;
      const sec = el("div", "pick-cat");
      sec.appendChild(el("h3", "", CAT_LABELS[c]));
      const g = el("div", "pick-grid");
      byCat[c].forEach((n) => g.appendChild(mkA(n, false)));
      sec.appendChild(g);
      body.appendChild(sec);
    });
    $("picker").classList.add("open");
    return;
  }
  $("picker-title").textContent = B.label + " · EFFECT";
  const table = BUS_TABLES[B.table];
  const cur = state.buses[bus].fx;

  const mkItem = (num, wide) => {
    const name = table[num];
    const item = el("button", "pick-item" + (num === 0 ? " off-item" : "") + (num === cur ? " sel" : ""));
    item.appendChild(el("span", "", fxDisplayName(B.table, num)));
    if (num > 0) {
      const star = el("span", "star" + (isFav(B.table, num) ? " fav" : ""), "★");
      item.appendChild(star);
    }
    /* select only on a full down+up pair on THIS item without movement:
       protects against scroll gestures and against the picker opening under
       an already-down finger */
    let armed = false, moved = false, sx = 0, sy = 0;
    item.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      armed = true; moved = false; sx = e.clientX; sy = e.clientY;
      pressFired = false;
      clearTimeout(pressTimer);
      if (num > 0) {
        pressTimer = setTimeout(() => {
          pressFired = true;
          state.favs[B.table][num] = { on: !isFav(B.table, num), t: Date.now() };
          saveState(); scheduleSync(); openPicker(bus); /* re-render, keep open */
          renderFocusFavs(); /* favoriting doesn't change fx, nothing else would refresh this */
        }, 420);
      }
    });
    item.addEventListener("pointermove", (e) => {
      if (armed && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
        moved = true; clearTimeout(pressTimer);
      }
    });
    item.addEventListener("pointerup", () => {
      clearTimeout(pressTimer);
      if (!armed) return;
      armed = false;
      if (pressFired || moved) return;
      fxChange(bus, num, "user");
      closePicker();
    });
    item.addEventListener("pointercancel", () => { clearTimeout(pressTimer); armed = false; });
    item.addEventListener("pointerleave", () => clearTimeout(pressTimer));
    return item;
  };

  /* the three bus types have different effect sets (Roland spec) */
  const NOTES = {
    bus12: "Effect set of BUS 1+2. BUS 3/4 and INPUT have their own sets (Roland spec) - e.g. Sync Delay, Isolator and Resonator only exist on BUS 3/4.",
    bus34: "Effect set of BUS 3+4 (Roland spec) - incl. Sync Delay, Isolator, Filter+Drive, Resonator and DJFX Looper.",
    input: "Effect set of the INPUT bus (Roland spec) - Auto Pitch, Vocoder, Harmony, Gt Amp Sim.",
  };
  body.appendChild(el("div", "pick-note", NOTES[B.table]));
  const grid0 = el("div", "pick-grid");
  grid0.appendChild(mkItem(0));
  body.appendChild(grid0);

  /* jump bar built up front so RECENT/FAVORITES get a shortcut too, same as
     the categories below - favorites in particular can end up far down a
     long list (e.g. bus34's 40 effects), so it needs the same one-tap
     jump the categories already get, not just a scroll */
  const oldJump = $("jumpbar");
  if (oldJump) oldJump.remove();
  const jump = el("div", ""); jump.id = "jumpbar";
  const addJumpBtn = (label, sec) => {
    const jb = el("button", "", label);
    jb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      sec.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    jump.appendChild(jb);
  };

  const addRow = (title, nums) => {
    if (!nums.length) return null;
    const cat = el("div", "pick-cat");
    cat.appendChild(el("h3", "", title));
    const g = el("div", "pick-grid");
    nums.forEach((n) => g.appendChild(mkItem(n)));
    cat.appendChild(g);
    body.appendChild(cat);
    return cat;
  };
  const recentSec = addRow("RECENT", state.recents[B.table].filter((n) => n < table.length));
  const favSec = addRow("FAVORITES", favList(B.table).filter((n) => n < table.length));
  if (recentSec) addJumpBtn("RE", recentSec);
  if (favSec) addJumpBtn("FA", favSec);

  const catSecs = {};
  CAT_ORDER.forEach((c) => { catSecs[c] = []; });
  for (let n = 1; n < table.length; n++) {
    const def = fxDefFor(B.table, n);
    const c = def ? def.c : "weird";
    (catSecs[c] || catSecs.weird).push(n);
  }
  CAT_ORDER.forEach((c) => {
    if (!catSecs[c].length) return;
    const sec = el("div", "pick-cat");
    sec.dataset.cat = c;
    sec.appendChild(el("h3", "", CAT_LABELS[c]));
    const g = el("div", "pick-grid");
    catSecs[c].forEach((n) => g.appendChild(mkItem(n)));
    sec.appendChild(g);
    body.appendChild(sec);
    addJumpBtn(CAT_LABELS[c].slice(0, 2), sec);
  });
  $("picker-panel").appendChild(jump); /* outside the scroller so it stays put */
  $("picker").classList.add("open");
}
function closePicker() { $("picker").classList.remove("open"); }

/* ===== 10 setup panel ===== */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function renderSetup() {
  if (!$("setup").classList.contains("open")) return;
  const lines = [];
  lines.push("Build: <b>" + BUILD + "</b>");
  lines.push("Web MIDI: " + (navigator.requestMIDIAccess ? "<b>available</b>" : "<b>not available</b>"));
  lines.push("Access: " + (Midi.access ? "<b>granted</b>" : Midi.demo ? "<b>demo mode</b>" : "not requested yet"));
  const o = Midi.out(), i_ = Midi.in_();
  lines.push("Output: " + (o ? "<b>" + esc(o.name) + "</b>" : "–"));
  lines.push("Input: " + (i_ ? "<b>" + esc(i_.name) + "</b>" : "–"));
  lines.push("Last changed: <b>" + LAST_CHANGED + "</b>");
  $("diag").innerHTML = lines.join("<br>");
  const mkPortBtns = (host, ports, sel, pick) => {
    host.textContent = "";
    if (!ports.length) { host.appendChild(el("span", "label", "no ports")); return; }
    ports.forEach((p) => {
      const b = el("button", "setup-btn" + (p.name === sel ? " sel" : ""), p.name);
      b.addEventListener("click", () => { pick(p.name); Midi.refreshPorts(); });
      host.appendChild(b);
    });
  };
  const outs = [], ins = [];
  if (Midi.access) {
    Midi.access.outputs.forEach((p) => { if (Midi.live(p)) outs.push(p); });
    Midi.access.inputs.forEach((p) => { if (Midi.live(p)) ins.push(p); });
  }
  mkPortBtns($("out-list"), outs, state.midi.outName, (n) => { state.midi.outName = n; });
  mkPortBtns($("in-list"), ins, state.midi.inName, (n) => { state.midi.inName = n; });
  $("wake-toggle").textContent = "Keep screen awake: " + (state.wake ? "on" : "off");
  $("horiz-toggle").textContent = "Horizontal faders: " + (state.horizFaders ? "on" : "off");
  $("jam-knob-toggle").textContent = "JAM style: " + (state.jamKnobs ? "knobs" : "bars");
  $("theme-toggle").textContent = "Theme: " + state.theme;
  const dl = $("dfx-list");
  dl.textContent = "";
  for (let i = 0; i < 5; i++) {
    const a = directName(i + 1);
    const b = el("button", "setup-btn" + (a ? " sel" : ""), "DFX" + (i + 1) + ": " + (a || "–"));
    b.addEventListener("click", () => {
      $("setup").classList.remove("open"); /* picker sits below setup in z-order */
      openPicker(state.activeBus, i);
    });
    dl.appendChild(b);
  }
}
function openSetup() { $("setup").classList.add("open"); renderSetup(); }
function pushStateToDevice() {
  let d = 0;
  BUSES.forEach((B, i) => {
    const b = state.buses[i];
    setTimeout(() => Midi.send(B.ch, CC_FX, b.fx, true), d); d += 8;
    b.cc.forEach((v, j) => { setTimeout(() => Midi.send(B.ch, CC_CTRL[j], v, true), d); d += 8; });
    setTimeout(() => Midi.send(B.ch, CC_SW, b.on ? 127 : 0, true), d); d += 8;
  });
  showBanner("State sent (5 buses)", "info", 2500);
}

/* wake lock */
let wakeLock = null;
async function applyWake() {
  try {
    if (state.wake && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!state.wake && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch (e) { /* not granted (battery, platform): ignore */ }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const meta = $("theme-color-meta");
  if (meta) meta.content = state.theme === "light" ? "#f3f2ee" : "#121214";
}

/* ===== MIDI clock -> BPM (Link route: any connected port may carry clock) ===== */
const Clock = { src: null, last: 0, ticks: [], count: 0 };
function onClockByte(st, srcName) {
  const now = performance.now();
  if (st === 0xFA || st === 0xFC) { Clock.ticks = []; Clock.count = 0; LfoRt.forEach((r) => { r.beats = 0; r.lastT = now; }); return; }
  if (st !== 0xF8) return;
  if (Clock.src && Clock.src !== srcName && now - Clock.last < 1500) return; /* lock to one source */
  Clock.src = srcName; Clock.last = now;
  Clock.ticks.push(now);
  if (Clock.ticks.length > 49) Clock.ticks.shift();
  if (++Clock.count % 24 === 0) { /* quarter-note pulse */
    $("beat").classList.add("tick");
    setTimeout(() => $("beat").classList.remove("tick"), 90);
  }
}
function onClockOnly(e) {
  const d = e.data;
  if (!d || !d.length) return;
  const src = (e.target && e.target.name) || "?";
  if (window.busdriver && window.busdriver.monitor && d[0] !== 0xF8 && d[0] !== 0xFE)
    console.log("MIDI in (" + src + "):",
      Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" "));
  let msg = d, rt = false;
  for (let i = 0; i < d.length; i++) if (d[i] >= 0xF8) { rt = true; onClockByte(d[i], src); }
  /* despite the name, this port isn't ONLY for clock - a second device
     pinned in JAM (e.g. an MC-101) is very likely connected as one of
     these non-primary ports, not as the one selected SP-404 input */
  if (rt) msg = Array.from(d).filter((b) => b < 0xF8);
  if (msg.length < 3) return;
  if ((msg[0] & 0xF0) === 0xB0) applyRawCC(msg[0] & 0x0F, msg[1], msg[2]);
}
setInterval(() => {
  const bpmEl = $("bpm");
  const alive = performance.now() - Clock.last <= 1500 && Clock.last > 0;
  if (!alive) {
    Clock.src = null;
    bpmEl.classList.remove("on");
  } else if (Clock.ticks.length > 25) {
    const t = Clock.ticks;
    const mean = (t[t.length - 1] - t[0]) / (t.length - 1);
    Clock.bpm = 60000 / (mean * 24);
    $("bpm-val").textContent = Clock.bpm.toFixed(1);
    bpmEl.title = "MIDI clock from: " + (Clock.src || "?");
    bpmEl.classList.add("on");
  }
  if (document.body.classList.contains("xy")) renderLfo(); /* CLK/TAP label follows source */
  /* live clock diagnosis while the setup panel is open (iOS has no console) */
  if ($("setup").classList.contains("open")) {
    $("clock-diag").textContent = alive
      ? "Clock: source \"" + (Clock.src || "?") + "\" · " + $("bpm-val").textContent + " BPM · " + Clock.count + " ticks"
      : "Clock: none received" + (Clock.count ? " (last: " + Clock.count + " ticks)" : "");
  }
}, 500);

/* ===== XY pad (third view, absolute Kaoss-style position = value) ===== */
function xyAssign(axis) { return state.xy[axis]; }
function xyParam(a) {
  if (!a) return null;
  const def = fxDefFor(BUSES[a.bus].table, state.buses[a.bus].fx);
  return def ? (def.p[a.slot] || null) : null;
}
function xyLabelText(axis) {
  const a = xyAssign(axis);
  if (!a) return axis.toUpperCase() + ": – (tap)";
  const p = xyParam(a);
  return axis.toUpperCase() + ": " + BUSES[a.bus].label + " · " + (p ? p.n : "CTRL " + (a.slot + 1));
}
function positionCross(nx, ny) {
  $("xy-cross").style.left = (nx * 100) + "%";
  $("xy-cross").style.top = (ny * 100) + "%";
  $("xy-linev").style.left = (nx * 100) + "%";
  $("xy-lineh").style.top = (ny * 100) + "%";
}
function updateXyVals() {
  const parts = [];
  for (const axis of ["x", "y"]) {
    const a = xyAssign(axis);
    if (!a) continue;
    const p = xyParam(a);
    const def = fxDefFor(BUSES[a.bus].table, state.buses[a.bus].fx);
    const cc = state.buses[a.bus].cc[a.slot];
    parts.push(axis.toUpperCase() + " " + (p ? dispFromCc(p, cc, syncOnFor(a.bus, def)) : cc));
  }
  $("xy-vals").textContent = parts.join("   ") || "assign axes above";
}
function renderXy() {
  renderLfo();
  $("xy-xa").textContent = xyLabelText("x");
  $("xy-ya").textContent = xyLabelText("y");
  $("xy-mom").classList.toggle("on", !!state.xy.mom);
  const ax = xyAssign("x"), ay = xyAssign("y");
  positionCross(ax ? state.buses[ax.bus].cc[ax.slot] / 127 : 0.5,
                ay ? 1 - state.buses[ay.bus].cc[ay.slot] / 127 : 0.5);
  updateXyVals();
}
function setupXyPad() {
  const pad = $("xy-pad");
  let drag = null;
  const keyFor = (a) => a ? (BUSES[a.bus].ch << 8 | CC_CTRL[a.slot]) : null;
  function applyPos(e) {
    const r = pad.getBoundingClientRect();
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    const ax = xyAssign("x"), ay = xyAssign("y");
    if (ax) setBusCc(ax.bus, ax.slot, Math.round(nx * 127), {});
    if (ay) setBusCc(ay.bus, ay.slot, Math.round((1 - ny) * 127), {});
    positionCross(nx, ny);
    updateXyVals();
  }
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (drag) return; /* first pointer owns the pad */
    pad.setPointerCapture(e.pointerId);
    const ax = xyAssign("x"), ay = xyAssign("y");
    drag = { id: e.pointerId, prev: {
      x: ax ? state.buses[ax.bus].cc[ax.slot] : null,
      y: ay ? state.buses[ay.bus].cc[ay.slot] : null } };
    for (const a of [ax, ay]) { const k = keyFor(a); if (k !== null) Midi.activeCCs.add(k); }
    applyPos(e);
  });
  pad.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) applyPos(e); });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const prev = drag.prev;
    drag = null;
    const ax = xyAssign("x"), ay = xyAssign("y");
    for (const a of [ax, ay]) { const k = keyFor(a); if (k !== null) Midi.activeCCs.delete(k); }
    if (state.xy.mom) {
      /* spring back: short ramp to the pre-touch values */
      const from = {
        x: ax ? state.buses[ax.bus].cc[ax.slot] : null,
        y: ay ? state.buses[ay.bus].cc[ay.slot] : null };
      const STEPS = 4;
      for (let s = 1; s <= STEPS; s++) {
        setTimeout(() => {
          const f = s / STEPS;
          if (ax && prev.x !== null) setBusCc(ax.bus, ax.slot, Math.round(from.x + (prev.x - from.x) * f), { force: s === STEPS });
          if (ay && prev.y !== null) setBusCc(ay.bus, ay.slot, Math.round(from.y + (prev.y - from.y) * f), { force: s === STEPS });
          if (s === STEPS) renderXy();
        }, s * 30);
      }
    } else {
      /* trailing send */
      if (ax) Midi.send(BUSES[ax.bus].ch, CC_CTRL[ax.slot], state.buses[ax.bus].cc[ax.slot], true);
      if (ay) Midi.send(BUSES[ay.bus].ch, CC_CTRL[ay.slot], state.buses[ay.bus].cc[ay.slot], true);
    }
  }
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
}

/* ===== XY presets: curated templates (real parameter names, like the JAM
   presets) plus the user's own saved axis combos ===== */
const XY_TEMPLATES = [
  { id: "isolator", name: "Isolator — LOW × HIGH", fx: "Isolator", x: "LOW", y: "HIGH",
    note: "Cut the lows on one side, the highs on the other — park in a corner to isolate the mids." },
  { id: "super-filter", name: "Super Filter — CUTOFF × RESONANCE", fx: "Super Filter", x: "CUTOFF", y: "RESONANCE",
    note: "Classic filter sweep, with resonance piling on as you go." },
  { id: "tape-echo", name: "Tape Echo — TIME × FEEDBACK", fx: "Tape Echo", x: "TIME", y: "FEEDBACK",
    note: "Drag right for longer echoes, up for more repeats." },
  { id: "phaser", name: "Phaser — RATE × DEPTH", fx: "Phaser", x: "RATE", y: "DEPTH",
    note: "How fast it sweeps vs. how far — anywhere from a subtle swirl to full jet-flange." },
  { id: "wah", name: "Wah — MANUAL × PEAK", fx: "Wah", x: "MANUAL", y: "PEAK",
    note: "Pedal position and resonance peak in one gesture, DJ-scratch style." },
  { id: "resonator", name: "Resonator — BRIGHT × FEEDBACK", fx: "Resonator", x: "BRIGHT", y: "FEEDBACK",
    note: "Tone and ring-out length of the pitched resonance." },
];
function xyTemplateBuses(t) {
  return BUSES.map((B, i) => (BUS_TABLES[B.table].includes(t.fx) ? i : null)).filter((i) => i !== null);
}
const XY_PRESETS_MAX = 16;
function sanitizeXyPreset(p) {
  if (!p || typeof p !== "object") return null;
  const axis = (a) => (a && a.bus >= 0 && a.bus < 5 && a.slot >= 0 && a.slot < 6) ? { bus: a.bus | 0, slot: a.slot | 0 } : null;
  const x = axis(p.x), y = axis(p.y);
  if (!x || !y) return null;
  return {
    id: (typeof p.id === "string" && p.id) ? p.id : "xy" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: (typeof p.name === "string" && p.name.trim()) ? p.name.slice(0, 24) : "Combo",
    x, y, mom: !!p.mom,
  };
}
function openXyPresets() {
  $("xypreset-title").textContent = "XY PRESETS";
  $("xypreset-note").textContent = "Templates switch the bus to that effect if it isn't already " +
    "loaded, then assign both axes from its real parameter names. Your own combos just re-point " +
    "X/Y to wherever they were pointed when you saved them.";
  renderXyTemplateList();
  renderXyCustomList();
  $("xypreset").classList.add("open");
}
function renderXyTemplateList() {
  const host = $("xypreset-templates");
  host.textContent = "";
  XY_TEMPLATES.forEach((t) => {
    const b = el("button", "setup-btn", t.name);
    b.addEventListener("click", () => openXyTemplateBusPick(t));
    host.appendChild(b);
  });
}
function openXyTemplateBusPick(t) {
  const host = $("xypreset-templates");
  host.textContent = "";
  const back = el("button", "setup-btn", "‹ Back");
  back.addEventListener("click", renderXyTemplateList);
  host.appendChild(back);
  xyTemplateBuses(t).forEach((i) => {
    const b = el("button", "setup-btn", BUSES[i].label);
    b.addEventListener("click", () => applyXyTemplate(t, i));
    host.appendChild(b);
  });
  $("xypreset-note").textContent = t.note + " Pick which bus.";
}
function applyXyTemplate(t, bus) {
  const table = BUSES[bus].table;
  const fxNum = BUS_TABLES[table].indexOf(t.fx);
  if (fxNum < 0) { showBanner("That effect isn't on this bus", "warn", 2500); return; }
  if (state.buses[bus].fx !== fxNum) fxChange(bus, fxNum, "user");
  const def = fxDefFor(table, fxNum);
  const xi = def.p.findIndex((p) => p.n === t.x);
  const yi = def.p.findIndex((p) => p.n === t.y);
  if (xi < 0 || yi < 0) { showBanner("Couldn't find those parameters", "warn", 2500); return; }
  state.xy.x = { bus, slot: xi };
  state.xy.y = { bus, slot: yi };
  saveState();
  setActiveBus(bus);
  renderXy();
  $("xypreset").classList.remove("open");
  showBanner("\"" + t.name + "\" applied to " + BUSES[bus].label, "info", 2500);
}
function renderXyCustomList() {
  const host = $("xypreset-custom");
  host.textContent = "";
  if (!state.xyPresets.length) {
    host.appendChild(el("p", "pick-note", "No saved combos yet — dial in an X/Y pair below, then “Save current”."));
    return;
  }
  state.xyPresets.forEach((p) => {
    const row = el("div", "xy-custom-row");
    const nameBtn = el("button", "setup-btn xy-custom-name", p.name);
    nameBtn.addEventListener("click", () => applyXyCustom(p));
    const ren = el("button", "xy-custom-icon", "✎");
    ren.addEventListener("click", (e) => { e.stopPropagation(); renameXyPreset(row, p); });
    const del = el("button", "xy-custom-icon", "✕");
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteXyPreset(p.id); });
    row.appendChild(nameBtn); row.appendChild(ren); row.appendChild(del);
    host.appendChild(row);
  });
}
function renameXyPreset(row, p) {
  const nameBtn = row.querySelector(".xy-custom-name");
  const input = el("input", "xy-custom-edit");
  input.type = "text"; input.maxLength = 24; input.value = p.name;
  nameBtn.replaceWith(input);
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") { input.value = p.name; input.blur(); }
  });
  input.addEventListener("blur", () => {
    const v = input.value.trim();
    if (v) p.name = v.slice(0, 24);
    saveState();
    renderXyCustomList();
  });
  setTimeout(() => { input.focus(); input.select(); }, 30);
}
function applyXyCustom(p) {
  state.xy.x = { bus: p.x.bus, slot: p.x.slot };
  state.xy.y = { bus: p.y.bus, slot: p.y.slot };
  state.xy.mom = !!p.mom;
  saveState();
  renderXy();
  $("xypreset").classList.remove("open");
  showBanner("\"" + p.name + "\" applied", "info", 2000);
}
function deleteXyPreset(id) {
  state.xyPresets = state.xyPresets.filter((p) => p.id !== id);
  saveState();
  renderXyCustomList();
}
function saveCurrentXyPreset() {
  const ax = xyAssign("x"), ay = xyAssign("y");
  if (!ax || !ay) { showBanner("Assign both X and Y first", "info", 2500); return; }
  if (state.xyPresets.length >= XY_PRESETS_MAX) { showBanner("Combo list is full — delete one first", "warn", 2500); return; }
  const p = {
    id: "xy" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: "Combo " + (state.xyPresets.length + 1),
    x: { bus: ax.bus, slot: ax.slot }, y: { bus: ay.bus, slot: ay.slot }, mom: !!state.xy.mom,
  };
  state.xyPresets.push(p);
  saveState();
  renderXyCustomList();
  const row = [...$("xypreset-custom").children].find((r) => r.querySelector(".xy-custom-name")?.textContent === p.name);
  if (row) renameXyPreset(row, p);
}

let xyPickAxis = "x", xyPickBus = 0;
function openXyPick(axis) {
  xyPickAxis = axis;
  const a = axis === "lfo" ? state.lfos[lfoSel].target : xyAssign(axis);
  xyPickBus = a ? a.bus : state.activeBus;
  $("xypick-title").textContent = axis === "lfo" ? "LFO TARGET" : (axis === "x" ? "X" : "Y") + " AXIS";
  renderXyPick();
  $("xypick").classList.add("open");
}
function renderXyPick() {
  const bh = $("xypick-bus");
  bh.textContent = "";
  BUSES.forEach((B, i) => {
    const b = el("button", "setup-btn" + (i === xyPickBus ? " sel" : ""), B.label);
    b.addEventListener("click", () => { xyPickBus = i; renderXyPick(); });
    bh.appendChild(b);
  });
  const sh = $("xypick-slot");
  sh.textContent = "";
  const def = fxDefFor(BUSES[xyPickBus].table, state.buses[xyPickBus].fx);
  const cur = xyPickAxis === "lfo" ? state.lfos[lfoSel].target : xyAssign(xyPickAxis);
  for (let i = 0; i < 6; i++) {
    const p = def && def.p[i];
    const sel = cur && cur.bus === xyPickBus && cur.slot === i;
    const b = el("button", "setup-btn" + (sel ? " sel" : ""), (i + 1) + " · " + (p ? p.n : "CTRL " + (i + 1)));
    b.addEventListener("click", () => {
      if (xyPickAxis === "lfo") {
        const rt = LfoRt[lfoSel];
        const old = state.lfos[lfoSel].target;
        if (rt.on && old && (old.bus !== xyPickBus || old.slot !== i))
          setBusCc(old.bus, old.slot, rt.center, { force: true }); /* park the abandoned target */
        LfoRt.forEach((r, j) => { /* one target belongs to one slot */
          if (j !== lfoSel && r.on) {
            const o = state.lfos[j].target;
            if (o && o.bus === xyPickBus && o.slot === i) r.on = false;
          }
        });
        state.lfos[lfoSel].target = { bus: xyPickBus, slot: i };
        if (rt.on) { rt.center = state.buses[xyPickBus].cc[i]; rt.beats = 0; rt.lastT = performance.now(); }
        renderLfo();
      } else {
        state.xy[xyPickAxis] = { bus: xyPickBus, slot: i };
        renderXy();
      }
      saveState();
      $("xypick").classList.remove("open");
    });
    sh.appendChild(b);
  }
}
let xyReturnOverview = false;
function toggleXyView() {
  if (currentView() === "xy") setView(xyReturnOverview ? "overview" : "focus");
  else { xyReturnOverview = currentView() === "overview"; setView("xy"); }
}

/* ===== beat LFOs (4 slots: 3 LFOs + drift; clock-synced, tap fallback) ===== */
const LFO_WAVES = ["SIN", "TRI", "SQR", "SAW", "RND"];
const LFO_RATES = [["4/1", 16], ["2/1", 8], ["1/1", 4], ["1/2", 2], ["1/4", 1], ["1/8", 0.5], ["1/16", 0.25]];
const LFO_DEPTHS = [25, 50, 75, 100];
const LfoRt = [0, 1, 2, 3].map(() => ({ on: false, beats: 0, lastT: 0, center: 64, cyc: -1, ra: 0, rb: 0 }));
let lfoSel = 0, lfoTaps = [];
const lfoChips = [];
function clockAlive() { return Clock.last > 0 && performance.now() - Clock.last <= 1500; }
function lfoBpm() { return (clockAlive() && Clock.bpm) ? Clock.bpm : state.tapBpm; }
function lfoToggle() {
  const rt = LfoRt[lfoSel], t = state.lfos[lfoSel].target;
  if (!rt.on && !t) { showBanner("Choose an LFO target first", "info", 2200); return; }
  rt.on = !rt.on;
  if (rt.on) {
    LfoRt.forEach((r, j) => { /* one target belongs to one slot */
      if (j !== lfoSel && r.on) {
        const o = state.lfos[j].target;
        if (o && o.bus === t.bus && o.slot === t.slot) r.on = false;
      }
    });
    rt.center = state.buses[t.bus].cc[t.slot];
    rt.beats = 0; rt.lastT = performance.now();
    rt.cyc = -1; rt.ra = 0; rt.rb = 0;
  } else if (t) {
    setBusCc(t.bus, t.slot, rt.center, { force: true }); /* park at center */
  }
  renderLfo();
}
setInterval(() => {
  const now = performance.now();
  for (let i = 0; i < 4; i++) {
    const rt = LfoRt[i];
    if (!rt.on) continue;
    const cfg = state.lfos[i], t = cfg.target;
    if (!t) { rt.on = false; continue; }
    const B = BUSES[t.bus], b = state.buses[t.bus];
    if (Midi.activeCCs.has(B.ch << 8 | CC_CTRL[t.slot])) {
      rt.center = b.cc[t.slot]; /* a finger wins and re-centers */
      continue;
    }
    /* incremental phase: BPM jitter only affects the current slice */
    rt.beats += Math.min(now - rt.lastT, 1000) / 60000 * lfoBpm();
    rt.lastT = now;
    const cyc = rt.beats / LFO_RATES[cfg.rate][1];
    const ph = cyc - Math.floor(cyc);
    const wave = LFO_WAVES[cfg.wave];
    let w;
    if (wave === "SIN") w = Math.sin(ph * 2 * Math.PI);
    else if (wave === "TRI") w = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    else if (wave === "SQR") w = ph < 0.5 ? 1 : -1;
    else if (wave === "SAW") w = ph * 2 - 1;
    else { /* RND: drift between random anchors, renewed once per cycle */
      const k = Math.floor(cyc);
      if (k !== rt.cyc) { rt.cyc = k; rt.ra = rt.rb; rt.rb = Math.random() * 2 - 1; }
      w = rt.ra + (rt.rb - rt.ra) * ph;
    }
    const amp = LFO_DEPTHS[cfg.depth] / 100 * 63.5;
    const cc = clamp(Math.round(rt.center + w * amp), 0, 127);
    if (b.cc[t.slot] !== cc) {
      b.cc[t.slot] = cc; /* no saveState: a wobbling value is not worth persisting */
      Midi.send(B.ch, CC_CTRL[t.slot], cc);
      queueSlotRender(t.bus, t.slot);
    }
  }
}, 33);
function lfoTargetLabel(cfg) {
  const t = cfg.target;
  if (!t) return "Target: – (tap)";
  const def = fxDefFor(BUSES[t.bus].table, state.buses[t.bus].fx);
  const p = def && def.p[t.slot];
  return "Target: " + BUSES[t.bus].label + " · " + (p ? p.n : "CTRL " + (t.slot + 1));
}
function renderLfo() {
  lfoChips.forEach((c, i) => {
    c.classList.toggle("sel", i === lfoSel);
    c.classList.toggle("running", LfoRt[i].on);
  });
  const cfg = state.lfos[lfoSel];
  $("lfo-on").classList.toggle("on", LfoRt[lfoSel].on);
  $("lfo-target").textContent = lfoTargetLabel(cfg);
  $("lfo-wave").textContent = LFO_WAVES[cfg.wave];
  $("lfo-rate").textContent = LFO_RATES[cfg.rate][0];
  $("lfo-depth").textContent = LFO_DEPTHS[cfg.depth] + "%";
  $("lfo-tap").textContent = clockAlive() ? "CLK " + Math.round(lfoBpm()) : "TAP " + Math.round(state.tapBpm);
}
function lfoTap() {
  const now = performance.now();
  lfoTaps = lfoTaps.filter((x) => now - x < 3000);
  lfoTaps.push(now);
  if (lfoTaps.length >= 2) {
    const iv = (lfoTaps[lfoTaps.length - 1] - lfoTaps[0]) / (lfoTaps.length - 1);
    state.tapBpm = clamp(Math.round(60000 / iv), 30, 300);
    LfoRt.forEach((r) => { r.beats = 0; r.lastT = now; }); /* anchor phases to the tap */
    saveState();
  }
  renderLfo();
}

/* ===== pattern grid (Program Change; bank = MIDI channel; needs Mode B) ===== */
const BANK_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
/* compact A/F-style bank pickers (PTN, PADS): each of the 5 pair buttons
   remembers its OWN last-used letter independently, rather than a shared
   "current half" that follows whichever bank happens to be selected - the
   shared version let clicking a pair jump somewhere other than what its
   own label last showed, which was genuinely easy to get lost in. */
function pairJump(current, i, halfMem) {
  let next;
  if (current === i) next = i + 5;
  else if (current === i + 5) next = i;
  else next = halfMem[i] ? i + 5 : i;
  halfMem[i] = next >= 5;
  return next;
}
const ptnPairHalf = [false, false, false, false, false];
const padPairHalf = [false, false, false, false, false];
function renderPattern() {
  const bh = $("ptn-banks");
  bh.textContent = "";
  /* one button per row-pair (A/F, B/G, C/H, D/I, E/J - row i pairs bank i
     with bank i+5) instead of a button per bank, same compaction as PADS.
     Each pair remembers its own last letter independently (pairJump). */
  for (let i = 0; i < 5; i++) {
    const b = el("button", (state.ptn.bank === i || state.ptn.bank === i + 5) ? "active" : "");
    b.appendChild(el("span", state.ptn.bank === i ? "sel" : "", BANK_NAMES[i]));
    b.appendChild(document.createTextNode("/"));
    b.appendChild(el("span", state.ptn.bank === i + 5 ? "sel" : "", BANK_NAMES[i + 5]));
    /* click, not pointerdown: the view scrolls in phone landscape */
    b.addEventListener("click", () => {
      state.ptn.bank = pairJump(state.ptn.bank, i, ptnPairHalf);
      saveState();
      renderPattern();
    });
    bh.appendChild(b);
  }
  const g = $("ptn-grid");
  g.textContent = "";
  for (let pc = 0; pc < 16; pc++) {
    const sent = state.ptn.last && state.ptn.last.bank === state.ptn.bank && state.ptn.last.pc === pc;
    const b = el("button", "pad" + (sent ? " sent" : ""), String(pc + 1));
    b.addEventListener("click", () => {
      /* don't claim success (highlighting the pad) when nothing actually
         went out - a silently dropped MIDI connection looked identical to
         a working pattern change otherwise */
      if (!Midi.sendPc(state.ptn.bank, pc)) {
        showBanner("SP-404 not connected - pattern not sent", "warn", 4000);
        return;
      }
      state.ptn.last = { bank: state.ptn.bank, pc };
      saveState();
      renderPattern();
    });
    g.appendChild(b);
  }
}

/* ===== play view: chromatic keys / vocoder keys / pad board =====
   note map (Mode B): pads on two adjacent channels (device setting "Pad
   MIDI Channels", default 1/2): lower = banks A-E, upper = F-J; block of 16
   notes per bank starting at 12, in pad order 13..16/9..12/5..8/1..4.
   Chromatic play: CH 16, notes 36-60. Vocoder pitch: CH 11 + pitch bend. */
const PAD_ORDER = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4];
/* display rows top->bottom exactly like the device: pad 1 top-left, 13 bottom-left.
   (note mapping is separate: PAD_ORDER, lowest notes on the bottom row) */
const PAD_ROWS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
function padNote(bank, pad) {
  const half = bank < 5 ? 0 : 1;
  return { ch: state.play.padChPair + half, note: 12 + (bank % 5) * 16 + PAD_ORDER.indexOf(pad) };
}
const heldNotes = new Map(); /* pointerId -> {ch, note, el} */
function flushNotesIn(host) {
  /* rebuilds must never orphan a held note (mirrors finishDragsIn) */
  for (const [id, h] of [...heldNotes]) {
    if (!host || host.contains(h.el)) {
      Midi.sendNote(h.ch, h.note, false);
      h.el.classList.remove("on", "hit");
      heldNotes.delete(id);
    }
  }
}
let flushBend = () => {};
function noteName(n) { return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1); }
function attachNoteSource(btn, getNote) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const nt = getNote();
    if (!nt) return;
    /* don't show the pad/key as pressed when nothing actually went out -
       matches the same fix on the pattern grid (renderPattern) */
    if (!Midi.sendNote(nt.ch, nt.note, true)) {
      showBanner("SP-404 not connected - nothing sent", "warn", 4000);
      return;
    }
    btn.setPointerCapture(e.pointerId);
    heldNotes.set(e.pointerId, { ch: nt.ch, note: nt.note, el: btn });
    btn.classList.add(btn.classList.contains("key") ? "on" : "hit");
  });
  const up = (e) => {
    const h = heldNotes.get(e.pointerId);
    if (!h || h.el !== btn) return;
    heldNotes.delete(e.pointerId);
    btn.classList.remove("on", "hit");
    Midi.sendNote(h.ch, h.note, false);
  };
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
}
function keysRange() {
  const narrow = window.innerWidth < 700;
  if (state.play.target === "sample") {
    if (!narrow) return [36, 60];
    return state.play.oct >= 1 ? [48, 60] : [36, 48];
  }
  const lo = clamp(48 + state.play.oct * 12, 12, 96);
  return [lo, lo + (narrow ? 12 : 24)];
}
function playCh() { return state.play.target === "sample" ? 15 : 10; }
const BLACKS = [1, 3, 6, 8, 10];
function buildKeys() {
  const host = $("keys");
  flushNotesIn(host);
  host.textContent = "";
  const r = keysRange(), lo = r[0], hi = r[1];
  let whiteCount = 0;
  for (let n = lo; n <= hi; n++) if (BLACKS.indexOf(n % 12) < 0) whiteCount++;
  const ww = 100 / whiteCount;
  let wi = 0;
  for (let n = lo; n <= hi; n++) {
    const black = BLACKS.indexOf(n % 12) >= 0;
    const key = el("button", "key " + (black ? "black" : "white"));
    if (black) {
      key.style.left = (wi * ww - ww * 0.3) + "%";
      key.style.width = (ww * 0.6) + "%";
    } else {
      key.style.left = (wi * ww) + "%";
      key.style.width = ww + "%";
      if (n % 12 === 0) key.appendChild(el("span", "kl", noteName(n)));
      wi++;
    }
    const note = n;
    attachNoteSource(key, () => ({ ch: playCh(), note }));
    host.appendChild(key);
  }
}
let padPickSlot = 0, padPickBank = 0;
function buildPads() {
  const bh = $("pad-banks");
  bh.textContent = "";
  /* compact bank picker: one button per row-pair (A/F, B/G, C/H, D/I, E/J -
     row i pairs bank i with bank i+5, the two Mode-B channel halves) instead
     of a button per bank - still reaches all 10, just less space. Each pair
     remembers its own last letter independently (pairJump). */
  for (let i = 0; i < 5; i++) {
    const b = el("button", (state.play.padBank === i || state.play.padBank === i + 5) ? "active" : "");
    b.appendChild(el("span", state.play.padBank === i ? "sel" : "", BANK_NAMES[i]));
    b.appendChild(document.createTextNode("/"));
    b.appendChild(el("span", state.play.padBank === i + 5 ? "sel" : "", BANK_NAMES[i + 5]));
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.play.padBank = pairJump(state.play.padBank, i, padPairHalf);
      saveState();
      buildPads();
    });
    bh.appendChild(b);
  }
  const star = el("button", state.play.padBank === 10 ? "active" : "", "★");
  star.addEventListener("pointerdown", (e) => { e.preventDefault(); state.play.padBank = 10; saveState(); buildPads(); });
  bh.appendChild(star);
  const g = $("pad-grid");
  flushNotesIn(g);
  g.textContent = "";
  const custom = state.play.padBank === 10;
  const cells = custom ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : PAD_ROWS.reduce((a, r2) => a.concat(r2), []);
  cells.forEach((cell) => {
    const btn = el("button", "pad");
    if (custom) {
      const a = state.play.custom[cell];
      btn.appendChild(el("span", "", a ? BANK_NAMES[a.bank] + a.pad : "–"));
      btn.appendChild(el("span", "pl", a ? "hold: edit" : "hold: assign"));
      attachNoteSource(btn, () => {
        const asg = state.play.custom[cell];
        return asg ? padNote(asg.bank, asg.pad) : null;
      });
      let hold = null;
      btn.addEventListener("pointerdown", () => {
        hold = setTimeout(() => {
          /* long-press edits: silence the note the touch just started */
          for (const [id, h] of [...heldNotes]) {
            if (h.el === btn) { Midi.sendNote(h.ch, h.note, false); heldNotes.delete(id); btn.classList.remove("hit"); }
          }
          openPadPick(cell);
        }, 500);
      });
      const clr = () => clearTimeout(hold);
      btn.addEventListener("pointerup", clr);
      btn.addEventListener("pointercancel", clr);
    } else {
      btn.textContent = String(cell);
      attachNoteSource(btn, () => padNote(state.play.padBank, cell));
    }
    g.appendChild(btn);
  });
}
function openPadPick(slot) {
  padPickSlot = slot;
  const a = state.play.custom[slot];
  padPickBank = a ? a.bank : 0;
  renderPadPick();
  $("padpick").classList.add("open");
}
function renderPadPick() {
  const bh = $("padpick-bank");
  bh.textContent = "";
  BANK_NAMES.forEach((n, i) => {
    const b = el("button", "setup-btn" + (i === padPickBank ? " sel" : ""), n);
    b.addEventListener("click", () => { padPickBank = i; renderPadPick(); });
    bh.appendChild(b);
  });
  const ph = $("padpick-pad");
  ph.textContent = "";
  const a = state.play.custom[padPickSlot];
  for (let p = 1; p <= 16; p++) {
    const sel = a && a.bank === padPickBank && a.pad === p;
    const b = el("button", "setup-btn" + (sel ? " sel" : ""), String(p));
    b.addEventListener("click", () => {
      state.play.custom[padPickSlot] = { bank: padPickBank, pad: p };
      saveState();
      $("padpick").classList.remove("open");
      buildPads();
    });
    ph.appendChild(b);
  }
}
const SCALES = [
  ["MAJ", [0, 2, 4, 5, 7, 9, 11]],
  ["MIN", [0, 2, 3, 5, 7, 8, 10]],
  ["MIN-P", [0, 3, 5, 7, 10]],
  ["MAJ-P", [0, 2, 4, 7, 9]],
  ["DOR", [0, 2, 3, 5, 7, 9, 10]],
  ["MIXO", [0, 2, 4, 5, 7, 9, 10]],
  ["BLUES", [0, 3, 5, 6, 7, 10]],
];
function buildScale() {
  const g = $("scale-grid");
  flushNotesIn(g);
  g.textContent = "";
  const iv = SCALES[state.play.scaleType][1];
  const base = (state.play.target === "sample" ? 36 : 48) + state.play.scaleRoot;
  const deg = (d) => base + Math.floor(d / iv.length) * 12 + iv[d % iv.length];
  /* rows bottom-up; ISO = rows a musical 4th apart (Move/Push layout) */
  for (let row = 3; row >= 0; row--) {
    const start = state.play.iso ? row * 3 : row * 4;
    for (let col = 0; col < 4; col++) {
      const n = deg(start + col);
      const oor = state.play.target === "sample" ? (n < 36 || n > 60) : (n < 0 || n > 127);
      const isRoot = (n - base) % 12 === 0;
      const btn = el("button", "pad" + (isRoot ? " root" : "") + (oor ? " oor" : ""), noteName(n));
      if (!oor) attachNoteSource(btn, () => ({ ch: playCh(), note: n }));
      g.appendChild(btn);
    }
  }
}
function renderPlay() {
  const mode = state.play.mode;
  $("view-play").classList.toggle("pads", mode === "pads");
  $("view-play").classList.toggle("scale", mode === "scale");
  $("play-keys-btn").classList.toggle("on", mode === "keys");
  $("play-scale-btn").classList.toggle("on", mode === "scale");
  $("play-pads-btn").classList.toggle("on", mode === "pads");
  const show = (id, on) => { $(id).style.display = on ? "" : "none"; };
  show("play-oct-down", mode === "keys");
  show("play-oct-up", mode === "keys");
  show("play-root", mode === "scale");
  show("play-scalesel", mode === "scale");
  show("play-layout", mode === "scale");
  $("play-target").textContent = mode === "pads"
    ? "PAD-CH " + (state.play.padChPair + 1) + "/" + (state.play.padChPair + 2)
    : (state.play.target === "sample" ? "SAMPLE CH16" : "VOCODER CH11");
  $("play-root").textContent = NOTE_NAMES[state.play.scaleRoot];
  $("play-scalesel").textContent = SCALES[state.play.scaleType][0];
  $("play-layout").textContent = state.play.iso ? "ISO" : "LIN";
  $("bend").classList.toggle("off", !(mode === "keys" && state.play.target === "voc"));
  $("play-note").textContent = mode === "pads"
    ? "Note map mode B, channels " + (state.play.padChPair + 1) + "/" + (state.play.padChPair + 2) + " (device setting \"Pad MIDI Channels\"). ★ = custom layout."
    : mode === "scale"
      ? "Scale pads " + NOTE_NAMES[state.play.scaleRoot] + " " + SCALES[state.play.scaleType][0] + ": bottom left = root, " + (state.play.iso ? "rows a fourth apart (Move layout)" : "rows continuous") + ". Roots highlighted."
      : state.play.target === "sample"
        ? "Chromatic: pitches whichever sample you last tapped in PADS (CH 16, fixed - independent of the Pad MIDI Channels setting; C2–C4)."
        : "Vocoder: pitches for the INPUT vocoder (CH 11); pitch bend on the right.";
  if (mode === "pads") buildPads(); else if (mode === "scale") buildScale(); else buildKeys();
}
function setupBend() {
  const bend = $("bend"), ind = $("bend-ind");
  let bid = null;
  function pos(e) {
    const r = bend.getBoundingClientRect();
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    ind.style.top = "calc(" + (ny * 100) + "% - 12px)";
    Midi.sendBend(10, Math.round((1 - ny) * 16383));
  }
  bend.addEventListener("pointerdown", (e) => { e.preventDefault(); bend.setPointerCapture(e.pointerId); bid = e.pointerId; pos(e); });
  bend.addEventListener("pointermove", (e) => { if (e.pointerId === bid) pos(e); });
  flushBend = () => {
    bid = null;
    ind.style.top = "calc(50% - 12px)";
    Midi.sendBend(10, 8192); /* spring back to center (idempotent) */
  };
  const end = (e) => { if (e.pointerId === bid) flushBend(); };
  bend.addEventListener("pointerup", end);
  bend.addEventListener("pointercancel", end);
}

/* ===== 11 fx prev/next through favorites ===== */
function fxStep(dir) {
  const bus = state.activeBus, B = BUSES[bus], table = BUS_TABLES[B.table];
  let list = favList(B.table);
  if (!list.length) list = state.recents[B.table].slice();
  if (!list.length) list = Array.from({ length: table.length - 1 }, (_, i) => i + 1);
  list = list.filter((n) => n > 0 && n < table.length);
  if (!list.length) return;
  const pos = list.indexOf(state.buses[bus].fx);
  const next = pos < 0 ? list[0] : list[(pos + dir + list.length) % list.length];
  fxChange(bus, next, "user");
}

/* ===== 11b JAM: user-programmable pinned controls =====
   Two independent value sources per slot:
   - "bus": pins a real SP-404 bus/ctrl slot (same CC the currently loaded
     effect on that bus uses) - reuses setBusCc, so it stays in sync with the
     Focus view and hardware encoder input for that slot automatically.
   - "raw": arbitrary channel/CC/Note/PC to any connected MIDI output,
     independent of the SP-404 (e.g. an MC-101 on a second port). */
function jamGet(cfg) { return cfg.source === "bus" ? state.buses[cfg.bus].cc[cfg.ctrl] : cfg.val; }
function jamSet(cfg, v, opts) {
  v = clamp(v | 0, 0, 127);
  if (cfg.source === "bus") { setBusCc(cfg.bus, cfg.ctrl, v, opts); return; }
  cfg.val = v;
  Midi.sendToPort(cfg.port, cfg.ch, cfg.num, v);
  saveState();
}
/* JAM scene pads (bus-scene recall): kept live so a backgrounded tab or a
   rebuild mid-hold can force-release them rather than leaving a bus stuck */
const jamSceneActive = new Set();
function jamPadFire(cfg, on) {
  if (cfg.source === "scene") {
    if (on) {
      cfg._revert = { fx: state.buses[cfg.bus].fx, cc: state.buses[cfg.bus].cc.slice(), on: state.buses[cfg.bus].on };
      /* force EFX on regardless of what was captured - the whole point of
         pressing this is to hear the effect; a bus that happened to be off
         at capture time shouldn't silently stay inaudible while held */
      applyBusState(cfg.bus, { fx: cfg.fx, cc: cfg.cc, on: true });
      cfg._active = true;
      jamSceneActive.add(cfg);
    } else if (cfg._revert) {
      /* always restores exactly what was captured on press - including the
         effect itself, not just its values - regardless of anything tweaked
         while held. Predictable momentary behavior: release never silently
         rewrites the saved scene, a stray touch mid-hold can't cost you
         a carefully-set-up scene. */
      applyBusState(cfg.bus, cfg._revert);
      cfg._revert = null;
      cfg._active = false;
      jamSceneActive.delete(cfg);
    }
    return;
  }
  if (cfg.source === "bus") { setBusCc(cfg.bus, cfg.ctrl, on ? cfg.onVal : cfg.offVal, { force: true }); return; }
  if (cfg.type === "pc") { if (on) Midi.sendPcTo(cfg.port, cfg.ch, cfg.num); return; }
  if (cfg.type === "note") { Midi.sendNoteTo(cfg.port, cfg.ch, cfg.num, on, cfg.vel); return; }
  cfg.val = on ? cfg.onVal : cfg.offVal;
  Midi.sendToPort(cfg.port, cfg.ch, cfg.num, cfg.val);
  saveState();
}
function releaseAllJamScenes() {
  [...jamSceneActive].forEach((cfg) => jamPadFire(cfg, false));
}
function jamLabel(cfg) {
  if (cfg.label) return cfg.label;
  if (cfg.source === "scene") return BUSES[cfg.bus].short + " SCENE";
  return cfg.source === "bus" ? BUSES[cfg.bus].short + " · CTRL" + (cfg.ctrl + 1) : (cfg.type === "note" ? "N" : cfg.type === "pc" ? "PC" : "CC") + cfg.num;
}
function attachJamPad(btn, cfg) {
  let down = false;
  const isOn = () => cfg.source === "scene" ? !!cfg._active : (cfg.type !== "note" && jamGet(cfg) >= 64);
  function paint() { if (cfg.mode === "toggle") btn.classList.toggle("on", isOn()); }
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    down = true;
    if (cfg.mode === "toggle") { jamPadFire(cfg, !isOn()); paint(); }
    else { jamPadFire(cfg, true); btn.classList.add("on"); }
  });
  function release(e) {
    if (!down) return;
    down = false;
    if (cfg.mode !== "toggle") { jamPadFire(cfg, false); btn.classList.remove("on"); }
  }
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  paint();
  return { update: paint };
}
function buildJamFaderDom(cfg) {
  const fader = el("div", "fader");
  const val = el("button", "fader-val display mono");
  const trackWrap = el("div", "fader-track-wrap");
  const track = el("div", "fader-track");
  const fill = el("div", "fader-fill");
  const thumb = el("div", "fader-thumb");
  const knobWrap = el("div", "jam-knob-wrap");
  const knobDial = el("div", "jam-knob-dial");
  const knobPointer = el("div", "jam-knob-pointer");
  const big = el("div", "bigval display mono");
  track.appendChild(fill); track.appendChild(thumb);
  trackWrap.appendChild(track);
  knobDial.appendChild(knobPointer);
  knobWrap.appendChild(knobDial);
  fader.appendChild(val); fader.appendChild(trackWrap); fader.appendChild(knobWrap); fader.appendChild(big);
  function update() {
    const v = jamGet(cfg);
    const pct = v / 127 * 100;
    paintFader(fill, thumb, pct);
    paintKnob(knobDial, knobPointer, pct);
    val.textContent = String(v);
    big.textContent = String(v);
  }
  update();
  const echoKey = cfg.source === "bus" ? (BUSES[cfg.bus].ch << 8 | CC_CTRL[cfg.ctrl])
    : (cfg.source === "raw" && cfg.type === "cc") ? (cfg.ch << 8 | cfg.num) : null;
  attachFaderDrag(fader, { val, big, track }, {
    key: "jam:" + cfg.id, echoKey, allowHoriz: false, sensitivity: 180,
    get: () => jamGet(cfg),
    /* bus-source repaints async via queueSlotRender -> jamByBusSlot; raw
       source has no such hook, so paint synchronously here for both -
       harmless extra paint for bus (RAF would've done it a moment later),
       required for raw (nothing else ever repaints it) */
    set: (v, o) => { jamSet(cfg, v, o); update(); },
    onDefault: () => 64,
    trailingSend: () => {
      if (cfg.source === "bus") Midi.send(BUSES[cfg.bus].ch, CC_CTRL[cfg.ctrl], jamGet(cfg), true);
      else Midi.sendToPort(cfg.port, cfg.ch, cfg.num, jamGet(cfg));
    },
  });
  return { fader, update };
}
function registerJamUpdate(cfg, fn) {
  if (cfg.source === "bus") {
    const k = cfg.bus * 8 + cfg.ctrl;
    if (!jamByBusSlot.has(k)) jamByBusSlot.set(k, new Set());
    jamByBusSlot.get(k).add(fn);
  } else if (cfg.source === "raw" && cfg.type === "cc") {
    if (!jamRawUpdateFns.has(cfg.id)) jamRawUpdateFns.set(cfg.id, new Set());
    jamRawUpdateFns.get(cfg.id).add(fn);
  }
}
let jamEditing = false;
/* select mode: mutually exclusive with edit mode so a tap on a tile is
   never ambiguous between "toggle selection" and "start a reorder drag" */
let jamSelectMode = false;
const jamSelected = new Set(); /* cfg.id values */
let jamDropIndex = null;
function updateJamDropTarget(dragTile, x, y) {
  const kids = [...$("jam-grid").querySelectorAll(".jam-slot")];
  let best = null, bestDist = Infinity;
  kids.forEach((k) => {
    if (k === dragTile) return;
    const r = k.getBoundingClientRect();
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    if (d < bestDist) { bestDist = d; best = k; }
  });
  kids.forEach((k) => k.classList.remove("jam-drop-before"));
  if (best) { best.classList.add("jam-drop-before"); jamDropIndex = +best.dataset.jamIndex; }
  else jamDropIndex = null;
}
function consumeJamDropTarget() {
  const v = jamDropIndex;
  jamDropIndex = null;
  [...$("jam-grid").querySelectorAll(".jam-slot")].forEach((k) => k.classList.remove("jam-drop-before"));
  return v;
}
function attachJamEditGestures(tile, index) {
  let startX = 0, startY = 0, moved = 0, lifting = false, pid = null, curDx = 0, curDy = 0, deleteArmed = false;
  tile.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tile.setPointerCapture(e.pointerId);
    pid = e.pointerId; startX = e.clientX; startY = e.clientY; moved = 0; lifting = false; deleteArmed = false;
  });
  tile.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    curDx = e.clientX - startX; curDy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(curDx), Math.abs(curDy));
    if (!lifting && moved > 10) { lifting = true; tile.classList.add("jam-lift"); }
    if (lifting) {
      tile.style.transform = "translate(" + curDx + "px," + curDy + "px)";
      const r = tile.getBoundingClientRect();
      /* armed once the swipe has gone leftward past half the tile's own
         width while staying mostly horizontal - far enough that it can't
         be mistaken for "drag onto the tile to my left" (reorder) */
      deleteArmed = curDx < -r.width * 0.55 && Math.abs(curDy) < r.height * 0.45;
      tile.classList.toggle("jam-delete-hint", deleteArmed);
      if (deleteArmed) consumeJamDropTarget();
      else updateJamDropTarget(tile, e.clientX, e.clientY);
    }
  });
  function end(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    if (lifting) {
      tile.classList.remove("jam-lift", "jam-delete-hint");
      tile.style.transform = "";
      if (deleteArmed) { deleteJamSlotAt(index); return; }
      const dropIdx = consumeJamDropTarget();
      if (dropIdx != null && dropIdx !== index) {
        /* insert at the target's ORIGINAL index (not -1'd) - removing the
           dragged item shifts everything after it down by one, which is
           exactly what lands it in the target's old slot either direction */
        const [item] = state.jam.slots.splice(index, 1);
        state.jam.slots.splice(dropIdx, 0, item);
        saveState();
      }
      buildJam();
    } else if (moved < 8) {
      openJamEditor(index);
    }
  }
  tile.addEventListener("pointerup", end);
  tile.addEventListener("pointercancel", end);
}
/* single-tile delete via swipe, reusing the same undo mechanism as
   clearJam() (the CLEAR button becomes UNDO regardless of which of the two
   emptied the grid, or partially emptied it) */
function deleteJamSlotAt(index) {
  const cfg = state.jam.slots[index];
  if (!cfg) return;
  if (cfg.source === "scene") jamSceneActive.delete(cfg);
  jamClearUndo = { slots: state.jam.slots.slice(), t: performance.now() };
  state.jam.slots.splice(index, 1);
  saveState();
  buildJam();
  showBanner("Removed \"" + jamLabel(cfg) + "\" – tap CLEAR to undo", "info", 3000);
  setTimeout(updateJamClearBtn, 6100);
}
function buildJamTile(cfg, index) {
  const tile = el("div", "jam-slot jam-" + cfg.kind + (jamSelected.has(cfg.id) ? " jam-selected" : ""));
  tile.dataset.jamIndex = index;
  if (cfg.kind === "pad") {
    /* the pad button carries its own label - no separate slot-label needed */
    const btn = el("button", "jam-pad-btn pad", jamLabel(cfg));
    tile.appendChild(btn);
    if (!jamEditing && !jamSelectMode) {
      const api = attachJamPad(btn, cfg);
      registerJamUpdate(cfg, api.update);
    }
  } else {
    const dom = buildJamFaderDom(cfg);
    tile.appendChild(dom.fader);
    tile.appendChild(el("div", "slot-label", jamLabel(cfg)));
    if (!jamEditing && !jamSelectMode) registerJamUpdate(cfg, dom.update);
  }
  if (jamEditing) attachJamEditGestures(tile, index);
  if (jamSelectMode) attachJamSelectGesture(tile, cfg);
  return tile;
}
/* select mode: a plain tap toggles selection - no drag/swipe to disambiguate
   here, so it wins over the tile's own pad/fader listeners via the same
   bubble-then-capture-override behavior attachJamEditGestures relies on */
function attachJamSelectGesture(tile, cfg) {
  let sx = 0, sy = 0, moved = 0, pid = null;
  tile.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tile.setPointerCapture(e.pointerId);
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = 0;
  });
  tile.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    moved = Math.max(moved, Math.abs(e.clientX - sx), Math.abs(e.clientY - sy));
  });
  function end(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    if (moved < 8) {
      if (jamSelected.has(cfg.id)) jamSelected.delete(cfg.id);
      else jamSelected.add(cfg.id);
      buildJam();
    }
  }
  tile.addEventListener("pointerup", end);
  tile.addEventListener("pointercancel", end);
}
function buildJamAddTile() {
  const btn = el("button", "jam-add", "+");
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); openJamEditor(null); });
  return btn;
}
function buildJam() {
  const host = $("jam-grid");
  finishDragsIn(host);
  releaseAllJamScenes(); /* a rebuild mid-hold must not leave a bus stuck on the captured scene */
  /* prune selections for tiles that no longer exist (deleted elsewhere) */
  const liveIds = new Set(state.jam.slots.map((c) => c.id));
  [...jamSelected].forEach((id) => { if (!liveIds.has(id)) jamSelected.delete(id); });
  host.textContent = "";
  jamByBusSlot.clear();
  jamRawUpdateFns.clear();
  document.body.classList.toggle("jam-editing", jamEditing);
  document.body.classList.toggle("jam-selecting", jamSelectMode);
  $("jam-edit-btn").classList.toggle("on", jamEditing);
  $("jam-edit-btn").textContent = jamEditing ? "DONE" : "EDIT";
  $("jam-select-btn").classList.toggle("on", jamSelectMode);
  $("jam-select-btn").textContent = jamSelectMode ? "DONE" : "SELECT";
  $("jam-batch-bar").classList.toggle("hide", !jamSelectMode);
  $("jam-batch-count").textContent = jamSelected.size + " selected";
  state.jam.slots.forEach((cfg, i) => host.appendChild(buildJamTile(cfg, i)));
  if (!jamEditing && !jamSelectMode && state.jam.slots.length < JAM_MAX) host.appendChild(buildJamAddTile());
  renderFocusScenes(); /* keep the Focus-view sidebar in sync with any add/edit/delete/reorder here */
  updateJamClearBtn();
}
/* window.confirm() is unreliable on this app's actual target platform (iOS
   Web MIDI wrapper browsers like MIDIWeb Browser often stub it to return
   false without ever prompting - see snapSave()'s comment re: prompt() for
   the same class of bug) so this mirrors the RND button's proven pattern
   instead: act immediately, become UNDO for a few seconds rather than ask
   first. Safer in practice too - a stray tap is recoverable either way. */
let jamClearUndo = null; /* { slots, t } */
function clearJam() {
  if (jamClearUndo && performance.now() - jamClearUndo.t < 6000) {
    state.jam.slots = jamClearUndo.slots;
    jamClearUndo = null;
    saveState();
    buildJam();
    showBanner("JAM restored", "info", 2000);
    return;
  }
  if (!state.jam.slots.length) { showBanner("JAM is already empty", "info", 2000); return; }
  releaseAllJamScenes();
  jamClearUndo = { slots: state.jam.slots, t: performance.now() };
  state.jam.slots = [];
  saveState();
  buildJam();
  showBanner("JAM cleared - tap CLEAR again within 6s to undo", "info", 3000);
  setTimeout(updateJamClearBtn, 6100);
}
function updateJamClearBtn() {
  const btn = $("jam-clear-btn");
  if (!btn) return;
  const active = jamClearUndo && performance.now() - jamClearUndo.t < 6000;
  btn.textContent = active ? "UNDO" : "CLEAR";
  btn.classList.toggle("undo", !!active);
}

/* ===== JAM control editor overlay ===== */
let jamDraft = null, jamDraftIndex = null;
function defaultJamSlot() {
  return {
    id: "j" + Date.now() + Math.random().toString(36).slice(2, 7),
    kind: "pad", source: "bus", label: "",
    bus: state.activeBus || 0, ctrl: 0,
    port: null, ch: 0, type: "cc", num: 1, val: 64,
    mode: "toggle", onVal: 127, offVal: 0, vel: 110,
    fx: 0, cc: [64, 64, 64, 64, 64, 64], on: false, /* scene source */
  };
}
function openJamEditor(index) {
  jamDraftIndex = index;
  jamDraft = index == null ? defaultJamSlot() : Object.assign({}, state.jam.slots[index]);
  /* an existing scene slot already has valid captured data (fx/cc/on were
     sanitized in) - _captured is a draft-only flag, never persisted, so it
     must be re-derived here or re-editing one would look "not captured yet" */
  if (jamDraft.source === "scene") jamDraft._captured = true;
  renderJamEditor();
  $("jamedit").classList.add("open");
}
/* Focus view SAVE button: one tap from wherever you're dialing a sound in,
   rather than the multi-step "go to JAM > + > pick Bus scene > pick bus >
   Capture" - pre-fills a scene draft already captured from the active bus
   and opens the same editor so a label/mode still has to be confirmed. */
function quickSaveBusScene() {
  const bus = state.activeBus, b = state.buses[bus];
  jamDraftIndex = null;
  jamDraft = defaultJamSlot();
  jamDraft.source = "scene";
  jamDraft.bus = bus;
  jamDraft.fx = b.fx;
  jamDraft.cc = b.cc.slice();
  jamDraft.on = b.on;
  jamDraft._captured = true;
  jamDraft.mode = "momentary";
  jamDraft.label = BUSES[bus].short + " " + (b.fx > 0 ? fxDisplayName(BUSES[bus].table, b.fx) : "SCENE");
  renderJamEditor();
  $("jamedit").classList.add("open");
}
function jamOptRow(hostId, options, isSel, onPick) {
  const host = $(hostId);
  host.textContent = "";
  options.forEach((opt) => {
    const b = el("button", "setup-btn" + (isSel(opt.v) ? " sel" : ""), opt.t);
    b.addEventListener("click", () => onPick(opt.v));
    host.appendChild(b);
  });
}
function renderJamEditor() {
  const d = jamDraft;
  $("jamedit-title").textContent = jamDraftIndex == null ? "NEW CONTROL" : "EDIT CONTROL";
  jamOptRow("je-kind", [{ v: "pad", t: "Pad" }, { v: "fader", t: "Fader" }], (v) => v === d.kind, (v) => {
    if (d.source === "scene" && v === "fader") return; /* scenes can't be a fader */
    d.kind = v;
    if (v === "fader") d.type = "cc";
    renderJamEditor();
  });
  jamOptRow("je-source", [{ v: "bus", t: "SP-404 bus param" }, { v: "raw", t: "Raw MIDI" }, { v: "scene", t: "Bus scene" }], (v) => v === d.source, (v) => {
    d.source = v;
    if (v === "scene") d.kind = "pad"; /* a captured scene can't be dragged like a single CC */
    renderJamEditor();
  });
  $("je-bus-fields").classList.toggle("hide", d.source !== "bus");
  $("je-raw-fields").classList.toggle("hide", d.source !== "raw");
  $("je-scene-fields").classList.toggle("hide", d.source !== "scene");
  $("je-pad-fields").classList.toggle("hide", d.kind !== "pad");
  if (d.source === "bus") {
    jamOptRow("je-bus", BUSES.map((B, i) => ({ v: i, t: B.label })), (v) => v === d.bus, (v) => { d.bus = v; renderJamEditor(); });
    jamOptRow("je-ctrl", [0, 1, 2, 3, 4, 5].map((i) => ({ v: i, t: "CTRL " + (i + 1) })), (v) => v === d.ctrl, (v) => { d.ctrl = v; renderJamEditor(); });
  } else if (d.source === "scene") {
    jamOptRow("je-scene-bus", BUSES.map((B, i) => ({ v: i, t: B.label })), (v) => v === d.bus, (v) => { d.bus = v; renderJamEditor(); });
    const B = BUSES[d.bus];
    $("je-scene-status").textContent = d._captured
      ? "Captured: " + fxDisplayName(B.table, d.fx) + " on " + B.label + (d.on ? " (on)" : " (off)")
      : "Not captured yet – dial in the sound you want live, then tap Capture.";
  } else {
    const outs = [];
    if (Midi.access) Midi.access.outputs.forEach((p) => { if (Midi.live(p)) outs.push(p.name); });
    const portOpts = [{ v: null, t: "Default (SP-404 output)" }].concat(outs.map((n) => ({ v: n, t: n })));
    jamOptRow("je-port", portOpts, (v) => v === d.port, (v) => { d.port = v; renderJamEditor(); });
    const typeOpts = d.kind === "fader" ? [{ v: "cc", t: "CC" }] : [{ v: "cc", t: "CC" }, { v: "note", t: "Note" }, { v: "pc", t: "Program Change" }];
    jamOptRow("je-type", typeOpts, (v) => v === d.type, (v) => { d.type = v; if (v !== "cc") d.mode = "momentary"; renderJamEditor(); });
    $("je-ch").value = d.ch + 1;
    $("je-num-label").textContent = d.type === "note" ? "Note #" : d.type === "pc" ? "Pattern/PC #" : "CC #";
    $("je-num").value = d.num;
  }
  if (d.kind === "pad") {
    const modeOpts = (d.source === "bus" || d.source === "scene" || d.type === "cc") ? [{ v: "toggle", t: "Toggle" }, { v: "momentary", t: "Momentary" }] : [{ v: "momentary", t: "Momentary (fixed)" }];
    jamOptRow("je-mode", modeOpts, (v) => v === d.mode, (v) => { d.mode = v; renderJamEditor(); });
    const ccLike = d.source === "bus" || d.type === "cc";
    $("je-onval-field").classList.toggle("hide", !ccLike);
    $("je-offval-field").classList.toggle("hide", !ccLike);
    $("je-vel-field").classList.toggle("hide", !(d.source === "raw" && d.type === "note"));
    $("je-onval").value = d.onVal;
    $("je-offval").value = d.offVal;
    $("je-vel").value = d.vel;
  }
  $("je-label").value = d.label || "";
  $("je-delete").style.display = jamDraftIndex == null ? "none" : "";
}
function readJamEditorInputs() {
  const d = jamDraft;
  if (d.source === "raw") {
    d.ch = clamp((+$("je-ch").value || 1) - 1, 0, 15);
    d.num = clamp(+$("je-num").value || 0, 0, 127);
  }
  if (d.kind === "pad") {
    d.onVal = clamp(+$("je-onval").value, 0, 127);
    d.offVal = clamp(+$("je-offval").value, 0, 127);
    d.vel = clamp(+$("je-vel").value || 110, 1, 127);
  }
  d.label = $("je-label").value.trim().slice(0, 16);
}
function saveJamEditor() {
  readJamEditorInputs();
  if (jamDraft.source === "scene" && !jamDraft._captured) {
    showBanner("Capture a bus state first", "warn", 2500);
    return;
  }
  const clean = sanitizeJamSlot(jamDraft);
  if (!clean) return;
  if (jamDraftIndex == null) state.jam.slots.push(clean);
  else state.jam.slots[jamDraftIndex] = clean;
  saveState();
  $("jamedit").classList.remove("open");
  buildJam();
}
function deleteJamEditor() {
  if (jamDraftIndex != null) {
    state.jam.slots.splice(jamDraftIndex, 1);
    saveState();
  }
  $("jamedit").classList.remove("open");
  buildJam();
}

/* ===== JAM presets: factory templates for common gear, from verified
   MIDI implementation charts (not guessed) - each control still gets its
   own editable channel/CC/label after adding, so a wrong assumption here
   (e.g. this device's default per-track channel, which is user-configurable
   on the MC-101 itself) is a one-tap fix, not a dead end. ===== */
const JAM_PRESETS = [
  {
    id: "mc101-knobs",
    name: "MC-101 — 4 tracks × Sound/Filter/Mod/FX",
    note: "CC 80–83 (SOUND/FILTER/MOD/FX knobs, in the device's own left-to-right " +
      "order) per track, from Roland's MC-101 " +
      "MIDI implementation chart — both transmit and receive, so these mirror the " +
      "hardware knobs live. Track channels default to 1–4; check yours against " +
      "SHIFT + TRACK SEL on the device if it differs.",
    build() {
      /* physical knob order on the MC-101 itself: CTRL1 SOUND, CTRL2 FILTER,
         CTRL3 MOD, CTRL4 FX - matches left-to-right so the JAM grid mirrors
         the hardware layout */
      const knobs = [["SOUND", 83], ["FILTER", 80], ["MOD", 81], ["FX", 82]];
      const slots = [];
      for (let t = 0; t < 4; t++) {
        knobs.forEach(([label, num]) => {
          slots.push({ kind: "fader", source: "raw", ch: t, type: "cc", num, label: "T" + (t + 1) + " " + label, val: 64 });
        });
      }
      return slots;
    },
  },
];
let jamPresetPending = null;
function openJamPresets() {
  jamPresetPending = null;
  $("jampreset-title").textContent = "JAM PRESETS";
  $("jampreset-note").textContent = "Adds the preset's controls to your JAM grid – " +
    "existing controls are kept. Every added control keeps its own editable " +
    "channel/CC/label afterward, same as anything else in JAM.";
  const host = $("jampreset-list");
  host.textContent = "";
  JAM_PRESETS.forEach((preset) => {
    const b = el("button", "setup-btn", preset.name);
    b.addEventListener("click", () => openJamPresetPortPick(preset));
    host.appendChild(b);
  });
  $("jampreset").classList.add("open");
}
function openJamPresetPortPick(preset) {
  jamPresetPending = preset;
  $("jampreset-title").textContent = preset.name;
  $("jampreset-note").textContent = preset.note + " Pick which connected output this preset's controls should target.";
  const host = $("jampreset-list");
  host.textContent = "";
  const back = el("button", "setup-btn", "‹ Back");
  back.addEventListener("click", openJamPresets);
  host.appendChild(back);
  const mkPort = (name, label) => {
    const b = el("button", "setup-btn", label);
    b.addEventListener("click", () => applyJamPreset(preset, name));
    host.appendChild(b);
  };
  mkPort(null, "Default (SP-404 output)");
  if (Midi.access) Midi.access.outputs.forEach((p) => { if (Midi.live(p)) mkPort(p.name, p.name); });
}
function applyJamPreset(preset, port) {
  const room = JAM_MAX - state.jam.slots.length;
  if (room <= 0) { showBanner("JAM grid is full – delete some controls first", "warn", 3000); return; }
  const built = preset.build().map((c) => Object.assign({ port }, c));
  const clean = built.slice(0, room).map(sanitizeJamSlot).filter(Boolean);
  state.jam.slots.push(...clean);
  saveState();
  $("jampreset").classList.remove("open");
  buildJam();
  const dropped = built.length - clean.length;
  showBanner("Added " + clean.length + " controls from \"" + preset.name + "\"" + (dropped ? " (" + dropped + " skipped, grid full)" : ""), "info", 3000);
}

/* ===== 12 BOOT ===== */
function boot() {
  loadState();
  document.body.classList.toggle("horiz-faders", state.horizFaders);
  document.body.classList.toggle("jam-knobs", state.jamKnobs);
  applyTheme();
  buildTabs();
  buildOverview();
  BUSES.forEach((_, i) => renderBus(i));
  setActiveBus(state.activeBus || 0);
  if (window.innerWidth >= 900) { document.body.classList.add("overview"); $("view-toggle").textContent = "Focus"; }

  attachEfxPadDynamic($("efx-pad")); /* focus-header pad follows the active bus */

  $("fx-name").addEventListener("click", () => openPicker(state.activeBus));
  $("fx-prev").addEventListener("click", () => fxStep(-1));
  $("fx-next").addEventListener("click", () => fxStep(1));
  $("view-toggle").addEventListener("click", toggleView);
  $("xy-btn").addEventListener("click", toggleXyView);
  $("xy-xa").addEventListener("click", () => openXyPick("x"));
  $("xy-ya").addEventListener("click", () => openXyPick("y"));
  $("xy-mom").addEventListener("click", () => { state.xy.mom = !state.xy.mom; saveState(); renderXy(); });
  $("xy-presets-btn").addEventListener("click", openXyPresets);
  $("xypreset-close").addEventListener("click", () => $("xypreset").classList.remove("open"));
  $("xypreset").addEventListener("pointerdown", (e) => { if (e.target === $("xypreset")) $("xypreset").classList.remove("open"); });
  $("xypreset-save").addEventListener("click", saveCurrentXyPreset);
  $("recipes-btn").addEventListener("click", openRecipes);
  $("lib-btn").addEventListener("click", openRecipes);
  $("recipes-close").addEventListener("click", () => $("recipes").classList.remove("open"));
  $("recipes").addEventListener("pointerdown", (e) => { if (e.target === $("recipes")) $("recipes").classList.remove("open"); });
  $("recipe-new-btn").addEventListener("click", () => openRecipeEditor(null));
  $("recipe-edit-close").addEventListener("click", () => $("recipe-edit").classList.remove("open"));
  $("recipe-edit").addEventListener("pointerdown", (e) => { if (e.target === $("recipe-edit")) $("recipe-edit").classList.remove("open"); });
  $("re-save").addEventListener("click", saveRecipeDraft);
  $("xypick-close").addEventListener("click", () => $("xypick").classList.remove("open"));
  $("xypick").addEventListener("pointerdown", (e) => { if (e.target === $("xypick")) $("xypick").classList.remove("open"); });
  $("xypick-none").addEventListener("click", () => {
    if (xyPickAxis === "lfo") {
      const rt = LfoRt[lfoSel], old = state.lfos[lfoSel].target;
      if (rt.on && old) setBusCc(old.bus, old.slot, rt.center, { force: true }); /* park */
      state.lfos[lfoSel].target = null;
      rt.on = false;
      renderLfo();
    } else { state.xy[xyPickAxis] = null; renderXy(); }
    saveState();
    $("xypick").classList.remove("open");
  });
  setupXyPad();
  for (let i = 0; i < 4; i++) {
    const c = el("button", "", String(i + 1));
    c.addEventListener("click", () => { lfoSel = i; renderLfo(); });
    $("lfo-slots").appendChild(c);
    lfoChips.push(c);
  }
  $("lfo-on").addEventListener("click", lfoToggle);
  $("lfo-target").addEventListener("click", () => openXyPick("lfo"));
  $("lfo-wave").addEventListener("click", () => { const l = state.lfos[lfoSel]; l.wave = (l.wave + 1) % LFO_WAVES.length; saveState(); renderLfo(); });
  $("lfo-rate").addEventListener("click", () => { const l = state.lfos[lfoSel]; l.rate = (l.rate + 1) % LFO_RATES.length; saveState(); renderLfo(); });
  $("lfo-depth").addEventListener("click", () => { const l = state.lfos[lfoSel]; l.depth = (l.depth + 1) % LFO_DEPTHS.length; saveState(); renderLfo(); });
  $("lfo-tap").addEventListener("click", lfoTap);
  /* play view */
  setupBend();
  $("play-keys-btn").addEventListener("click", () => { state.play.mode = "keys"; saveState(); renderPlay(); });
  $("play-scale-btn").addEventListener("click", () => { state.play.mode = "scale"; saveState(); renderPlay(); });
  $("play-pads-btn").addEventListener("click", () => { state.play.mode = "pads"; saveState(); renderPlay(); });
  $("play-root").addEventListener("click", () => { state.play.scaleRoot = (state.play.scaleRoot + 1) % 12; saveState(); renderPlay(); });
  $("play-scalesel").addEventListener("click", () => { state.play.scaleType = (state.play.scaleType + 1) % SCALES.length; saveState(); renderPlay(); });
  $("play-layout").addEventListener("click", () => { state.play.iso = !state.play.iso; saveState(); renderPlay(); });
  $("play-target").addEventListener("click", () => {
    if (state.play.mode === "pads") state.play.padChPair = (state.play.padChPair + 1) % 10;
    else { state.play.target = state.play.target === "sample" ? "voc" : "sample"; state.play.oct = 0; }
    saveState(); renderPlay();
  });
  $("play-oct-down").addEventListener("click", () => {
    const lim = state.play.target === "sample" ? [0, 1] : [-2, 2];
    state.play.oct = clamp(state.play.oct - 1, lim[0], lim[1]);
    saveState(); renderPlay();
  });
  $("play-oct-up").addEventListener("click", () => {
    const lim = state.play.target === "sample" ? [0, 1] : [-2, 2];
    state.play.oct = clamp(state.play.oct + 1, lim[0], lim[1]);
    saveState(); renderPlay();
  });
  $("padpick-close").addEventListener("click", () => $("padpick").classList.remove("open"));
  $("padpick").addEventListener("pointerdown", (e) => { if (e.target === $("padpick")) $("padpick").classList.remove("open"); });
  $("padpick-none").addEventListener("click", () => {
    state.play.custom[padPickSlot] = null;
    saveState();
    $("padpick").classList.remove("open");
    buildPads();
  });
  /* jam tab */
  $("jam-edit-btn").addEventListener("click", () => {
    jamEditing = !jamEditing;
    if (jamEditing) { jamSelectMode = false; jamSelected.clear(); }
    buildJam();
  });
  $("jam-select-btn").addEventListener("click", () => {
    jamSelectMode = !jamSelectMode;
    jamSelected.clear();
    if (jamSelectMode) jamEditing = false;
    buildJam();
  });
  $("jam-batch-apply-ch").addEventListener("click", () => {
    if (!jamSelected.size) { showBanner("Select some controls first", "info", 2000); return; }
    const ch = clamp((+$("jam-batch-ch").value || 1) - 1, 0, 15);
    let n = 0;
    state.jam.slots.forEach((cfg) => {
      if (jamSelected.has(cfg.id) && cfg.source === "raw") { cfg.ch = ch; n++; }
    });
    saveState();
    buildJam();
    showBanner(n
      ? "Channel " + (ch + 1) + " applied to " + n + " control(s)"
      : "None of the selected controls use a MIDI channel (bus/scene sources don't)", "info", 3000);
  });
  $("jam-batch-delete").addEventListener("click", () => {
    if (!jamSelected.size) { showBanner("Select some controls first", "info", 2000); return; }
    jamClearUndo = { slots: state.jam.slots.slice(), t: performance.now() };
    const removed = state.jam.slots.filter((c) => jamSelected.has(c.id));
    removed.forEach((cfg) => { if (cfg.source === "scene") jamSceneActive.delete(cfg); });
    state.jam.slots = state.jam.slots.filter((c) => !jamSelected.has(c.id));
    jamSelected.clear();
    jamSelectMode = false;
    saveState();
    buildJam();
    showBanner(removed.length + " control(s) removed – tap CLEAR to undo", "info", 3000);
    setTimeout(updateJamClearBtn, 6100);
  });
  $("jamedit-close").addEventListener("click", () => $("jamedit").classList.remove("open"));
  $("jamedit").addEventListener("pointerdown", (e) => { if (e.target === $("jamedit")) $("jamedit").classList.remove("open"); });
  $("je-save").addEventListener("click", saveJamEditor);
  $("je-delete").addEventListener("click", deleteJamEditor);
  $("je-capture").addEventListener("click", () => {
    const d = jamDraft, b = state.buses[d.bus];
    d.fx = b.fx; d.cc = b.cc.slice(); d.on = b.on; d._captured = true;
    renderJamEditor();
    showBanner("Captured", "info", 1500);
  });
  $("jam-preset-btn").addEventListener("click", openJamPresets);
  $("jampreset-close").addEventListener("click", () => $("jampreset").classList.remove("open"));
  $("jampreset").addEventListener("pointerdown", (e) => { if (e.target === $("jampreset")) $("jampreset").classList.remove("open"); });
  $("jam-clear-btn").addEventListener("click", clearJam);
  /* looper (device in looper mode, CH 1) - just REC: toggles start/stop */
  let lpRec = false;
  $("lp-rec").addEventListener("click", () => { lpRec = !lpRec; Midi.send(0, 88, lpRec ? 127 : 0, true); $("lp-rec").classList.toggle("on", lpRec); });
  $("alloff").addEventListener("click", allOff);
  $("snaps-btn").addEventListener("click", openSnaps);
  $("snaps-close").addEventListener("click", () => $("snaps").classList.remove("open"));
  $("snaps").addEventListener("pointerdown", (e) => { if (e.target === $("snaps")) $("snaps").classList.remove("open"); });
  $("exp-btn").addEventListener("click", doExport);
  $("imp-btn").addEventListener("click", doImport);
  $("rnd-btn").addEventListener("click", () => randomize(state.activeBus));
  $("bus-save-btn").addEventListener("click", quickSaveBusScene);
  $("setup-btn").addEventListener("click", openSetup);
  $("conn").addEventListener("click", openSetup);
  $("banner").addEventListener("click", () => {
    if ($("banner").classList.contains("info")) return;
    $("banner").classList.remove("show");
    openSetup();
  });
  $("picker-close").addEventListener("click", closePicker);
  $("picker").addEventListener("pointerdown", (e) => { if (e.target === $("picker")) closePicker(); });
  $("setup-close").addEventListener("click", () => $("setup").classList.remove("open"));
  $("setup").addEventListener("pointerdown", (e) => { if (e.target === $("setup")) $("setup").classList.remove("open"); });
  $("midi-connect").addEventListener("click", () => Midi.connect(true));
  $("midi-rescan").addEventListener("click", () => Midi.connect(true));
  $("push-state").addEventListener("click", pushStateToDevice);
  $("wake-toggle").addEventListener("click", () => { state.wake = !state.wake; saveState(); applyWake(); renderSetup(); });
  $("horiz-toggle").addEventListener("click", () => {
    state.horizFaders = !state.horizFaders;
    document.body.classList.toggle("horiz-faders", state.horizFaders);
    saveState(); renderSetup();
  });
  $("jam-knob-toggle").addEventListener("click", () => {
    state.jamKnobs = !state.jamKnobs;
    document.body.classList.toggle("jam-knobs", state.jamKnobs);
    saveState(); renderSetup();
  });
  $("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    applyTheme();
    saveState(); renderSetup();
  });
  $("help-btn").addEventListener("click", () => $("help").classList.add("open"));
  $("help-close").addEventListener("click", () => $("help").classList.remove("open"));
  $("help").addEventListener("pointerdown", (e) => { if (e.target === $("help")) $("help").classList.remove("open"); });
  $("step-minus").addEventListener("click", () => setBusCc(stepCtx.bus, stepCtx.slot, state.buses[stepCtx.bus].cc[stepCtx.slot] - 1, { force: true }));
  $("step-plus").addEventListener("click", () => setBusCc(stepCtx.bus, stepCtx.slot, state.buses[stepCtx.bus].cc[stepCtx.slot] + 1, { force: true }));
  document.addEventListener("pointerdown", (e) => {
    if (!$("stepper").contains(e.target) && !e.target.classList.contains("fader-val")) closeStepper();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePicker(); $("setup").classList.remove("open"); $("snaps").classList.remove("open"); $("xypick").classList.remove("open"); $("padpick").classList.remove("open"); $("jamedit").classList.remove("open"); $("jampreset").classList.remove("open"); $("xypreset").classList.remove("open"); $("recipes").classList.remove("open"); $("recipe-edit").classList.remove("open"); $("help").classList.remove("open"); closeStepper(); return; }
    if (e.target.tagName === "INPUT") return;
    if (e.key >= "1" && e.key <= "5") gotoFocus(+e.key - 1);
    else if (e.key === " ") { e.preventDefault(); const b = state.activeBus; sendSw(b, !state.buses[b].on); }
    else if (e.key === "o" || e.key === "O") toggleView();
    else if (e.key === "x" || e.key === "X") toggleXyView();
  });

  ["gesturestart", "gesturechange", "gestureend"].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      applyWake();
      if (Midi.access) Midi.refreshPorts(); /* Web MIDI Browser app: statechange unreliable */
      pullSync();
    } else {
      flushState(); clearTimeout(syncTimer); pushSync();
      flushNotesIn(null); /* no stuck notes */
      flushBend();
      releaseAllJamScenes(); /* a backgrounded tab must not leave a bus stuck mid-hold */
    }
  });
  window.addEventListener("pagehide", () => { flushState(); clearTimeout(syncTimer); pushSync(); });
  window.addEventListener("focus", () => { if (Midi.access) Midi.refreshPorts(); });
  window.addEventListener("resize", () => {
    BUSES.forEach((_, i) => queueAllSlots(i));
    if (currentView() === "play") renderPlay();
  });

  if (!navigator.requestMIDIAccess) {
    $("nomidi").classList.add("open");
    $("demo-btn").addEventListener("click", () => {
      Midi.demo = true;
      $("nomidi").classList.remove("open");
      updateConnUi();
      showBanner("Demo mode: no MIDI is sent", "info", 4000);
    });
  } else if (state.midi.outName) {
    Midi.connect(false); /* previously granted: resolves silently */
  }
  updateConnUi();
  applyWake();
  updateRndBtn();
  pullSync();
}
function queueAllSlots(bus) { for (let i = 0; i < 6; i++) queueSlotRender(bus, i); }

/* focus-header EFX pad bound to the *active* bus */
function attachEfxPadDynamic(btn) {
  let t = null, momentary = false, mBus = 0, downAt = 0;
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    clearTimeout(t); t = null;
    downAt = performance.now();
    mBus = state.activeBus; momentary = false;
    if (!state.buses[mBus].on) {
      t = setTimeout(() => { momentary = true; sendSw(mBus, true); }, 350);
    }
  });
  btn.addEventListener("pointerup", () => {
    clearTimeout(t); t = null;
    if (!downAt) return;
    downAt = 0;
    if (momentary) { sendSw(mBus, false); momentary = false; return; }
    sendSw(mBus, !state.buses[mBus].on);
  });
  btn.addEventListener("pointercancel", () => {
    clearTimeout(t); t = null; downAt = 0;
    if (momentary) { sendSw(mBus, false); momentary = false; }
  });
}

/* dev hook for hardware probing from the browser console:
   busdriver.send(0, 83, 43)   raw CC send (ch 0-based: 0 = BUS 1)
   busdriver.monitor = true    log all incoming MIDI (except clock/active sensing) */
window.busdriver = { monitor: false, send: (ch, cc, val) => Midi.send(ch | 0, cc | 0, val | 0, true) };

boot();
})();
