import { fxDefFor } from "../core/conv.js";
import { state } from "../core/store.js";
import { $, BUSES } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { setBusCc } from "../ui/controls.js";

/* ===== randomizer (one-step undo via second tap within 6 s) ===== */
const RND_SKIP = new Set(["LEVEL", "SEND", "GAIN"]);
let rndUndo = null; /* { bus, cc, t } */
function randomize(bus) {
  const B = BUSES[bus], b = state.buses[bus];
  const def = fxDefFor(B.table, b.fx);
  if (!def) { showBanner("Choose an effect first", "info", 2200); return; }
  if (rndUndo && rndUndo.bus === bus && performance.now() - rndUndo.t < 6000) {
    rndUndo.cc.forEach((v, i) => setBusCc(bus, i, v, { force: true }));
    rndUndo = null;
    updateRndBtn();
    return;
  }
  rndUndo = { bus, cc: b.cc.slice(), t: performance.now() };
  def.p.forEach((p, i) => {
    if (i >= 6 || p.t !== "c" || RND_SKIP.has(p.n)) return;
    setBusCc(bus, i, Math.floor(Math.random() * 128), { force: true });
  });
  updateRndBtn();
  setTimeout(updateRndBtn, 6100);
}
function updateRndBtn() {
  const active = rndUndo && rndUndo.bus === state.activeBus && performance.now() - rndUndo.t < 6000;
  $("rnd-btn").textContent = active ? "UNDO" : "RND";
  $("rnd-btn").classList.toggle("undo", !!active);
}

/* ===== device sync: removed in the public build =====
   Snapshots live in localStorage; use export/import (Snap panel) to move
   them between devices. */
let syncTimer = null;
function mergeRemote() { return false; }
function pushSync() {}
function scheduleSync() {}
function pullSync() {}
function updateSyncStatus() {
  $("sync-status").textContent = "Stored locally - move snapshots between devices via export/import.";
}

export { RND_SKIP, rndUndo, randomize, updateRndBtn, syncTimer, mergeRemote, pushSync, scheduleSync, pullSync, updateSyncStatus };
