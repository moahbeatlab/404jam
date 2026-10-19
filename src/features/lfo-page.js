import { saveState, state } from "../core/store.js";
import { $, BUSES, el } from "../core/util.js";
import { setBusCc } from "../ui/controls.js";
import { LFO_SHIFTS, LFO_DEPTHS, LFO_RATES, LFO_WAVES, LfoRt, clockAlive, lfoBpm, lfoHooks, lfoSel, lfoTap, lfoToggle, renderLfo, setLfoSel } from "./lfo.js";

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
function openPick(title, opts, cur, pick) {
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
  cell("depth", "DEPTH", () => openPick("DEPTH", LFO_DEPTHS.map((d) => ({ t: d + "%" })), cfg().depth, (i) => { cfg().depth = i; saveState(); renderLfo(); }));
  cell("tap", "TEMPO", lfoTap);
  $("lf-start").addEventListener("click", lfoToggle);
  $("lfpick-close").addEventListener("click", () => $("lfpick").classList.remove("open"));
  $("lfpick").addEventListener("pointerdown", (e) => { if (e.target === $("lfpick")) $("lfpick").classList.remove("open"); });
  lfoHooks.push(render);
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
  set("depth", LFO_DEPTHS[c.depth] + "%");
  set("tap", (clockAlive() ? "CLK " : "TAP ") + Math.round(lfoBpm()));
  const st = $("lf-start");
  st.classList.toggle("on", on);
  st.textContent = on ? "LFO " + (lfoSel + 1) + " ON  ·  tap to stop" : t ? "START LFO " + (lfoSel + 1) : "choose BUS and KNOB first";
  $("lf-hint").textContent = clockAlive() ? "Runs on the clock of the unit." : "No MIDI clock from the unit: the LFOs run on the tap tempo (tap TEMPO in the beat).";
}

export { build as buildLfoPage, render as renderLfoPage };
