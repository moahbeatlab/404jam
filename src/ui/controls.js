import { ccFromDefault, ccFromEnum, dispFromCc, enumFromCc, fxDefFor, syncOnFor } from "../core/conv.js";
import { Midi, queueSyncSiblings } from "../core/midi.js";
import { saveState, state } from "../core/store.js";
import { $, BUSES, CC_CTRL, clamp, el } from "../core/util.js";
import { strips } from "./views.js";

/* ===== 07 controls (fader / toggle / stepper) ===== */
const controls = BUSES.map(() => [null, null, null, null, null, null]); /* focus view */
const stripControls = BUSES.map(() => [null, null, null, null, null, null]);
/* drags must survive DOM rebuilds (device fx change, bus switch mid-drag):
   otherwise activeCCs leaks and the CC goes deaf for device input */
const liveDrags = new Map(); /* key ch<<8|cc -> { node, finish } */
/* JAM tiles pinned to a bus/ctrl slot need repainting on the same events as
   the focus/overview faders for that slot (hardware encoder input, effect
   switch, snapshot load) - keyed the same as renderQueue (bus*8+slot) */
const jamByBusSlot = new Map(); /* key -> Set<() => void> */
/* same idea for JAM raw controls pinned to a second device (e.g. an MC-101's
   own hardware knobs) - keyed by the JAM slot's own id since raw controls
   aren't tied to a bus/slot pair the way jamByBusSlot's keys are */
const jamRawUpdateFns = new Map(); /* cfg.id -> Set<() => void> */
function finishDragsIn(host) {
  for (const [k, d] of [...liveDrags]) {
    if (host.contains(d.node)) d.finish();
  }
}
const renderQueue = new Set();
function queueSlotRender(bus, slot) {
  renderQueue.add(bus * 8 + slot);
  scheduleFlush();
}
let flushReq = 0;
function scheduleFlush() {
  if (flushReq) return;
  flushReq = requestAnimationFrame(() => {
    flushReq = 0;
    const q = [...renderQueue];
    renderQueue.clear();
    for (const k of q) {
      const bus = Math.floor(k / 8), slot = k % 8;
      try {
        if (controls[bus][slot]) controls[bus][slot].update();
        if (stripControls[bus][slot]) stripControls[bus][slot].update();
        const jc = jamByBusSlot.get(k);
        if (jc) jc.forEach((fn) => fn());
      } catch (e) { /* one broken control must never freeze the whole render loop */ }
    }
  });
}

function setBusCc(bus, slot, cc, opts) {
  cc = clamp(cc | 0, 0, 127);
  const b = state.buses[bus];
  if (b.cc[slot] === cc && !(opts && opts.force)) return;
  b.cc[slot] = cc;
  Midi.send(BUSES[bus].ch, CC_CTRL[slot], cc, opts && opts.force);
  queueSlotRender(bus, slot);
  queueSyncSiblings(bus, slot);
  saveState();
}

/* stepper popover (surgical +/-1) */
const stepCtx = { bus: 0, slot: 0 };
function openStepper(x, y, bus, slot) {
  stepCtx.bus = bus; stepCtx.slot = slot;
  const s = $("stepper");
  s.classList.add("open");
  const w = 136, h = 64;
  s.style.left = clamp(x - w / 2, 8, window.innerWidth - w - 8) + "px";
  s.style.top = clamp(y - h - 16, 8, window.innerHeight - h - 8) + "px";
}
function closeStepper() { $("stepper").classList.remove("open"); }

/* paints a fader's fill/thumb from a single 0-100 percent - orientation
   (vertical vs. body.horiz-faders) is resolved entirely in CSS via --pct */
function paintFader(fill, thumb, pct) {
  fill.style.setProperty("--pct", pct + "%");
  thumb.style.setProperty("--pct", pct + "%");
}

/* JAM's alternate "rotary knob" style (Setup > JAM style). Same 0-100 pct
   as paintFader, remapped as a left/right tilt from straight-up (12
   o'clock = the 0-127 midpoint, ~64): drag right of center to increase
   toward 127, left of center to decrease toward 0, same balance-pot
   convention as .fader's "bal" display. The arc fills from the 12 o'clock
   reference out toward whichever side the pointer has tilted, so a
   centered value shows an empty ring. */
