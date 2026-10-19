import { Clock } from "../core/clock.js";
import { Pulse } from "../core/pulse.js";
import { Midi } from "../core/midi.js";
import { state } from "../core/store.js";
import { $, BUSES, CC_CTRL, clamp, el } from "../core/util.js";
import { queueSlotRender } from "../ui/controls.js";

/* ===== MOTION: record what the knobs of a bus do over 1-8 bars, then loop it (like the motion of 404tui).
   Every bus has 4 slots. It follows the unit's MIDI clock, or the tap tempo when there is none.
   It records what moves while it records: the faders here and the knobs on the unit. ===== */
const TICKS_BAR = 96, HOLD = 12;
const SLOT_COUNT = 4;
const newMo = () => ({ st: 0, total: 0, pos: 0, ev: [], speed: 0, rev: false, fpos: 0, touch: Array(6).fill(0), lastAt: Array(6).fill(0) });
const Motion = BUSES.map(() => ({ sel: 0, mo: [0, 1, 2, 3].map(newMo) }));
const Cfg = { bars: 2, dub: false };
let msg = "";
const filled = (m) => m.ev.length > 0 && m.total > 0;
/* 0 empty, 1 waits for the bar to record, 2 records, 3 waits for the bar to play, 4 plays */

let playing = false; /* our own sends: they must not be recorded as moves */
function observe(bus, slot, val) {
  if (playing) return;
  const bs = Motion[bus];
  if (Cfg.dub) {
    const p = bs.mo.find((m) => m.st === 4);
    if (p) { overdub(p, slot, val); return; }
  }
  const m = bs.mo[bs.sel];
  if (m.st === 2) m.ev.push({ tick: m.pos, knob: slot, val });
}
function overdub(m, knob, val) {
  const at = m.fpos;
  let from = at;
  const held = m.touch[knob] > 0 && m.lastAt[knob] <= at;
  if (held) from = m.lastAt[knob];
  m.ev = m.ev.filter((e) => !(e.knob === knob && ((held && e.tick > from && e.tick <= at) || (!held && e.tick === Math.floor(at)))));
  m.ev.push({ tick: Math.min(Math.floor(at), m.total - 1), knob, val });
  m.ev.sort((a, b) => a.tick - b.tick);
  m.touch[knob] = HOLD; m.lastAt[knob] = at;
}

function act(bus, slot) {
  const bs = Motion[bus], m = bs.mo[slot];
  bs.sel = slot;
  const lab = BUSES[bus].label + ": motion " + (slot + 1);
  if (m.st === 4 || m.st === 3) { m.st = 0; msg = lab + " stopped."; }
  else if (m.st === 1 || m.st === 2) { bs.mo[slot] = newMo(); msg = "the recording into " + lab + " was cancelled."; }
  else if (filled(m)) { stopOthers(bs); m.st = 3; m.pos = 0; msg = lab + " plays from the next bar."; }
  else { stopOthers(bs); bs.mo[slot] = Object.assign(newMo(), { st: 1, total: Cfg.bars * TICKS_BAR }); msg = lab + " records " + Cfg.bars + (Cfg.bars === 1 ? " bar" : " bars") + " from the next bar: move the knobs of " + BUSES[bus].label + "."; }
  render();
}
function stopOthers(bs) { bs.mo.forEach((m) => { if (m.st === 4 || m.st === 3) m.st = 0; }); }
function clear(bus) { const bs = Motion[bus]; bs.mo[bs.sel] = newMo(); msg = BUSES[bus].label + ": motion " + (bs.sel + 1) + " cleared."; render(); }
function speed(bus) { const m = Motion[bus].mo[Motion[bus].sel]; m.speed = { 0: 2, 1: 2, 2: 0.5, 0.5: 1 }[m.speed] || 1; render(); }
function reverse(bus) { const m = Motion[bus].mo[Motion[bus].sel]; m.rev = !m.rev; render(); }

