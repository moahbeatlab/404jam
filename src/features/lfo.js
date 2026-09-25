import { Clock } from "../core/clock.js";
import { fxDefFor } from "../core/conv.js";
import { Midi } from "../core/midi.js";
import { saveState, state } from "../core/store.js";
import { $, BUSES, CC_CTRL, clamp } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { queueSlotRender, setBusCc } from "../ui/controls.js";

/* ===== beat LFOs (4 slots: 3 LFOs + drift; clock-synced, tap fallback) ===== */
const LFO_WAVES = ["SIN", "TRI", "SQR", "SAW", "RND"];
const LFO_RATES = [["4/1", 16], ["2/1", 8], ["1/1", 4], ["1/2", 2], ["1/4", 1], ["1/8", 0.5], ["1/16", 0.25]];
const LFO_DEPTHS = [25, 50, 75, 100];
const LfoRt = [0, 1, 2, 3].map(() => ({ on: false, beats: 0, lastT: 0, center: 64, cyc: -1, ra: 0, rb: 0 }));
let lfoSel = 0, lfoTaps = [];
function setLfoSel(v) { lfoSel = v; }
const lfoChips = [];
function clockAlive() { return Clock.last > 0 && performance.now() - Clock.last <= 1500; }
function lfoBpm() { return (clockAlive() && Clock.bpm) ? Clock.bpm : state.tapBpm; }
function lfoToggle() {
  const rt = LfoRt[lfoSel], t = state.lfos[lfoSel].target;
  if (!rt.on && !t) { showBanner("Choose an LFO target first", "info", 2200); return; }
  rt.on = !rt.on;
  if (rt.on) {
    LfoRt.forEach((r, j) => { /* one target belongs to one slot */
      if (j !== lfoSel && r.on) {
        const o = state.lfos[j].target;
        if (o && o.bus === t.bus && o.slot === t.slot) r.on = false;
      }
    });
    rt.center = state.buses[t.bus].cc[t.slot];
    rt.beats = 0; rt.lastT = performance.now();
    rt.cyc = -1; rt.ra = 0; rt.rb = 0;
  } else if (t) {
    setBusCc(t.bus, t.slot, rt.center, { force: true }); /* park at center */
  }
  renderLfo();
}
setInterval(() => {
  const now = performance.now();
  for (let i = 0; i < 4; i++) {
    const rt = LfoRt[i];
    if (!rt.on) continue;
    const cfg = state.lfos[i], t = cfg.target;
    if (!t) { rt.on = false; continue; }
    const B = BUSES[t.bus], b = state.buses[t.bus];
    if (Midi.activeCCs.has(B.ch << 8 | CC_CTRL[t.slot])) {
      rt.center = b.cc[t.slot]; /* a finger wins and re-centers */
      continue;
    }
    /* incremental phase: BPM jitter only affects the current slice */
    rt.beats += Math.min(now - rt.lastT, 1000) / 60000 * lfoBpm();
    rt.lastT = now;
    const cyc = rt.beats / LFO_RATES[cfg.rate][1];
    const ph = cyc - Math.floor(cyc);
    const wave = LFO_WAVES[cfg.wave];
    let w;
    if (wave === "SIN") w = Math.sin(ph * 2 * Math.PI);
    else if (wave === "TRI") w = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    else if (wave === "SQR") w = ph < 0.5 ? 1 : -1;
    else if (wave === "SAW") w = ph * 2 - 1;
    else { /* RND: drift between random anchors, renewed once per cycle */
      const k = Math.floor(cyc);
      if (k !== rt.cyc) { rt.cyc = k; rt.ra = rt.rb; rt.rb = Math.random() * 2 - 1; }
      w = rt.ra + (rt.rb - rt.ra) * ph;
    }
    const amp = LFO_DEPTHS[cfg.depth] / 100 * 63.5;
    const cc = clamp(Math.round(rt.center + w * amp), 0, 127);
    if (b.cc[t.slot] !== cc) {
      b.cc[t.slot] = cc; /* no saveState: a wobbling value is not worth persisting */
      Midi.send(B.ch, CC_CTRL[t.slot], cc);
      queueSlotRender(t.bus, t.slot);
    }
  }
}, 33);
function lfoTargetLabel(cfg) {
  const t = cfg.target;
  if (!t) return "Target: – (tap)";
  const def = fxDefFor(BUSES[t.bus].table, state.buses[t.bus].fx);
  const p = def && def.p[t.slot];
  return "Target: " + BUSES[t.bus].label + " · " + (p ? p.n : "CTRL " + (t.slot + 1));
}
function renderLfo() {
  lfoChips.forEach((c, i) => {
    c.classList.toggle("sel", i === lfoSel);
    c.classList.toggle("running", LfoRt[i].on);
  });
  const cfg = state.lfos[lfoSel];
  $("lfo-on").classList.toggle("on", LfoRt[lfoSel].on);
  $("lfo-target").textContent = lfoTargetLabel(cfg);
  $("lfo-wave").textContent = LFO_WAVES[cfg.wave];
  $("lfo-rate").textContent = LFO_RATES[cfg.rate][0];
  $("lfo-depth").textContent = LFO_DEPTHS[cfg.depth] + "%";
  $("lfo-tap").textContent = clockAlive() ? "CLK " + Math.round(lfoBpm()) : "TAP " + Math.round(state.tapBpm);
}
function lfoTap() {
  const now = performance.now();
  lfoTaps = lfoTaps.filter((x) => now - x < 3000);
  lfoTaps.push(now);
  if (lfoTaps.length >= 2) {
    const iv = (lfoTaps[lfoTaps.length - 1] - lfoTaps[0]) / (lfoTaps.length - 1);
    state.tapBpm = clamp(Math.round(60000 / iv), 30, 300);
    LfoRt.forEach((r) => { r.beats = 0; r.lastT = now; }); /* anchor phases to the tap */
    saveState();
  }
  renderLfo();
}

export { LFO_WAVES, LFO_RATES, LFO_DEPTHS, LfoRt, lfoSel, setLfoSel, lfoTaps, lfoChips, clockAlive, lfoBpm, lfoToggle, lfoTargetLabel, renderLfo, lfoTap };