/* 135deg off vertical = the classic 270deg-total hardware-pot sweep (7:30
   to 4:30), just re-centered so 12 o'clock is the value's midpoint instead
   of the sweep's start - at +-60deg the fill barely showed at either
   extreme, this reads as "maxed out" the way a real knob does. */
const KNOB_MAX_TILT = 135;
function paintKnob(dial, pointer, pct) {
  const angle = (pct - 50) / 50 * KNOB_MAX_TILT;
  pointer.style.transform = "rotate(" + angle + "deg)";
  const lo = Math.min(0, angle), hi = Math.max(0, angle);
  dial.style.background =
    "conic-gradient(from " + lo + "deg, var(--accent) 0deg " + (hi - lo) + "deg, var(--track-bg) " + (hi - lo) + "deg 360deg)";
}

/* generic relative-drag fader engine, shared by bus focus faders and
   custom MIDI faders (index.html custom tab). Orientation-aware: reads
   body.horiz-faders so the same code drives vertical and sideways drag,
   swapping which axis is "value" vs. "fine-tune pull". */
function attachFaderDrag(fader, dom, opts) {
  let drag = null, hideT = 0, lastTap = 0;
  /* horiz-faders is scoped off for callers that pass allowHoriz:false (the
     JAM grid: its tiles are narrow columns, a sideways fader has no travel
     to work with there regardless of the Focus-view toggle) */
  const horiz = () => opts.allowHoriz !== false && document.body.classList.contains("horiz-faders");
  function finishDrag() {
    if (!drag) return;
    drag = null;
    if (opts.key != null) liveDrags.delete(opts.key);
    if (opts.echoKey != null) Midi.activeCCs.delete(opts.echoKey);
    fader.classList.remove("drag");
    hideT = setTimeout(() => { dom.big.classList.remove("show"); dom.big.style.marginLeft = ""; }, 800);
    if (opts.trailingSend) opts.trailingSend();
  }
  fader.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fader.setPointerCapture(e.pointerId);
    const h = horiz();
    drag = {
      id: e.pointerId, startX: e.clientX, startY: e.clientY,
      lastPos: h ? e.clientX : e.clientY, horiz: h,
      acc: opts.get(), moved: 0,
      /* sensitivity (finger travel for full 0-127 sweep) is normally derived
         from the visible track size, floored at 60px - but a small tile
         (JAM grid) would make that floor the operative value, giving a
         twitchy few-cm sweep. opts.sensitivity overrides it with a fixed,
         comfortable travel distance decoupled from how small the control
         is drawn - the same principle as pointer capture already letting a
         drag continue past the tile's edges. */
      h: opts.sensitivity || Math.max(h ? dom.track.clientWidth : dom.track.clientHeight, 60),
    };
    if (opts.key != null) liveDrags.set(opts.key, { node: fader, finish: finishDrag });
    if (opts.echoKey != null) Midi.activeCCs.add(opts.echoKey);
    fader.classList.add("drag");
    clearTimeout(hideT);
    dom.big.classList.add("show");
    /* clamp the big readout to the viewport (edge slots) */
    const r = dom.big.getBoundingClientRect();
    dom.big.style.marginLeft = (Math.max(0, 8 - r.left) - Math.max(0, r.right - window.innerWidth + 8)) + "px";
  });
  fader.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pos = drag.horiz ? e.clientX : e.clientY;
    const perp = drag.horiz ? Math.abs(e.clientY - drag.startY) : Math.abs(e.clientX - drag.startX);
    const fine = perp > 120 ? 0.1 : perp > 60 ? 0.25 : 1;
    const dv = drag.horiz ? (pos - drag.lastPos) : (drag.lastPos - pos);
    drag.lastPos = pos;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.startY), Math.abs(e.clientX - drag.startX));
    drag.acc = clamp(drag.acc + dv * fine * 127 / drag.h, 0, 127);
    const target = opts.snapN ? ccFromEnum(enumFromCc(Math.round(drag.acc), opts.snapN), opts.snapN) : Math.round(drag.acc);
    if (target !== opts.get()) opts.set(target, {});
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    finishDrag();
    if (moved < 6) {
      const now = performance.now();
      if (now - lastTap < 300) { /* double tap -> default */
        if (opts.onDefault) opts.set(opts.onDefault(), { force: true });
        lastTap = 0;
      } else lastTap = now;
    }
  }
  fader.addEventListener("pointerup", endDrag);
  fader.addEventListener("pointercancel", endDrag);
  fader.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (e.deltaY < 0 ? 1 : -1);
    opts.set(opts.get() + step, { force: true });
  }, { passive: false });
  if (dom.val && opts.onStepperOpen) {
    dom.val.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      const r = dom.val.getBoundingClientRect();
      opts.onStepperOpen(r.left + r.width / 2, r.top);
    });
  }
  return { finishDrag };
}