function tick(n) {
  for (let bus = 0; bus < BUSES.length; bus++) {
    Motion[bus].mo.forEach((m, slot) => {
      switch (m.st) {
        case 1:
          if (n % TICKS_BAR !== 0) return;
          m.st = 2; m.pos = 0;
          state.buses[bus].cc.forEach((v, k) => m.ev.push({ tick: 0, knob: k, val: v }));
          break;
        case 2:
          m.pos++;
          if (m.pos >= m.total) { m.st = 4; start(bus, slot); }
          break;
        case 3:
          if (n % TICKS_BAR === 0) { m.st = 4; start(bus, slot); }
          break;
        case 4: step(bus, slot); break;
      }
    });
  }
  paintPos();
}
function start(bus, slot) { const m = Motion[bus].mo[slot]; m.fpos = m.rev ? m.total : 0; step(bus, slot); }
function step(bus, slot) {
  const m = Motion[bus].mo[slot], total = m.total, from = m.fpos, rate = m.speed > 0 ? m.speed : 1;
  for (let k = 0; k < 6; k++) m.touch[k] = Math.max(m.touch[k] - 1, 0);
  if (m.rev) {
    let to = from - rate;
    if (to < 0) { send(bus, m, 0, from, true); to += total; send(bus, m, to, total, true); } else send(bus, m, to, from, true);
    m.fpos = to; return;
  }
  let to = from + rate;
  if (to >= total) { send(bus, m, from, total, false); to -= total; send(bus, m, 0, to, false); } else send(bus, m, from, to, false);
  m.fpos = to;
}
function send(bus, m, lo, hi, back) {
  const out = (e) => {
    if (m.touch[e.knob] > 0) return; /* the hand is on this knob */
    const b = state.buses[bus], v = clamp(e.val, 0, 127);
    if (b.cc[e.knob] === v) return;
    b.cc[e.knob] = v;
    playing = true;
    Midi.send(BUSES[bus].ch, CC_CTRL[e.knob], v);
    playing = false;
    queueSlotRender(bus, e.knob);
  };
  if (back) { for (let i = m.ev.length - 1; i >= 0; i--) { const t = m.ev[i].tick; if (t >= lo && t < hi) out(m.ev[i]); } return; }
  m.ev.forEach((e) => { if (e.tick >= lo && e.tick < hi) out(e); });
}
/* the knob that moves the most, as n values over the loop (for the little picture) */
function curve(m, n) {
  const cs = Array.from({ length: 6 }, () => Array(n).fill(-1));
  m.ev.forEach((e) => { cs[e.knob][Math.min(Math.floor(e.tick * n / Math.max(m.total, 1)), n - 1)] = e.val; });
  let best = 0, range = 0;
  cs.forEach((c, k) => {
    let lo = 128, hi = -1;
    c.forEach((v) => { if (v >= 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    if (hi >= 0 && hi - lo >= range) { best = k; range = hi - lo; }
  });
  let last = 0;
  return cs[best].map((v) => { if (v < 0) v = last; last = v; return v; });
}

/* ---- the page ---- */
const slotEls = [];
let built = false;
function build() {
  if (built) return;
  built = true;
  const bars = $("mo-bars");
  [1, 2, 3, 4, 8].forEach((n) => {
    const b = el("button", "", String(n));
    b.addEventListener("click", () => { Cfg.bars = n; render(); });
    bars.appendChild(b);
  });
  $("mo-dub").addEventListener("click", () => { Cfg.dub = !Cfg.dub; msg = Cfg.dub ? "overdub on: move a knob while a motion plays and the move is added to it." : "overdub off."; render(); });
  const host = $("mo-slots");
  for (let i = 0; i < SLOT_COUNT; i++) {
    const b = el("button", "big mo-slot");
    b.appendChild(el("b", "", String(i + 1)));
    b.appendChild(el("span", "st"));
    b.appendChild(el("span", "pos"));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 64 20"); svg.setAttribute("preserveAspectRatio", "none");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    b.appendChild(svg);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); act(state.activeBus, i); });
    host.appendChild(b);
    slotEls.push(b);
  }
  $("mo-speed").addEventListener("click", () => speed(state.activeBus));
  $("mo-rev").addEventListener("click", () => reverse(state.activeBus));
  $("mo-clear").addEventListener("click", () => clear(state.activeBus));
}
const ST = ["empty", "waits…", "recording", "waits…", "playing"];
function render() {
  if (!built) return;
  const bus = state.activeBus, bs = Motion[bus];
  $("mo-bus").textContent = BUSES[bus].label;
  $("mo-bars").querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", [1, 2, 3, 4, 8][i] === Cfg.bars));
  $("mo-dub").classList.toggle("on", Cfg.dub);
  $("mo-hint").textContent = msg || (Clock.last > 0 && performance.now() - Clock.last < 1500 ? "Tap a slot: it records the next " + Cfg.bars + " bar(s) of what you move on this bus. Tap again to stop. Pick another bus with the tabs." : "No MIDI clock from the unit: motion runs on the tap tempo of the LFO page. Tap a slot to record.");
  slotEls.forEach((b, i) => {
    const m = bs.mo[i];
    b.className = "big mo-slot" + (m.st === 2 ? " rec" : m.st === 4 ? " play" : m.st === 1 || m.st === 3 ? " wait" : "") + (filled(m) ? " filled" : "") + (bs.sel === i ? " sel" : "");
    b.querySelector(".st").textContent = ST[m.st] === "empty" && filled(m) ? m.total / TICKS_BAR + " bar" : ST[m.st];
    const path = b.querySelector("path");
    if (filled(m)) {
      const c = curve(m, 16);
      path.setAttribute("d", c.map((v, k) => (k ? "L" : "M") + (k * 64 / 15).toFixed(1) + " " + (19 - v * 18 / 127).toFixed(1)).join(" "));
    } else path.setAttribute("d", "");
  });
  const m = bs.mo[bs.sel];
  $("mo-speed").querySelector("b").textContent = (m.speed > 0 ? m.speed : 1) + "×";
  $("mo-rev").querySelector("b").textContent = m.rev ? "back" : "fwd";
}
function paintPos() {
  if (!built || !document.body.classList.contains("perf")) return;
  const bs = Motion[state.activeBus];
  slotEls.forEach((b, i) => {
    const m = bs.mo[i];
    const p = m.st === 4 ? m.fpos / Math.max(m.total, 1) : m.st === 2 ? m.pos / Math.max(m.total, 1) : 0;
    const pos = b.querySelector(".pos");
    pos.style.left = "calc(" + (p * 100) + "% - " + (p * 3) + "px)"; /* a thin bar moves along the box while it records or plays */
    pos.style.opacity = m.st === 2 || m.st === 4 ? "" : "0";
    if (b.dataset.st !== String(m.st)) { b.dataset.st = String(m.st); render(); }
  });
}
Pulse.subs.add(tick);
Pulse.busyFns.add(() => Motion.some((bs) => bs.mo.some((m) => m.st !== 0)));

export { Motion, observe, build as buildMotion, render as renderMotion };
