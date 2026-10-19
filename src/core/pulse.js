/* one counter of 24-per-beat pulses for the things that follow the beat (Motion): the unit's own clock when there is one,
   else the tap tempo (clock.js feeds it), so they work without a clock too */
const Pulse = { n: 0, subs: new Set(), busyFns: new Set(), busy: () => [...Pulse.busyFns].some((f) => f()), at: 0 }; /* busyFns: who needs the pulses to run without a clock */
function pulse() { Pulse.n++; Pulse.subs.forEach((f) => f(Pulse.n)); }

export { Pulse, pulse };
