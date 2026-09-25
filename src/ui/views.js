import { BUS_TABLES } from "../data/effects-db.js";
import { fxNameFor } from "../core/conv.js";
import { Midi, fxChange } from "../core/midi.js";
import { allOffSaved, setAllOffSaved, favList, fxDisplayName, saveState, state } from "../core/store.js";
import { $, BUSES, CC_SW, PHONE, el } from "../core/util.js";
import { openJamEditor } from "../features/jam-editor.js";
import { attachJamPad, buildJam, jamLabel } from "../features/jam.js";
import { renderPattern } from "../features/pattern-grid.js";
import { renderPlay } from "../features/play-view.js";
import { updateRndBtn } from "../features/randomizer.js";
import { renderXy } from "../features/xy-pad.js";
import { buildControl, controls, finishDragsIn, stripControls } from "./controls.js";
import { openPicker } from "./picker.js";

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
    setAllOffSaved(state.buses.map((b) => b.on));
    if (!allOffSaved.some(Boolean)) { setAllOffSaved(null); return; }
    BUSES.forEach((B, i) => { if (state.buses[i].on) sendSw(i, false); });
    btn.classList.add("armed");
    btn.textContent = "RESTORE";
  } else {
    BUSES.forEach((B, i) => { if (allOffSaved[i]) sendSw(i, true); });
    setAllOffSaved(null);
    btn.classList.remove("armed");
    btn.textContent = "ALL OFF";
  }
}

export { renderFocusSlots, lastFocusScenesSig, renderFocusScenes, updateFocusHead, renderFocusFavs, updateBusChrome, renderBus, setActiveBus, currentView, setView, gotoFocus, toggleView, tabs, tabLeds, patternTab, playTab, jamTab, buildTabs, strips, buildOverview, setActiveBusSilent, buildStripFaders, attachEfxPad, sendSw, allOff };
