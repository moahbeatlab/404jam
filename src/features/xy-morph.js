import { saveState, state } from "../core/store.js";
import { $, clamp, el } from "../core/util.js";
import { setBusCc } from "../ui/controls.js";
import { lfoBpm } from "./lfo.js";
import { openPick } from "./lfo-page.js";
import { positionCross, updateXyVals, xyAssign, xyHooks } from "./xy-pad.js";

/* ===== XY points: hold a point button to save where the pad is (4 points), tap it to go there.
   MORPH glides the pad between two of them: ping-pong, once, or by hand with the bar. ===== */
const XY_TIMES = [["1 beat", 1], ["2 beats", 2], ["1 bar", 4], ["2 bars", 8], ["4 bars", 16], ["8 bars", 32]];
const MODES = ["PING-PONG", "ONCE", "MANUAL"];
const HOLD = 450;
const Mo = { run: false, t: 0, dir: 1, last: 0 };
const btns = [];
let built = false, msg = "", clearArm = 0;

const axisVal = (a) => a ? state.buses[a.bus].cc[a.slot] : null;
function here() { return { x: axisVal(xyAssign("x")), y: axisVal(xyAssign("y")) }; }
function put(x, y, force) {
  const ax = xyAssign("x"), ay = xyAssign("y");
  if (ax && x !== null) setBusCc(ax.bus, ax.slot, Math.round(x), { force });
  if (ay && y !== null) setBusCc(ay.bus, ay.slot, Math.round(y), { force });
  positionCross(ax ? axisVal(ax) / 127 : 0.5, ay ? 1 - axisVal(ay) / 127 : 0.5);
  updateXyVals();
}
function stop() { Mo.run = false; }
function ends() {
  const m = state.xyMorph, A = state.xyPts[m.a], B = state.xyPts[m.b];
  return A && B ? [A, B] : null;
}
const lerp = (a, b, t) => a === null || b === null ? null : a + (b - a) * t;
function apply(t, force) {
  const e = ends();
  if (!e) return;
  Mo.t = clamp(t, 0, 1);
  put(lerp(e[0].x, e[1].x, Mo.t), lerp(e[0].y, e[1].y, Mo.t), force);
  paintBar();
}
function go() {
  const m = state.xyMorph;
  if (!ends()) { msg = "Hold two point buttons first to save two points."; render(); return; }
  if (m.a === m.b) { msg = "FROM and TO are the same point."; render(); return; }
  if (m.mode === 2) { msg = "MANUAL: drag the bar under the buttons."; render(); return; }
  if (Mo.run) { stop(); msg = "Morph stopped."; render(); return; }
  if (m.mode === 1) Mo.dir = Mo.t < 0.5 ? 1 : -1; /* once: to the end that is farther away */
  Mo.run = true; Mo.last = performance.now();
  msg = "";
  render();
}
setInterval(() => {
  if (!Mo.run) return;
  const m = state.xyMorph, now = performance.now();
  const beats = Math.min(now - Mo.last, 200) / 60000 * lfoBpm();
  Mo.last = now;
  let t = Mo.t + Mo.dir * beats / XY_TIMES[m.time][1];
  if (t >= 1 || t <= 0) {
    t = clamp(t, 0, 1);
    if (m.mode === 1) { Mo.run = false; apply(t, true); render(); return; }
    Mo.dir = -Mo.dir; /* ping-pong turns around */
  }
  apply(t, false);
}, 33);

