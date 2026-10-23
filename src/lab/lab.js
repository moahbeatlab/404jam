import { $, el } from "../core/util.js";
import { call, onStatus, engineStatus } from "./client.js";
import { stopAll, context } from "./audio.js";
import { L, views, say, refreshInfo, onChange } from "./state.js";

/* ===== SAMPLE LAB: a full-screen module for preparing an SP-404MKII project without the unit ===== */
const TABS = [
  ["project", "PROJECT"], ["pads", "PADS"], ["slicer", "SLICE"], ["patterns", "PTN"], ["chords", "CHORDS"],
];
const loaders = {
  project: () => import("./project.js"),
  pads: () => import("./pads.js"),
  slicer: () => import("./slicer.js"),
  patterns: () => import("./patterns.js"),
  chords: () => import("./chords.js"),
};
let built = false, host = null, navBtns = {}, body = null, projEl = null;
function build() {
  if (built) return;
  built = true;
  host = $("view-lab");
  host.textContent = "";
  /* the same head row as JAM: a label, the project in an LCD, then the actions */
  const top = el("div", "lb-head");
  top.appendChild(el("span", "label", "LAB"));
  projEl = el("span", "display mono lb-proj");
  top.appendChild(projEl);
  body = el("div", "lb-body");
  host.append(top, body);
  /* the Lab's screens sit in the bus-tab row, styled like the bus tabs */
  const bar = $("bustabs");
  TABS.forEach(([id, label]) => {
    const b = el("button", "bustab labtab", label);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); show(id); });
    bar.appendChild(b);
    navBtns[id] = b;
  });
  /* sound may only start from a tap: every tap makes sure the audio is running (iOS in particular) */
  ["click", "touchend", "pointerup"].forEach((t) => host.addEventListener(t, () => { try { context(); } catch (e) { /* no audio */ } }, true));
  onChange(paintHead);
  onStatus((s) => {
    if (s === "loading") say("Loading the engine (about 1.5 MB)…");
    else if (s === "ready") say("Engine ready.");
    else if (s === "failed") say("The engine could not load. Reload the page and try again.", "err");
  });
}
function paintHead() {
  if (projEl) projEl.textContent = L.info && L.info.open ? L.info.name : "no project";
}
async function show(view) {
  build();
  L.view = view;
  stopAll();
  Object.entries(navBtns).forEach(([id, b]) => b.classList.toggle("active", id === view));
  Object.values(views).forEach((v) => { v.root.parentElement.style.display = "none"; });
  if (!views[view]) {
    const wrap = el("div", "lb-view");
    body.appendChild(wrap);
    try {
      const mod = await loaders[view]();
      views[view] = mod.build(wrap);
    } catch (e) { say("Could not open " + view + ": " + (e.message || e), "err"); return; }
  }
  views[view].root.parentElement.style.display = "";
  if (L.view === view && views[view].show) await views[view].show();
}
/* called by the app's view switcher */
async function enterLab() {
  build();
  paintHead();
  /* wake the engine now, so it loads while the first screen draws */
  call("info").then((j) => { L.info = JSON.parse(j); paintHead(); if (L.view === "project" && views.project) views.project.show(); }).catch(() => {});
  await show(L.view);
}
function leaveLab() { stopAll(); }
export { enterLab, leaveLab, show };