/* one control in a slot; kind: "fader" | "snap" | "seg" | "toggle" */
function buildControl(slotEl, bus, slot, mini) {
  const B = BUSES[bus];
  const def = fxDefFor(B.table, state.buses[bus].fx);
  const p = def && def.p[slot];
  slotEl.textContent = "";
  slotEl.className = mini ? "slot" : "slot";
  if (!p) {
    slotEl.classList.add("empty");
    slotEl.appendChild(el("div", "fader"));
    slotEl.appendChild(el("div", "slot-label", "–"));
    return null;
  }
  const label = el("div", "slot-label", p.n);
  /* each branch defines its own block-scoped update() and MUST bind it here -
     a shared { update } literal would capture the hoisted fader update */
  const api = {};

  if (!mini && p.t === "b") {
    const btn = el("button", "slot-toggle pad", p.n);
    slotEl.appendChild(btn);
    slotEl.appendChild(label);
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const cur = state.buses[bus].cc[slot];
      setBusCc(bus, slot, cur >= 64 ? 0 : 127, { force: true });
    });
    function update() {
      const on = state.buses[bus].cc[slot] >= 64;
      btn.classList.toggle("on", on);
      btn.textContent = p.n + " " + (on ? "ON" : "OFF");
    }
    api.update = update;
    update();
    return api;
  }

  if (!mini && p.t === "e" && p.v.length <= 6) {
    const seg = el("div", "seg");
    const btns = p.v.map((v, i) => {
      const b2 = el("button", "", v);
      b2.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        setBusCc(bus, slot, ccFromEnum(i, p.v.length), { force: true });
      });
      seg.appendChild(b2);
      return b2;
    });
    slotEl.appendChild(seg);
    slotEl.appendChild(label);
    function update() {
      const cur = enumFromCc(state.buses[bus].cc[slot], p.v.length);
      btns.forEach((b2, i) => b2.classList.toggle("on", i === cur));
    }
    api.update = update;
    update();
    return api;
  }

  /* fader (continuous, snapped enum, bal, pan, nt, and everything in mini strips) */
  const snapN = (p.t === "e") ? p.v.length : 0;
  const fader = el("div", "fader");
  const val = el("button", "fader-val display mono");
  const wrap = el("div", "fader-track-wrap");
  const track = el("div", "fader-track");
  const fill = el("div", "fader-fill");
  const thumb = el("div", "fader-thumb");
  const big = el("div", "bigval display mono");
  track.appendChild(fill); track.appendChild(thumb);
  wrap.appendChild(track);
  fader.appendChild(val); fader.appendChild(wrap); fader.appendChild(big);
  slotEl.appendChild(fader);
  slotEl.appendChild(label);

  function curCc() { return state.buses[bus].cc[slot]; }
  function disp(cc) { return dispFromCc(p, cc, syncOnFor(bus, def)); }
  function update() {
    const cc = curCc();
    paintFader(fill, thumb, cc / 127 * 100);
    const d = disp(cc);
    val.textContent = d;
    big.textContent = d;
  }
  api.update = update;
  update();

  const key = B.ch << 8 | CC_CTRL[slot];
  attachFaderDrag(fader, { val: mini ? null : val, big, track }, {
    key, echoKey: key, snapN,
    get: curCc,
    set: (v, o) => setBusCc(bus, slot, v, o),
    onDefault: () => ccFromDefault(p),
    trailingSend: () => Midi.send(B.ch, CC_CTRL[slot], curCc(), true),
    onStepperOpen: mini ? null : (x, y) => openStepper(x, y, bus, slot),
  });
  return api;
}

export { controls, stripControls, liveDrags, jamByBusSlot, jamRawUpdateFns, finishDragsIn, renderQueue, queueSlotRender, flushReq, scheduleFlush, setBusCc, stepCtx, openStepper, closeStepper, paintFader, KNOB_MAX_TILT, paintKnob, attachFaderDrag, buildControl };
