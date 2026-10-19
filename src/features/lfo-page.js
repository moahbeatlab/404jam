import { saveState, state } from "../core/store.js";
import { $, BUSES, clamp, el } from "../core/util.js";
import { setBusCc } from "../ui/controls.js";
import { lfoShape, LFO_SHIFTS, LFO_RATES, LFO_WAVES, LfoRt, clockAlive, lfoBpm, lfoHooks, lfoSel, lfoTap, lfoToggle, renderLfo, setLfoSel } from "./lfo.js";

/* ===== PERF > LFO: the LFO page of 404tui. Tap a cell and the choices open; the LFOs are the same four as on the XY page. ===== */
let built = false;
const cells = {};
const selBtns = [];

const knobName = (bus, k) => "CTRL " + (k + 1);
/* a new target: the LFO stops first, so the knob it was on is parked where it was */
function setTarget(bus, slot) {
  const rt = LfoRt[lfoSel], cfg = state.lfos[lfoSel];
  if (rt.on && cfg.target) { setBusCc(cfg.target.bus, cfg.target.slot, rt.center, { force: true }); rt.on = false; }
  cfg.target = { bus, slot };
  saveState();
  renderLfo();
}
let pickBound = false;
function openPick(title, opts, cur, pick) {
  if (!pickBound) { /* the choices overlay is shared by the LFO page and the XY morph bar, so its buttons are bound on first use */
    pickBound = true;
    $("lfpick-close").addEventListener("click", () => $("lfpick").classList.remove("open"));
    $("lfpick").addEventListener("pointerdown", (e) => { if (e.target === $("lfpick")) $("lfpick").classList.remove("open"); });
  }
  $("lfpick-title").textContent = title;
  const list = $("lfpick-list");
  list.replaceChildren();
  opts.forEach((o, i) => {
    const b = el("button", "big" + (i === cur ? " on" : ""));
    b.appendChild(el("b", "", o.t));
    if (o.s) b.appendChild(el("small", "", o.s));
    b.addEventListener("click", () => { $("lfpick").classList.remove("open"); pick(i); });
    list.appendChild(b);
  });
  $("lfpick").classList.add("open");
}
function cell(id, label, onTap) {
  const b = el("button", "big lf-cell");
  b.appendChild(el("small", "", label));
  b.appendChild(el("b"));
  b.addEventListener("click", onTap);
  $("lf-grid").appendChild(b);
  cells[id] = b;
}
function cfg() { return state.lfos[lfoSel]; }
function build() {
  if (built) return;
  built = true;
  for (let i = 0; i < 4; i++) {
    const b = el("button", "", "LFO " + (i + 1));
    b.addEventListener("click", () => { setLfoSel(i); renderLfo(); });
    $("lf-sel").appendChild(b);
    selBtns.push(b);
  }
  cell("bus", "BUS", () => {
    const t = cfg().target;
    openPick("BUS", BUSES.map((b, i) => ({ t: b.short === "IN" ? "IN" : b.short, s: b.label })), t ? t.bus : -1, (i) => setTarget(i, t ? t.slot : 0));
  });
  cell("knob", "KNOB", () => {
    const t = cfg().target, bus = t ? t.bus : state.activeBus;
    openPick("KNOB · " + BUSES[bus].label, [0, 1, 2, 3, 4, 5].map((k) => ({ t: knobName(bus, k) })), t ? t.slot : -1, (k) => setTarget(bus, k));
  });
  cell("wave", "SHAPE", () => openPick("SHAPE", LFO_WAVES.map((w) => ({ t: w, s: { RND: "drift", PUMP: "duck on the beat" }[w] })), cfg().wave, (i) => { cfg().wave = i; saveState(); renderLfo(); }));
  cell("rate", "RATE", () => openPick("RATE (one cycle)", LFO_RATES.map((r) => ({ t: r[0], s: r[1] >= 4 ? r[1] / 4 + (r[1] === 4 ? " bar" : " bars") : "" })), cfg().rate, (i) => { cfg().rate = i; saveState(); renderLfo(); }));
  cell("shift", "SHIFT", () => openPick("SHIFT (start of the cycle)", LFO_SHIFTS.map((x) => ({ t: x, s: x === "0" ? "in step" : "of a cycle later" })), cfg().shift | 0, (i) => { cfg().shift = i; saveState(); renderLfo(); }));
  cell("tap", "TEMPO", lfoTap); /* only there while the unit sends no clock */
  /* DEPTH: a fader, drag it from left to right */
  const fd = $("lf-depth");
  let drag = null;
  const setAmt = (e) => {
    const r = fd.getBoundingClientRect();
    cfg().amt = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 100);
    paintDepth();
  };
  fd.addEventListener("pointerdown", (e) => { e.preventDefault(); fd.setPointerCapture(e.pointerId); drag = e.pointerId; setAmt(e); });
  fd.addEventListener("pointermove", (e) => { if (drag === e.pointerId) setAmt(e); });
  const endDrag = (e) => { if (drag !== e.pointerId) return; drag = null; saveState(); };
  fd.addEventListener("pointerup", endDrag); fd.addEventListener("pointercancel", endDrag);
  setInterval(() => { if (document.body.classList.contains("perf") && $("view-perf").dataset.page === "lfo") render(); }, 1000); /* the clock comes and goes */
  $("lf-start").addEventListener("click", lfoToggle);
  lfoHooks.push(render);
  scopeLoop();
}
/* the line: one cycle of the wave (shape, shift, depth), and a dot where the LFO is now */
function drawScope() {
  const cv = $("lf-scope");
  if (!built || !cv.offsetWidth) return;
  const dpr = window.devicePixelRatio || 1, W = cv.offsetWidth, H = cv.offsetHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext("2d"), cs = getComputedStyle(document.body);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const c = cfg(), rt = LfoRt[lfoSel], wave = LFO_WAVES[c.wave], pump = wave === "PUMP";
  const amp = c.amt / 100 * (pump ? 127 : 63.5);
  const pad = 10, y = (w) => pad + (H - 2 * pad) * (1 - clamp((64 + w * amp) / 127, 0, 1));
  const accent = cs.getPropertyValue("--accent").trim() || "#ffb000", faint = cs.getPropertyValue("--line").trim() || "#34343a";
  g.strokeStyle = faint; g.lineWidth = 1; g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(0, y(0)); g.lineTo(W, y(0)); g.stroke(); g.setLineDash([]);
  const f = (x) => {
    if (wave === "RND") return rt.ra + (rt.rb - rt.ra) * x; /* the drift of this cycle */
    let ph = x + (c.shift | 0) * 0.25; ph -= Math.floor(ph);
    return lfoShape(wave, ph);
  };
  g.strokeStyle = rt.on ? accent : cs.getPropertyValue("--muted").trim() || "#9a9aa4"; g.lineWidth = 2.5; g.lineJoin = "round";
  g.beginPath();
  const N = wave === "SQR" ? 400 : 160;
  for (let i = 0; i <= N; i++) { const x = i / N; const px = x * W, py = y(f(x)); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.stroke();
  if (rt.on) {
    const x = rt.x, px = x * W, py = y(f(x));
    g.fillStyle = accent; g.beginPath(); g.arc(px, py, 6, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = accent; g.globalAlpha = .3; g.lineWidth = 1; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); g.globalAlpha = 1;
  }
}
function scopeLoop() {
  if (document.body.classList.contains("perf") && $("view-perf").dataset.page === "lfo") drawScope();
  requestAnimationFrame(scopeLoop);
}
function paintDepth() {
  const a = cfg().amt;
  $("lf-depth").querySelector("i").style.width = a + "%";
  $("lf-depth").querySelector("b").textContent = "DEPTH " + a + "%";
}
const set = (id, txt) => { cells[id].querySelector("b").textContent = txt; };
function render() {
  if (!built) return;
  const c = cfg(), t = c.target, on = LfoRt[lfoSel].on;
  selBtns.forEach((b, i) => { b.classList.toggle("on", i === lfoSel); b.classList.toggle("running", LfoRt[i].on); });
  set("bus", t ? BUSES[t.bus].short : "–");
  set("knob", t ? knobName(t.bus, t.slot) : "–");
  set("wave", LFO_WAVES[c.wave]);
  set("rate", LFO_RATES[c.rate][0]);
  set("shift", LFO_SHIFTS[c.shift | 0]);
  paintDepth();
  set("tap", "TAP " + Math.round(lfoBpm()));
  cells.tap.hidden = clockAlive();
  const st = $("lf-start");
  st.classList.toggle("on", on);
  st.textContent = on ? "LFO " + (lfoSel + 1) + " ON  ·  tap to stop" : t ? "START LFO " + (lfoSel + 1) : "choose BUS and KNOB first";
  $("lf-hint").textContent = clockAlive() ? "Runs on the clock of the unit." : "No MIDI clock from the unit: the LFOs run on the tap tempo (tap TEMPO in the beat).";
}

export { openPick, build as buildLfoPage, render as renderLfoPage };
