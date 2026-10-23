import { json, call } from "./client.js";
import { forget } from "./audio.js";
import { save as persist } from "./persist.js";

/* what the Lab screens share */
const L = {
  info: null, /* the engine's overview of the project: name, tempo, pads, patterns */
  pad: 0, /* the selected pad, 0..159 */
  bank: 0,
  ptn: 1, /* the selected pattern, 1..160 */
  view: "project",
};
const views = {}; /* name -> {root, show(), refresh()} */
const padCache = new Map(); /* pad -> {id, frames, channels} loaded from the project */
const subs = new Set();
const BANKS = "ABCDEFGHIJ";
const padLabel = (n) => BANKS[Math.floor(n / 16)] + (n % 16 + 1);
let msgTimer = null;
function say(text, kind) {
  const m = document.getElementById("lb-msg");
  if (!m) return;
  m.textContent = text || "";
  m.className = kind || "";
  clearTimeout(msgTimer);
  if (text && kind !== "err") msgTimer = setTimeout(() => { m.textContent = ""; }, 5000);
}
async function refreshInfo() {
  L.info = await json("info");
  return L.info;
}
let saveTimer = null;
function dirty() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!L.info || !L.info.open) return;
    try { persist(await call("exportZip", "PROJECT_01"), L.info.name); } catch (e) { /* no room or no storage: the project is still here */ }
  }, 2500);
}
/* something in the project changed: reload the overview, tell the screens, save a copy */
async function changed(what) {
  if (what && what.pads) what.pads.forEach((n) => dropPad(n));
  else if (!what) dropAllPads();
  await refreshInfo();
  subs.forEach((f) => f(what));
  dirty();
}
function dropPad(n) {
  const c = padCache.get(n);
  if (c) { padCache.delete(n); forget(c.id); }
}
function dropAllPads() { [...padCache.keys()].forEach(dropPad); }
/* the pad's sample as an engine handle (loaded once, kept until the pad changes) */
async function padMeta(n) {
  if (padCache.has(n)) return padCache.get(n);
  const m = await json("padSample", n);
  padCache.set(n, m);
  return m;
}
const onChange = (f) => { subs.add(f); return () => subs.delete(f); };
const freePads = (from, count) => {
  const out = [];
  if (!L.info) return out;
  for (let n = from; n < 160 && out.length < count; n++) if (!L.info.pads[n].has && !L.info.pads[n].file) out.push(n);
  return out;
};
export { L, views, BANKS, padLabel, say, refreshInfo, dirty, changed, dropPad, dropAllPads, padMeta, onChange, freePads };
