import { Midi } from "../core/midi.js";
import { directName, state } from "../core/store.js";
import { $, BUILD, BUSES, CC_CTRL, CC_FX, CC_SW, LAST_CHANGED, el } from "../core/util.js";
import { showBanner } from "./banner.js";
import { openPicker } from "./picker.js";

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

export { esc, renderSetup, openSetup, pushStateToDevice, wakeLock, applyWake, applyTheme };