function jump(i) {
  const p = state.xyPts[i];
  if (!p) { msg = "Point " + (i + 1) + " is empty: hold the button to save the pad's position."; render(); return; }
  stop(); put(p.x, p.y, true);
  const m = state.xyMorph;
  Mo.t = i === m.b ? 1 : i === m.a ? 0 : Mo.t;
  msg = "Point " + (i + 1) + ".";
  render();
}
function save(i) {
  const h = here();
  if (h.x === null && h.y === null) { msg = "Assign an axis first (X or Y above)."; render(); return; }
  state.xyPts[i] = h;
  saveState();
  if (navigator.vibrate) navigator.vibrate(15);
  msg = "Point " + (i + 1) + " saved.";
  render();
}
function pointButton(i) {
  const b = el("button", "pad xp-pt", String(i + 1));
  let timer = 0, held = false;
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); held = false; timer = setTimeout(() => { held = true; save(i); }, HOLD); });
  const up = (e) => { clearTimeout(timer); if (e.type === "pointerup" && !held) jump(i); };
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("pointerleave", () => clearTimeout(timer));
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  return b;
}
function pickPoint(title, cur, set) {
  openPick(title, [0, 1, 2, 3].map((i) => ({ t: String(i + 1), s: state.xyPts[i] ? "saved" : "empty: hold its button first" })), cur, (i) => {
    if (!state.xyPts[i]) { msg = "Point " + (i + 1) + " is empty."; render(); return; }
    set(i); stop(); saveState(); render();
  });
}
function paintBar() {
  const f = document.querySelector("#xm-bar i");
  if (f) f.style.width = (Mo.t * 100) + "%";
}
function build() {
  if (built) return;
  built = true;
  for (let i = 0; i < 4; i++) { const b = pointButton(i); $("xp-btns").appendChild(b); btns.push(b); }
  $("xp-clear").addEventListener("click", () => {
    const now = performance.now();
    if (now - clearArm > 2500) { clearArm = now; msg = "Tap CLEAR again to remove all four points."; render(); return; }
    clearArm = 0; state.xyPts = [null, null, null, null]; stop(); saveState(); msg = "Points cleared."; render();
  });
  $("xm-a").addEventListener("click", () => pickPoint("MORPH FROM", state.xyMorph.a, (i) => { state.xyMorph.a = i; Mo.t = 0; }));
  $("xm-b").addEventListener("click", () => pickPoint("MORPH TO", state.xyMorph.b, (i) => { state.xyMorph.b = i; Mo.t = 0; }));
  $("xm-mode").addEventListener("click", () => openPick("MORPH MODE", MODES.map((t, i) => ({ t, s: ["there and back, on the beat", "one way, then it stops", "you drag the bar"][i] })), state.xyMorph.mode, (i) => { state.xyMorph.mode = i; if (i === 2) stop(); saveState(); render(); }));
  $("xm-time").addEventListener("click", () => openPick("MORPH TIME (one way)", XY_TIMES.map((x) => ({ t: x[0] })), state.xyMorph.time, (i) => { state.xyMorph.time = i; saveState(); render(); }));
  $("xm-go").addEventListener("click", go);
  /* the bar: drag it to move the pad between the two points by hand */
  const bar = $("xm-bar");
  let drag = null;
  const at = (e) => { const r = bar.getBoundingClientRect(); stop(); apply((e.clientX - r.left) / r.width, false); };
  bar.addEventListener("pointerdown", (e) => { e.preventDefault(); if (!ends()) { msg = "Hold two point buttons first to save two points."; render(); return; } bar.setPointerCapture(e.pointerId); drag = e.pointerId; at(e); render(); });
  bar.addEventListener("pointermove", (e) => { if (drag === e.pointerId) at(e); });
  const end = (e) => { if (drag !== e.pointerId) return; drag = null; apply(Mo.t, true); };
  bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
  /* a finger on the pad takes over */
  $("xy-pad").addEventListener("pointerdown", () => { if (Mo.run) { stop(); msg = "Morph stopped: the pad is yours."; render(); } }, true);
  xyHooks.push(render);
}
function render() {
  if (!built) return;
  const m = state.xyMorph;
  btns.forEach((b, i) => {
    b.classList.toggle("empty", !state.xyPts[i]);
    b.classList.toggle("on", i === m.a || i === m.b);
    b.dataset.end = i === m.a ? "A" : i === m.b ? "B" : "";
  });
  $("xm-a").querySelector("b").textContent = m.a + 1;
  $("xm-b").querySelector("b").textContent = m.b + 1;
  $("xm-mode").querySelector("b").textContent = MODES[m.mode];
  $("xm-time").querySelector("b").textContent = XY_TIMES[m.time][0];
  const go = $("xm-go");
  go.textContent = m.mode === 2 ? "MANUAL" : Mo.run ? "STOP" : "GO";
  go.classList.toggle("on", Mo.run);
  go.disabled = m.mode === 2;
  $("xy-hint").textContent = msg || "Hold a point button to save the pad's position, tap it to go there. FROM and TO choose the two points to morph between.";
  const layer = $("xy-pts-layer");
  layer.replaceChildren();
  const ax = xyAssign("x"), ay = xyAssign("y");
  state.xyPts.forEach((p, i) => {
    if (!p) return;
    const d = el("div", "xy-pt" + (i === m.a ? " a" : i === m.b ? " b" : ""), String(i + 1));
    d.style.left = (p.x === null ? 50 : p.x / 127 * 100) + "%";
    d.style.top = (p.y === null ? 50 : (1 - p.y / 127) * 100) + "%";
    layer.appendChild(d);
  });
  paintBar();
}

export { build as buildXyMorph };
