import { BUS_TABLES, EFFECTS } from "../data/effects-db.js";
import { directName, state } from "./store.js";
import { $, NOTE_NAMES, clamp } from "./util.js";

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

export { fxNameFor, fxDefFor, enumFromCc, ccFromEnum, dispFromCc, ccFromDefault, defaultCcs, ccFromDisp, syncOnFor, syncOnForCc, buildFactoryBus, BLANK_BUS, FACTORY_RECIPES };
