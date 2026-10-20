import { saveState, state } from "../core/store.js";
import { $, NOTE_NAMES, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { openPick } from "./lfo-page.js";
import { ORIGIN, pickSample, pitchName, sampleLabel } from "./sample-pick.js";
import { GATES, RATES, SWINGS, makeRunner } from "./stepper.js";

/* ===== TRIG: pick a sample, put notes on the steps of a pattern, then give each step a condition (how often it plays).
   It plays along with the unit: same clock, starts on the bar. Skipped steps stay silent but the pattern keeps moving. ===== */
const COND = [{ t: "●", s: "always" }, { t: "75%", p: 75 }, { t: "50%", p: 50 }, { t: "25%", p: 25 }, { t: "10%", p: 10 }];
[[1, 2], [2, 2], [1, 3], [2, 3], [3, 3], [1, 4], [2, 4], [3, 4], [4, 4]].forEach(([a, b]) => COND.push({ t: a + ":" + b, a, b, s: a === 1 ? "of " + b + " loops" : "" }));
COND.push({ t: "1st", first: true, s: "first loop" }, { t: "!1st", first: false, s: "not first" }, { t: "FILL", fill: true, s: "while held" }, { t: "!FILL", fill: false, s: "not held" });
const NOTE_RANGE = [36, 60];

/* cyc = how many times the pattern has looped since the start */
function cond(c, cyc, fill) {
  const k = COND[c] || COND[0];
  if (k.p) return Math.random() * 100 < k.p;
  if (k.a) return cyc % k.b === k.a - 1;
  if (k.first !== undefined) return k.first ? cyc === 0 : cyc > 0;
  if (k.fill !== undefined) return k.fill ? fill : !fill;
  return true;
}

let fillHeld = false, sel = 0, built = false;
const T = () => state.trig;
const runner = makeRunner({
  rate: () => T().rate, gate: () => T().gate, swing: () => T().swing, len: () => T().len,
  step: (i, cyc) => { const s = T().steps[i]; return s && cond(s.c, cyc, fillHeld) ? [{ n: s.n, v: 100 }] : null; },
  can: () => { if (T().steps.some(Boolean)) return true; showBanner("TRIG: put a note on a step first", "warn", 3000); return false; },
  onStep: (i) => paintNow(i),
  onRun: () => paintRun(),
});
const run = runner.run;

/* ---- the page ---- */
let laneEls = [];
const noteList = () => { const o = []; for (let n = NOTE_RANGE[1]; n >= NOTE_RANGE[0]; n--) o.push(n); return o; };
const noteOpt = (n) => ({ t: pitchName(n, T().key), s: n === ORIGIN ? "original" : (n > ORIGIN ? "+" : "") + (n - ORIGIN) });
function build() {
  if (built) return;
  built = true;
  const lane = $("tr-lane");
  for (let i = 0; i < 16; i++) {
    const b = el("button", "ar-step");
    b.appendChild(el("small", "", String(i + 1)));
    b.appendChild(el("b"));
    b.appendChild(el("i"));
    b.addEventListener("click", () => {
      sel = i;
      if (!T().steps[i]) T().steps[i] = { n: T().last, c: 0 }; /* an empty step gets the note you used last */
      saveState(); render();
    });
    lane.appendChild(b);
    laneEls.push(b);
  }
  $("tr-sample").addEventListener("click", () => pickSample(T().sample, (s) => { T().sample = s; saveState(); render(); }));
  $("tr-key").addEventListener("click", () => openPick("Key the sample is tuned to", NOTE_NAMES.map((n) => ({ t: n })), T().key, (i) => { T().key = i; saveState(); render(); }, 4));
  $("tr-note").addEventListener("click", () => {
    const s = T().steps[sel];
    const list = noteList();
    openPick("Note of step " + (sel + 1), list.map(noteOpt), s ? list.indexOf(s.n) : -1, (i) => {
      const n = list[i];
      T().steps[sel] = { n, c: s ? s.c : 0 }; T().last = n;
      saveState(); render();
    }, 5);
  });
  $("tr-cond").addEventListener("click", () => {
    const s = T().steps[sel];
    if (!s) return;
    openPick("Condition of step " + (sel + 1), COND.map((c) => ({ t: c.t, s: c.s })), s.c, (c) => { s.c = c; saveState(); render(); }, 4);
  });
  $("tr-clear").addEventListener("click", () => { T().steps[sel] = null; saveState(); render(); });
  const cellOf = (id, label, onTap) => {
    const b = el("button", "big lf-cell");
    b.appendChild(el("small", "", label)); b.appendChild(el("b"));
    b.addEventListener("click", onTap);
    $("tr-grid").appendChild(b);
    return b;
  };
  const g = {
    rate: cellOf("rate", "RATE", () => openPick("Rate", RATES.map((r) => ({ t: r[0] })), T().rate, (i) => { T().rate = i; saveState(); render(); }, 3)),
    len: cellOf("len", "STEPS", () => openPick("Steps in the pattern", Array.from({ length: 16 }, (_, i) => ({ t: String(i + 1) })), T().len - 1, (i) => { T().len = i + 1; saveState(); render(); }, 4)),
    gate: cellOf("gate", "GATE", () => openPick("Gate (note length)", GATES.map((x) => ({ t: x + "%" })), T().gate, (i) => { T().gate = i; saveState(); render(); }, 4)),
    swing: cellOf("swing", "SWING", () => openPick("Swing", SWINGS.map((s) => ({ t: s[0] })), T().swing, (i) => { T().swing = i; saveState(); render(); }, 3)),
  };
  build.g = g;
  $("tr-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { $("view-trig").dataset.page = b.dataset.p; render(); }));
  $("tr-go").addEventListener("click", () => runner.toggle());
  const fill = $("tr-fill");
  fill.addEventListener("pointerdown", (e) => { e.preventDefault(); try { fill.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } fillHeld = true; fill.classList.add("on"); });
  const off = () => { fillHeld = false; fill.classList.remove("on"); };
  fill.addEventListener("pointerup", off);
  fill.addEventListener("pointercancel", off);
}
function paintNow(i) { laneEls.forEach((b, k) => b.classList.toggle("now", k === i)); }
function paintRun() {
  document.body.classList.toggle("trig-run", runner.isOn());
  if (!built) return;
  const b = $("tr-go");
  b.classList.toggle("on", runner.isOn());
  b.textContent = run.on ? "STOP" : run.wait ? (run.quant ? "STARTS ON THE BAR…" : "STARTING…") : "START";
}
function render() {
  if (!built) return;
  const t = T(), page = $("view-trig").dataset.page;
  $("tr-seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === page));
  $("tr-sample").querySelector("b").textContent = sampleLabel(t.sample);
  $("tr-key").querySelector("b").textContent = NOTE_NAMES[t.key];
  laneEls.forEach((b, i) => {
    const s = t.steps[i];
    b.querySelector("b").textContent = s ? pitchName(s.n, t.key) : "·";
    b.querySelector("i").textContent = s ? COND[s.c].t : "";
    b.classList.toggle("set", !!s);
    b.classList.toggle("cnd", !!s && s.c !== 0);
    b.classList.toggle("off", i >= t.len);
    b.classList.toggle("sel", i === sel);
  });
  const s = t.steps[sel];
  $("tr-editor").querySelector("h4").textContent = "STEP " + (sel + 1);
  $("tr-note").querySelector("b").textContent = s ? pitchName(s.n, t.key) : "–";
  $("tr-cond").querySelector("b").textContent = s ? COND[s.c].t : "–";
  $("tr-note").disabled = $("tr-cond").disabled = $("tr-clear").disabled = !s;
  const g = build.g;
  g.rate.querySelector("b").textContent = RATES[t.rate][0];
  g.len.querySelector("b").textContent = String(t.len);
  g.gate.querySelector("b").textContent = GATES[t.gate] + "%";
  g.swing.querySelector("b").textContent = SWINGS[t.swing][0];
  $("tr-hint").textContent = (runner.clockAlive() ? "Follows the unit's clock, starts on the next bar. " : "No clock: tap tempo (" + Math.round(state.tapBpm) + " BPM, set on PERF > LFO), starts at once. ")
    + "Tap a step to put a note on it, then set its note and condition.";
  paintRun();
}
export { COND, cond, runner as trigRunner, build as buildTrig, render as renderTrig };
