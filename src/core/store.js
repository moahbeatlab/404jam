import { BUS_TABLES } from "../data/effects-db.js";
import { FACTORY_RECIPES, fxNameFor } from "./conv.js";
import { BUSES, clamp } from "./util.js";
import { scheduleSync } from "../features/randomizer.js";
import { RECIPE_MAX, sanitizeRecipe } from "../features/recipes.js";
import { XY_PRESETS_MAX, sanitizeXyPreset } from "../features/xy-presets.js";
import { renderSetup } from "../ui/setup.js";
import { renderBus, strips } from "../ui/views.js";

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
  recipes: [], /* full 5-bus presets typed in from recipe cards, { id, name, buses:[{fx,cc[6],on} x5] } - populated by initFactoryRecipes(), called from loadState() */
};
/* FACTORY_RECIPES (conv.js) and this module import each other; reading it at
   this module's own top level would race the cycle's evaluation order
   (conv.js may still be mid-evaluation, paused on its own import of this
   module, when this module's top level runs) - so it's deferred into a
   function, called from loadState() below once the whole module graph has
   settled. */
function initFactoryRecipes() {
  state.recipes = FACTORY_RECIPES.map((r) => ({ id: r.id, name: r.name, buses: r.buses() }));
}
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
function setAllOffSaved(v) { allOffSaved = v; }

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
  initFactoryRecipes();
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

export { LS_KEY, state, directName, fxDisplayName, setDirectFx, assignableNames, isFav, favList, allOffSaved, setAllOffSaved, JAM_MAX, sanitizeJamSlot, loadState, saveTimer, writeState, saveState, flushState };
