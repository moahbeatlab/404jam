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
let built = false, host = null, navBtns = {}, body = null;
function build() {
  if (built) return;
  built = true;
  host = $("lab");
  host.textContent = "";
  const panel = el("div", "lb-panel");
  const top = el("div", "lb-top");
  top.appendChild(el("b", "lb-title", "SAMPLE LAB"));
  const name = el("span", "lb-proj");
  name.id = "lb-proj";
  top.appendChild(name);
  const close = el("button", "lb-btn lb-close", "Close");
  close.addEventListener("click", closeLab);
  top.appendChild(close);
  const msg = el("div", "");
  msg.id = "lb-msg";
  body = el("div", "lb-body");
  const nav = el("div", "lb-nav");
  TABS.forEach(([id, label]) => {
    const b = el("button", "lb-tab", label);
    b.addEventListener("click", () => show(id));
    nav.appendChild(b);
    navBtns[id] = b;
  });
  panel.append(top, msg, body, nav);
  host.appendChild(panel);
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
  const p = $("lb-proj");
  if (p) p.textContent = L.info && L.info.open ? L.info.name : "no project";
}
async function show(view) {
  build();
  L.view = view;
  stopAll();
  Object.entries(navBtns).forEach(([id, b]) => b.classList.toggle("on", id === view));
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
function closeLab() {
  stopAll();
  $("lab").classList.remove("open");
}
async function openLab() {
  build();
  $("lab").classList.add("open");
  /* wake the engine now, so it loads while the first screen draws */
  call("info").then((j) => { L.info = JSON.parse(j); paintHead(); if (L.view === "project" && views.project) views.project.show(); }).catch(() => {});
  await show(L.view);
}
export { openLab, closeLab, show };
