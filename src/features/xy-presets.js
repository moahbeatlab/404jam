import { BUS_TABLES } from "../data/effects-db.js";
import { fxDefFor } from "../core/conv.js";
import { fxChange } from "../core/midi.js";
import { saveState, state } from "../core/store.js";
import { $, BUSES, el } from "../core/util.js";
import { LfoRt, lfoSel, renderLfo } from "./lfo.js";
import { renderXy, xyAssign } from "./xy-pad.js";
import { showBanner } from "../ui/banner.js";
import { setBusCc } from "../ui/controls.js";
import { currentView, setActiveBus, setView } from "../ui/views.js";

/* ===== XY presets: curated templates (real parameter names, like the JAM
   presets) plus the user's own saved axis combos ===== */
const XY_TEMPLATES = [
  { id: "isolator", name: "Isolator — LOW × HIGH", fx: "Isolator", x: "LOW", y: "HIGH",
    note: "Cut the lows on one side, the highs on the other — park in a corner to isolate the mids." },
  { id: "super-filter", name: "Super Filter — CUTOFF × RESONANCE", fx: "Super Filter", x: "CUTOFF", y: "RESONANCE",
    note: "Classic filter sweep, with resonance piling on as you go." },
  { id: "tape-echo", name: "Tape Echo — TIME × FEEDBACK", fx: "Tape Echo", x: "TIME", y: "FEEDBACK",
    note: "Drag right for longer echoes, up for more repeats." },
  { id: "phaser", name: "Phaser — RATE × DEPTH", fx: "Phaser", x: "RATE", y: "DEPTH",
    note: "How fast it sweeps vs. how far — anywhere from a subtle swirl to full jet-flange." },
  { id: "wah", name: "Wah — MANUAL × PEAK", fx: "Wah", x: "MANUAL", y: "PEAK",
    note: "Pedal position and resonance peak in one gesture, DJ-scratch style." },
  { id: "resonator", name: "Resonator — BRIGHT × FEEDBACK", fx: "Resonator", x: "BRIGHT", y: "FEEDBACK",
    note: "Tone and ring-out length of the pitched resonance." },
];
function xyTemplateBuses(t) {
  return BUSES.map((B, i) => (BUS_TABLES[B.table].includes(t.fx) ? i : null)).filter((i) => i !== null);
}
const XY_PRESETS_MAX = 16;
function sanitizeXyPreset(p) {
  if (!p || typeof p !== "object") return null;
  const axis = (a) => (a && a.bus >= 0 && a.bus < 5 && a.slot >= 0 && a.slot < 6) ? { bus: a.bus | 0, slot: a.slot | 0 } : null;
  const x = axis(p.x), y = axis(p.y);
  if (!x || !y) return null;
  return {
    id: (typeof p.id === "string" && p.id) ? p.id : "xy" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: (typeof p.name === "string" && p.name.trim()) ? p.name.slice(0, 24) : "Combo",
    x, y, mom: !!p.mom,
  };
}
function openXyPresets() {
  $("xypreset-title").textContent = "XY PRESETS";
  $("xypreset-note").textContent = "Templates switch the bus to that effect if it isn't already " +
    "loaded, then assign both axes from its real parameter names. Your own combos just re-point " +
    "X/Y to wherever they were pointed when you saved them.";
  renderXyTemplateList();
  renderXyCustomList();
  $("xypreset").classList.add("open");
}
function renderXyTemplateList() {
  const host = $("xypreset-templates");
  host.textContent = "";
  XY_TEMPLATES.forEach((t) => {
    const b = el("button", "setup-btn", t.name);
    b.addEventListener("click", () => openXyTemplateBusPick(t));
    host.appendChild(b);
  });
}
function openXyTemplateBusPick(t) {
  const host = $("xypreset-templates");
  host.textContent = "";
  const back = el("button", "setup-btn", "‹ Back");
  back.addEventListener("click", renderXyTemplateList);
  host.appendChild(back);
  xyTemplateBuses(t).forEach((i) => {
    const b = el("button", "setup-btn", BUSES[i].label);
    b.addEventListener("click", () => applyXyTemplate(t, i));
    host.appendChild(b);
  });
  $("xypreset-note").textContent = t.note + " Pick which bus.";
}
function applyXyTemplate(t, bus) {
  const table = BUSES[bus].table;
  const fxNum = BUS_TABLES[table].indexOf(t.fx);
  if (fxNum < 0) { showBanner("That effect isn't on this bus", "warn", 2500); return; }
  if (state.buses[bus].fx !== fxNum) fxChange(bus, fxNum, "user");
  const def = fxDefFor(table, fxNum);
  const xi = def.p.findIndex((p) => p.n === t.x);
  const yi = def.p.findIndex((p) => p.n === t.y);
  if (xi < 0 || yi < 0) { showBanner("Couldn't find those parameters", "warn", 2500); return; }
  state.xy.x = { bus, slot: xi };
  state.xy.y = { bus, slot: yi };
  saveState();
  setActiveBus(bus);
  renderXy();
  $("xypreset").classList.remove("open");
  showBanner("\"" + t.name + "\" applied to " + BUSES[bus].label, "info", 2500);
}
function renderXyCustomList() {
  const host = $("xypreset-custom");
  host.textContent = "";
  if (!state.xyPresets.length) {
    host.appendChild(el("p", "pick-note", "No saved combos yet — dial in an X/Y pair below, then “Save current”."));
    return;
  }
  state.xyPresets.forEach((p) => {
    const row = el("div", "xy-custom-row");
    const nameBtn = el("button", "setup-btn xy-custom-name", p.name);
    nameBtn.addEventListener("click", () => applyXyCustom(p));
    const ren = el("button", "xy-custom-icon", "✎");
    ren.addEventListener("click", (e) => { e.stopPropagation(); renameXyPreset(row, p); });
    const del = el("button", "xy-custom-icon", "✕");
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteXyPreset(p.id); });
    row.appendChild(nameBtn); row.appendChild(ren); row.appendChild(del);
    host.appendChild(row);
  });
}
function renameXyPreset(row, p) {
  const nameBtn = row.querySelector(".xy-custom-name");
  const input = el("input", "xy-custom-edit");
  input.type = "text"; input.maxLength = 24; input.value = p.name;
  nameBtn.replaceWith(input);
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") { input.value = p.name; input.blur(); }
  });
  input.addEventListener("blur", () => {
    const v = input.value.trim();
    if (v) p.name = v.slice(0, 24);
    saveState();
    renderXyCustomList();
  });
  setTimeout(() => { input.focus(); input.select(); }, 30);
}
function applyXyCustom(p) {
  state.xy.x = { bus: p.x.bus, slot: p.x.slot };
  state.xy.y = { bus: p.y.bus, slot: p.y.slot };
  state.xy.mom = !!p.mom;
  saveState();
  renderXy();
  $("xypreset").classList.remove("open");
  showBanner("\"" + p.name + "\" applied", "info", 2000);
}
function deleteXyPreset(id) {
  state.xyPresets = state.xyPresets.filter((p) => p.id !== id);
  saveState();
  renderXyCustomList();
}
function saveCurrentXyPreset() {
  const ax = xyAssign("x"), ay = xyAssign("y");
  if (!ax || !ay) { showBanner("Assign both X and Y first", "info", 2500); return; }
  if (state.xyPresets.length >= XY_PRESETS_MAX) { showBanner("Combo list is full — delete one first", "warn", 2500); return; }
  const p = {
    id: "xy" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: "Combo " + (state.xyPresets.length + 1),
    x: { bus: ax.bus, slot: ax.slot }, y: { bus: ay.bus, slot: ay.slot }, mom: !!state.xy.mom,
  };
  state.xyPresets.push(p);
  saveState();
  renderXyCustomList();
  const row = [...$("xypreset-custom").children].find((r) => r.querySelector(".xy-custom-name")?.textContent === p.name);
  if (row) renameXyPreset(row, p);
}

