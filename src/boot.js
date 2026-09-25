import { Midi } from "./core/midi.js";
import { flushState, loadState, saveState, state } from "./core/store.js";
import { $, BUSES, clamp, el } from "./core/util.js";
import { fxStep } from "./features/fx-nav.js";
import { deleteJamEditor, jamDraft, quickSaveBusScene, renderJamEditor, saveJamEditor } from "./features/jam-editor.js";
import { openJamPresets } from "./features/jam-presets.js";
import { buildJam, clearJam, jamClearUndo, setJamClearUndo, jamEditing, setJamEditing, jamSceneActive, jamSelectMode, setJamSelectMode, jamSelected, releaseAllJamScenes, updateJamClearBtn } from "./features/jam.js";
import { LFO_DEPTHS, LFO_RATES, LFO_WAVES, LfoRt, lfoChips, lfoSel, setLfoSel, lfoTap, lfoToggle, renderLfo } from "./features/lfo.js";
import { SCALES, buildPads, flushBend, flushNotesIn, padPickSlot, renderPlay, setupBend } from "./features/play-view.js";
import { pullSync, pushSync, randomize, syncTimer, updateRndBtn } from "./features/randomizer.js";
import { openRecipeEditor, openRecipes, saveRecipeDraft } from "./features/recipes.js";
import { doExport, doImport, openSnaps } from "./features/snapshots.js";
import { renderXy, setupXyPad } from "./features/xy-pad.js";
import { openXyPick, openXyPresets, saveCurrentXyPreset, toggleXyView, xyPickAxis } from "./features/xy-presets.js";
import { showBanner, updateConnUi } from "./ui/banner.js";
import { closeStepper, controls, queueSlotRender, setBusCc, stepCtx } from "./ui/controls.js";
import { closePicker, openPicker } from "./ui/picker.js";
import { applyTheme, applyWake, openSetup, pushStateToDevice, renderSetup } from "./ui/setup.js";
import { allOff, buildOverview, buildTabs, currentView, gotoFocus, renderBus, sendSw, setActiveBus, toggleView } from "./ui/views.js";

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
    c.addEventListener("click", () => { setLfoSel(i); renderLfo(); });
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
    setJamEditing(!jamEditing);
    if (jamEditing) { setJamSelectMode(false); jamSelected.clear(); }
    buildJam();
  });
  $("jam-select-btn").addEventListener("click", () => {
    setJamSelectMode(!jamSelectMode);
    jamSelected.clear();
    if (jamSelectMode) setJamEditing(false);
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
    setJamClearUndo({ slots: state.jam.slots.slice(), t: performance.now() });
    const removed = state.jam.slots.filter((c) => jamSelected.has(c.id));
    removed.forEach((cfg) => { if (cfg.source === "scene") jamSceneActive.delete(cfg); });
    state.jam.slots = state.jam.slots.filter((c) => !jamSelected.has(c.id));
    jamSelected.clear();
    setJamSelectMode(false);
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

export { boot, queueAllSlots, attachEfxPadDynamic };
