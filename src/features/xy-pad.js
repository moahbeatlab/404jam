import { dispFromCc, fxDefFor, syncOnFor } from "../core/conv.js";
import { Midi } from "../core/midi.js";
import { state } from "../core/store.js";
import { $, BUSES, CC_CTRL, clamp } from "../core/util.js";
import { renderLfo } from "./lfo.js";
import { setBusCc } from "../ui/controls.js";

/* ===== XY pad (third view, absolute Kaoss-style position = value) ===== */
function xyAssign(axis) { return state.xy[axis]; }
function xyParam(a) {
  if (!a) return null;
  const def = fxDefFor(BUSES[a.bus].table, state.buses[a.bus].fx);
  return def ? (def.p[a.slot] || null) : null;
}
function xyLabelText(axis) {
  const a = xyAssign(axis);
  if (!a) return axis.toUpperCase() + ": – (tap)";
  const p = xyParam(a);
  return axis.toUpperCase() + ": " + BUSES[a.bus].label + " · " + (p ? p.n : "CTRL " + (a.slot + 1));
}
function positionCross(nx, ny) {
  $("xy-cross").style.left = (nx * 100) + "%";
  $("xy-cross").style.top = (ny * 100) + "%";
  $("xy-linev").style.left = (nx * 100) + "%";
  $("xy-lineh").style.top = (ny * 100) + "%";
}
function updateXyVals() {
  const parts = [];
  for (const axis of ["x", "y"]) {
    const a = xyAssign(axis);
    if (!a) continue;
    const p = xyParam(a);
    const def = fxDefFor(BUSES[a.bus].table, state.buses[a.bus].fx);
    const cc = state.buses[a.bus].cc[a.slot];
    parts.push(axis.toUpperCase() + " " + (p ? dispFromCc(p, cc, syncOnFor(a.bus, def)) : cc));
  }
  $("xy-vals").textContent = parts.join("   ") || "assign axes above";
}
function renderXy() {
  renderLfo();
  $("xy-xa").textContent = xyLabelText("x");
  $("xy-ya").textContent = xyLabelText("y");
  $("xy-mom").classList.toggle("on", !!state.xy.mom);
  const ax = xyAssign("x"), ay = xyAssign("y");
  positionCross(ax ? state.buses[ax.bus].cc[ax.slot] / 127 : 0.5,
                ay ? 1 - state.buses[ay.bus].cc[ay.slot] / 127 : 0.5);
  updateXyVals();
}
function setupXyPad() {
  const pad = $("xy-pad");
  let drag = null;
  const keyFor = (a) => a ? (BUSES[a.bus].ch << 8 | CC_CTRL[a.slot]) : null;
  function applyPos(e) {
    const r = pad.getBoundingClientRect();
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    const ax = xyAssign("x"), ay = xyAssign("y");
    if (ax) setBusCc(ax.bus, ax.slot, Math.round(nx * 127), {});
    if (ay) setBusCc(ay.bus, ay.slot, Math.round((1 - ny) * 127), {});
    positionCross(nx, ny);
    updateXyVals();
  }
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (drag) return; /* first pointer owns the pad */
    pad.setPointerCapture(e.pointerId);
    const ax = xyAssign("x"), ay = xyAssign("y");
    drag = { id: e.pointerId, prev: {
      x: ax ? state.buses[ax.bus].cc[ax.slot] : null,
      y: ay ? state.buses[ay.bus].cc[ay.slot] : null } };
    for (const a of [ax, ay]) { const k = keyFor(a); if (k !== null) Midi.activeCCs.add(k); }
    applyPos(e);
  });
  pad.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) applyPos(e); });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const prev = drag.prev;
    drag = null;
    const ax = xyAssign("x"), ay = xyAssign("y");
    for (const a of [ax, ay]) { const k = keyFor(a); if (k !== null) Midi.activeCCs.delete(k); }
    if (state.xy.mom) {
      /* spring back: short ramp to the pre-touch values */
      const from = {
        x: ax ? state.buses[ax.bus].cc[ax.slot] : null,
        y: ay ? state.buses[ay.bus].cc[ay.slot] : null };
      const STEPS = 4;
      for (let s = 1; s <= STEPS; s++) {
        setTimeout(() => {
          const f = s / STEPS;
          if (ax && prev.x !== null) setBusCc(ax.bus, ax.slot, Math.round(from.x + (prev.x - from.x) * f), { force: s === STEPS });
          if (ay && prev.y !== null) setBusCc(ay.bus, ay.slot, Math.round(from.y + (prev.y - from.y) * f), { force: s === STEPS });
          if (s === STEPS) renderXy();
        }, s * 30);
      }
    } else {
      /* trailing send */
      if (ax) Midi.send(BUSES[ax.bus].ch, CC_CTRL[ax.slot], state.buses[ax.bus].cc[ax.slot], true);
      if (ay) Midi.send(BUSES[ay.bus].ch, CC_CTRL[ay.slot], state.buses[ay.bus].cc[ay.slot], true);
    }
  }
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
}

export { xyAssign, xyParam, xyLabelText, positionCross, updateXyVals, renderXy, setupXyPad };
