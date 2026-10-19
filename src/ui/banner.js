import { Midi } from "../core/midi.js";
import { state } from "../core/store.js";
import { $ } from "../core/util.js";

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

export { txTimer, txLast, blinkTx, bannerTimer, showBanner, updateConnUi };
