import { applyRawCC } from "./midi.js";
import { $ } from "./util.js";
import { LfoRt, renderLfo } from "../features/lfo.js";

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

export { Clock, onClockByte, onClockOnly };
