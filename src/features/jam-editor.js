import { Midi } from "../core/midi.js";
import { fxDisplayName, sanitizeJamSlot, saveState, state } from "../core/store.js";
import { $, BUSES, clamp, el } from "../core/util.js";
import { buildJam } from "./jam.js";
import { showBanner } from "../ui/banner.js";

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

export { jamDraft, jamDraftIndex, defaultJamSlot, openJamEditor, quickSaveBusScene, jamOptRow, renderJamEditor, readJamEditorInputs, saveJamEditor, deleteJamEditor };
