const BUILD = "2026-07-25.19"; /* bump on deploy - shown in Setup to spot stale caches */
const LAST_CHANGED = "2026-08-31 (a241f90)"; /* date + short git hash of the last commit;
   stamped by a follow-up commit right after the real one lands, since a commit can't
   contain its own hash - shown in Setup so anyone can tell exactly which commit they're
   running */

/* ===== 02 UTIL ===== */
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const PHONE = window.matchMedia("(max-width: 520px)");

const CC_CTRL = [16, 17, 18, 80, 81, 82];
const CC_SW = 19, CC_FX = 83;
const RECV_CCS = new Set([16, 17, 18, 19, 80, 81, 82, 83]);
const BUSES = [
  { label: "BUS 1", short: "1", ch: 0, table: "bus12" },
  { label: "BUS 2", short: "2", ch: 1, table: "bus12" },
  { label: "BUS 3", short: "3", ch: 2, table: "bus34" },
  { label: "BUS 4", short: "4", ch: 3, table: "bus34" },
  { label: "INPUT", short: "IN", ch: 4, table: "input" },
];
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export { BUILD, LAST_CHANGED, $, clamp, el, PHONE, CC_CTRL, CC_SW, CC_FX, RECV_CCS, BUSES, NOTE_NAMES };
