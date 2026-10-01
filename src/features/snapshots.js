import { Midi, fxTimers, memKey } from "../core/midi.js";
import { JAM_MAX, setAllOffSaved, fxDisplayName, sanitizeJamSlot, saveState, state } from "../core/store.js";
import { $, BUSES, CC_CTRL, CC_FX, CC_SW, clamp, el } from "../core/util.js";
import { buildJam, clearJam } from "./jam.js";
import { LfoRt } from "./lfo.js";
import { pullSync, scheduleSync, updateSyncStatus } from "./randomizer.js";
import { RECIPE_MAX, renderRecipesList, sanitizeRecipe } from "./recipes.js";
import { XY_PRESETS_MAX, renderXyCustomList, sanitizeXyPreset } from "./xy-presets.js";
import { showBanner } from "../ui/banner.js";
import { renderBus } from "../ui/views.js";

/* ===== snapshots ===== */
function applyFullState(buses) {
  /* full push: per bus CC#83, then ctrl CCs, then EFX switch, staggered */
  setAllOffSaved(null);
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

export { applyFullState, applyBusState, busesSummary, snapSave, startRename, snapLoad, snapDelete, snapEls, renderSnaps, openSnaps, doExport, importUndo, doImport, updateImportBtn };
