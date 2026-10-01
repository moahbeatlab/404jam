import { Midi } from "../core/midi.js";
import { JAM_MAX, saveState, state } from "../core/store.js";
import { $, BUSES, CC_CTRL, clamp, el } from "../core/util.js";
import { openJamEditor } from "./jam-editor.js";
import { applyBusState, snapSave } from "./snapshots.js";
import { showBanner } from "../ui/banner.js";
import { attachFaderDrag, controls, finishDragsIn, jamByBusSlot, jamRawUpdateFns, paintFader, paintKnob, queueSlotRender, setBusCc } from "../ui/controls.js";
import { renderFocusScenes } from "../ui/views.js";

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
function setJamEditing(v) { jamEditing = v; }
/* select mode: mutually exclusive with edit mode so a tap on a tile is
   never ambiguous between "toggle selection" and "start a reorder drag" */
let jamSelectMode = false;
function setJamSelectMode(v) { jamSelectMode = v; }
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
function setJamClearUndo(v) { jamClearUndo = v; }
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

export { jamGet, jamSet, jamSceneActive, jamPadFire, releaseAllJamScenes, jamLabel, attachJamPad, buildJamFaderDom, registerJamUpdate, jamEditing, setJamEditing, jamSelectMode, setJamSelectMode, jamSelected, jamDropIndex, updateJamDropTarget, consumeJamDropTarget, attachJamEditGestures, deleteJamSlotAt, buildJamTile, attachJamSelectGesture, buildJamAddTile, buildJam, jamClearUndo, setJamClearUndo, clearJam, updateJamClearBtn };
