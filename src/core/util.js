/* set at build time by vite.config.js: the time of the build, and the date + short hash of the last commit */
const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
const LAST_CHANGED = typeof __LAST_CHANGED__ === "string" ? __LAST_CHANGED__ : "dev";

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
