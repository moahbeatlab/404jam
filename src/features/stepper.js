import { Clock } from "../core/clock.js";
import { Midi } from "../core/midi.js";
import { Pulse } from "../core/pulse.js";
import { showBanner } from "../ui/banner.js";

/* ===== the step engine ARP and TRIG share: it follows the unit's clock (else the tap tempo), starts on a bar, plays notes on the
   chromatic channel (CH16) with a gate, and can delay the odd steps (swing). The two features only decide WHAT a step plays. ===== */
const CH = 15;
const RATES = [["1/4", 24], ["1/8", 12], ["1/8T", 8], ["1/16", 6], ["1/16T", 4], ["1/32", 3]]; /* pulses per step (24 per beat) */
const GATES = [25, 50, 75, 100];
const SWINGS = [["OFF", 0], ["LIGHT", 1 / 6], ["TRIPLET", 1 / 3]]; /* odd steps come later by this part of a step */
const clockAlive = () => Clock.last > 0 && performance.now() - Clock.last <= 1500;

/* o: rate() gate() swing() len() -> numbers (indices into the lists above), step(i, cycle, count) -> [{n, v}] | null,
   can() -> bool, onStep(i), onRun() */
function makeRunner(o) {
  const run = { on: false, wait: false, quant: false, step: 0, idx: 0, last: 0, active: [], later: [], warned: false };
  function sendOn(n, off, v) {
    if (!Midi.sendNote(CH, n, true, v)) {
      if (!run.warned) { run.warned = true; showBanner("SP-404 not connected - nothing sent", "warn", 4000); }
      return;
    }
    run.active.push({ note: n, off });
  }
  function flush() {
    run.active.forEach((h) => Midi.sendNote(CH, h.note, false));
    run.active = []; run.later = [];
  }
  function fire(n) {
    const per = RATES[o.rate()][1], len = o.len(), i = run.step % len, cyc = Math.floor(run.step / len);
    o.onStep(i);
    const k = run.idx++;
    run.step++;
    const notes = o.step(i, cyc, k);
    if (!notes || !notes.length) return;
    const delay = run.step % 2 === 0 ? Math.round(per * SWINGS[o.swing()][1]) : 0; /* step already advanced: even = the odd step */
    const gate = Math.max(1, Math.round(per * GATES[o.gate()] / 100));
    const go = (at) => notes.forEach((x) => sendOn(x.n, at + gate, x.v));
    if (delay) run.later.push({ at: n + delay, go }); else go(n);
  }
  function tick(n) {
    if (n < run.last && (run.on || run.wait)) { flush(); run.step = 0; run.idx = 0; } /* the unit started over */
    run.last = n;
    if (!run.on && !run.wait) return;
    /* the first clock pulse after the unit's start is its downbeat (n = 1), so the grid is (n - 1) */
    if (run.wait) {
      if (run.quant && (n - 1) % 96 !== 0) return;
      run.wait = false; run.on = true; run.step = 0; run.idx = 0; o.onRun();
    }
    run.active = run.active.filter((h) => { if (h.off <= n) { Midi.sendNote(CH, h.note, false); return false; } return true; });
    run.later = run.later.filter((l) => { if (l.at <= n) { l.go(l.at); return false; } return true; });
    if ((n - 1) % RATES[o.rate()][1] === 0) fire(n);
  }
  const isOn = () => run.on || run.wait;
  function start() {
    if (isOn() || (o.can && !o.can())) return;
    run.warned = false; run.quant = clockAlive(); run.wait = true;
    o.onRun();
  }
  function stop() {
    run.on = false; run.wait = false;
    flush();
    o.onStep(-1); o.onRun();
  }
  Pulse.subs.add(tick);
  Pulse.busyFns.add(isOn);
  return { run, start, stop, isOn, toggle: () => (isOn() ? stop() : start()), clockAlive };
}
export { CH, RATES, GATES, SWINGS, makeRunner, clockAlive };