let xyPickAxis = "x", xyPickBus = 0;
function openXyPick(axis) {
  xyPickAxis = axis;
  const a = axis === "lfo" ? state.lfos[lfoSel].target : xyAssign(axis);
  xyPickBus = a ? a.bus : state.activeBus;
  $("xypick-title").textContent = axis === "lfo" ? "LFO TARGET" : (axis === "x" ? "X" : "Y") + " AXIS";
  renderXyPick();
  $("xypick").classList.add("open");
}
function renderXyPick() {
  const bh = $("xypick-bus");
  bh.textContent = "";
  BUSES.forEach((B, i) => {
    const b = el("button", "setup-btn" + (i === xyPickBus ? " sel" : ""), B.label);
    b.addEventListener("click", () => { xyPickBus = i; renderXyPick(); });
    bh.appendChild(b);
  });
  const sh = $("xypick-slot");
  sh.textContent = "";
  const def = fxDefFor(BUSES[xyPickBus].table, state.buses[xyPickBus].fx);
  const cur = xyPickAxis === "lfo" ? state.lfos[lfoSel].target : xyAssign(xyPickAxis);
  for (let i = 0; i < 6; i++) {
    const p = def && def.p[i];
    const sel = cur && cur.bus === xyPickBus && cur.slot === i;
    const b = el("button", "setup-btn" + (sel ? " sel" : ""), (i + 1) + " · " + (p ? p.n : "CTRL " + (i + 1)));
    b.addEventListener("click", () => {
      if (xyPickAxis === "lfo") {
        const rt = LfoRt[lfoSel];
        const old = state.lfos[lfoSel].target;
        if (rt.on && old && (old.bus !== xyPickBus || old.slot !== i))
          setBusCc(old.bus, old.slot, rt.center, { force: true }); /* park the abandoned target */
        LfoRt.forEach((r, j) => { /* one target belongs to one slot */
          if (j !== lfoSel && r.on) {
            const o = state.lfos[j].target;
            if (o && o.bus === xyPickBus && o.slot === i) r.on = false;
          }
        });
        state.lfos[lfoSel].target = { bus: xyPickBus, slot: i };
        if (rt.on) { rt.center = state.buses[xyPickBus].cc[i]; rt.beats = 0; rt.lastT = performance.now(); }
        renderLfo();
      } else {
        state.xy[xyPickAxis] = { bus: xyPickBus, slot: i };
        renderXy();
      }
      saveState();
      $("xypick").classList.remove("open");
    });
    sh.appendChild(b);
  }
}
let xyReturnOverview = false;
function toggleXyView() {
  if (currentView() === "xy") setView(xyReturnOverview ? "overview" : "focus");
  else { xyReturnOverview = currentView() === "overview"; setView("xy"); }
}

export { XY_TEMPLATES, xyTemplateBuses, XY_PRESETS_MAX, sanitizeXyPreset, openXyPresets, renderXyTemplateList, openXyTemplateBusPick, applyXyTemplate, renderXyCustomList, renameXyPreset, applyXyCustom, deleteXyPreset, saveCurrentXyPreset, xyPickAxis, xyPickBus, openXyPick, renderXyPick, xyReturnOverview, toggleXyView };
