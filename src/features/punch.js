import { fxDefFor, defaultCcs, dispFromCc, fxNameFor } from "../core/conv.js";
import { saveState, state } from "../core/store.js";
import { $, BUSES, clamp, el } from "../core/util.js";
import { BUS_TABLES } from "../data/effects-db.js";
import { PUNCH_PRESETS } from "../data/punch-presets.js";
import { showBanner } from "../ui/banner.js";
import { setBusCc } from "../ui/controls.js";
import { sendSw } from "../ui/views.js";
import { applyBusState } from "./snapshots.js";
import { LfoRt } from "./lfo.js";

/* ===== PUNCH: 4 snapshots of the buses. Hold one to punch it in, let go and the buses go back to what they were.
   EDIT keeps what you change while holding; MORPH moves from now to a snapshot with a slider.
   (the same idea as 404tui's Punch, over this app's own bus state, which it always knows) ===== */
const PUNCH_SLOTS = 4;
const PunchRt = { held: 0, was: null, applied: null, arm: false, mode: 0, sel: 0, active: 0, mix: 0, from: null, sent: null };
const MODES = ["HOLD", "EDIT", "MORPH"];
const HINTS = [
  "HOLD: hold a snapshot to punch it in, let go and everything goes back.",
  "EDIT: hold a snapshot and change the knobs; let go to keep what you changed in it.",
  "MORPH: tap a snapshot, then move the slider: 0 is now, 127 is the snapshot. Tap it again to stop.",
];

const emptyBus = () => ({ set: false, on: false, fx: 0, cc: [64, 64, 64, 64, 64, 64] });
const cloneBus = (b) => ({ set: b.set, on: b.on, fx: b.fx, cc: b.cc.slice() });
const snapOf = (i) => state.punch[i];
const snapSet = (s) => !!s && s.some((b) => b.set);

function capture() {
  return state.buses.map((b) => ({ set: b.fx > 0 || b.on, on: b.on, fx: b.fx, cc: b.cc.slice() }));
}
/* what a running LFO would be centred on is the value to go back to, not the value it has just swung to */
function lfoBase(cap) {
  LfoRt.forEach((rt, i) => {
    const t = state.lfos[i].target;
    if (rt.on && t) cap[t.bus].cc[t.slot] = rt.center;
  });
  return cap;
}
/* the LFO leaves a bus alone while a punch or a morph owns it */
function punchOwns(bus) {
  const s = PunchRt.held ? snapOf(PunchRt.held - 1) : null;
  if (s && (PunchRt.mode === 1 || s[bus].set)) return true;
  const m = PunchRt.active ? snapOf(PunchRt.active - 1) : null;
  return !!(m && m[bus].set);
}
function recentreLfos() {
  LfoRt.forEach((rt, i) => { const t = state.lfos[i].target; if (rt.on && t) rt.center = state.buses[t.bus].cc[t.slot]; });
}

function setSel(slot) { PunchRt.sel = slot + 1; }
function save(slot) {
  state.punch[slot] = capture();
  PunchRt.arm = false;
  saveState();
  say("PUNCH " + (slot + 1) + " saved: " + summary(state.punch[slot]));
}
function summary(s) {
  const parts = [];
  s.forEach((b, i) => { if (b.set) parts.push(BUSES[i].short + " " + (b.fx > 0 ? fxNameFor(BUSES[i].table, b.fx) : "off")); });
  return parts.length ? parts.join(", ") : "nothing";
}
let hint = "";
function say(t) { hint = t; renderPunch(); }

function down(slot) {
  setSel(slot);
  if (PunchRt.mode === 2 && !PunchRt.arm) { morphStart(slot); return; }
  if (PunchRt.arm) { save(slot); return; }
  if (PunchRt.held) { if (PunchRt.held === slot + 1) up(slot); return; }
  const snap = snapOf(slot);
  if (!snapSet(snap)) { say("PUNCH " + (slot + 1) + " is empty: tap SAVE, then it. Or fill it with a preset."); return; }
  PunchRt.held = slot + 1;
  PunchRt.was = lfoBase(capture());
  snap.forEach((s, b) => { if (s.set) applyBusState(b, { fx: s.fx, cc: s.cc, on: s.fx > 0 ? true : s.on }); });
  PunchRt.applied = capture();
  say("PUNCH " + (slot + 1) + " held: let go to go back.");
}
function up(slot) {
  if (PunchRt.mode === 2) return;
  if (PunchRt.held !== slot + 1) return;
  const snap = snapOf(slot);
  let text = "let go", kept = 0;
  if (PunchRt.mode === 1) {
    const cur = capture();
    snap.forEach((s, b) => {
      const a = PunchRt.applied[b], c = cur[b];
      if (c.fx !== a.fx || c.on !== a.on || c.cc.some((v, k) => v !== a.cc[k])) { snap[b] = { set: true, on: c.on, fx: c.fx, cc: c.cc.slice() }; kept++; }
    });
    saveState();
    text = kept ? "let go, " + kept + (kept === 1 ? " bus" : " buses") + " kept: " + summary(snap) : "let go, nothing changed";
  }
  snap.forEach((s, b) => { if (s.set || PunchRt.mode === 1) applyBusState(b, PunchRt.was[b]); });
  recentreLfos();
  PunchRt.held = 0; PunchRt.was = null; PunchRt.applied = null;
  say("PUNCH " + (slot + 1) + " " + text);
}

/* ---- MORPH ---- */
function morphBus(a, b, mix) {
  const out = cloneBus(a);
  const half = mix >= 64, same = a.fx === b.fx || b.fx === 0;
  if (half) { if (b.fx > 0) out.fx = b.fx; out.on = b.fx > 0 ? true : b.on; }
  out.cc = a.cc.map((x, k) => {
    const y = b.cc[k];
    if (!same) return half ? y : x;
    return Math.round(x + (y - x) * mix / 127);
  });
  return out;
}
function morphStart(slot) {
  if (PunchRt.active === slot + 1) { PunchRt.active = 0; say("MORPH " + (slot + 1) + " stopped where it is."); return; }
  if (!snapSet(snapOf(slot))) { say("PUNCH " + (slot + 1) + " is empty: tap SAVE, then it."); return; }
  PunchRt.active = slot + 1; PunchRt.mix = 0;
  PunchRt.from = lfoBase(capture());
  PunchRt.sent = PunchRt.from.map(cloneBus);
  say("MORPH to " + (slot + 1) + ": move the slider.");
}
function morphSet(mix) {
  if (!PunchRt.active) return;
  PunchRt.mix = clamp(mix | 0, 0, 127);
  snapOf(PunchRt.active - 1).forEach((to, b) => {
    if (!to.set) return;
    const out = morphBus(PunchRt.from[b], to, PunchRt.mix), sent = PunchRt.sent[b];
    if (out.fx !== sent.fx) {
      applyBusState(b, { fx: out.fx, cc: out.cc, on: out.on });
    } else {
      if (out.on !== sent.on) sendSw(b, out.on);
      out.cc.forEach((v, k) => { if (v !== sent.cc[k]) setBusCc(b, k, v, { force: true }); });
    }
    PunchRt.sent[b] = cloneBus(out);
  });
  paintMorph();
}

/* ---- presets ---- */
function presetInto(preset, slot) {
  const p = PUNCH_PRESETS[preset];
  if (!p) return;
  if (PunchRt.held) up(PunchRt.held - 1);
  state.punch[slot] = BUSES.map((B, i) => {
    const q = i < 4 ? p.buses[i] : null;
    if (!q) return emptyBus();
    const num = BUS_TABLES[B.table].indexOf(q.fx);
    if (num < 0) return emptyBus();
    const dflt = defaultCcs(fxDefFor(B.table, num));
    return { set: true, on: true, fx: num, cc: q.k.map((v, k) => (v < 0 ? dflt[k] : clamp(v, 0, 127))) };
  });
  saveState();
  say("PUNCH " + (slot + 1) + ": " + p.name);
}

/* ---- the page ---- */
let built = false, presetSlot = 0;
const slotBtns = [];
function buildPunch() {
  if (built) return;
  built = true;
  const host = $("pn-slots");
  for (let i = 0; i < PUNCH_SLOTS; i++) {
    const b = el("button", "big pn-slot");
    b.appendChild(el("b", "", String(i + 1)));
    b.appendChild(el("span", "pn-sum"));
    b.appendChild(el("span", "pn-dots"));
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); down(i); });
    const rel = () => up(i);
    b.addEventListener("pointerup", rel);
    b.addEventListener("pointercancel", rel);
    host.appendChild(b);
    slotBtns.push(b);
  }
  $("pn-mode").querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => {
    if (PunchRt.held) up(PunchRt.held - 1);
    PunchRt.mode = i; PunchRt.active = 0; PunchRt.arm = false; say(HINTS[i]);
  }));
  $("pn-save").addEventListener("click", () => {
    PunchRt.arm = !PunchRt.arm;
    say(PunchRt.arm ? "SAVE: tap a snapshot to store all the buses in it." : "");
  });
  $("pn-presets").addEventListener("click", openPresets);
  $("pnpreset-close").addEventListener("click", () => $("pnpreset").classList.remove("open"));
  $("pnpreset").addEventListener("pointerdown", (e) => { if (e.target === $("pnpreset")) $("pnpreset").classList.remove("open"); });
  const m = $("pn-morph");
  const set = (e) => { const r = m.getBoundingClientRect(); morphSet((e.clientX - r.left) / r.width * 127); };
  m.addEventListener("pointerdown", (e) => { e.preventDefault(); m.setPointerCapture(e.pointerId); m._drag = true; set(e); });
  m.addEventListener("pointermove", (e) => { if (m._drag) set(e); });
  const end = () => { m._drag = false; };
  m.addEventListener("pointerup", end);
  m.addEventListener("pointercancel", end);
  const seg = $("pn-into");
  for (let i = 0; i < PUNCH_SLOTS; i++) {
    const b = el("button", "", String(i + 1));
    b.addEventListener("click", () => { presetSlot = i; paintInto(); });
    seg.appendChild(b);
  }
  renderPunch();
}
function paintInto() { $("pn-into").querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === presetSlot)); }
function openPresets() {
  const list = $("pnpreset-list");
  list.textContent = "";
  PUNCH_PRESETS.forEach((p, i) => {
    const b = el("button", "big pn-pre");
    b.appendChild(el("b", "", p.name));
    b.appendChild(el("small", "", p.note));
    b.addEventListener("click", () => { presetInto(i, presetSlot); $("pnpreset").classList.remove("open"); });
    list.appendChild(b);
  });
  paintInto();
  $("pnpreset").classList.add("open");
}
function paintMorph() {
  const m = $("pn-morph");
  m.classList.toggle("off", !PunchRt.active);
  m.querySelector("i").style.width = (PunchRt.mix / 127 * 100) + "%";
  m.querySelector("b").textContent = PunchRt.active ? "MORPH " + PunchRt.active + " · " + PunchRt.mix : "tap a snapshot first";
}
function valuesHtml(host, bus) {
  const B = BUSES[bus], b = state.buses[bus], def = fxDefFor(B.table, b.fx);
  const row = el("div", "pn-val");
  row.appendChild(el("b", "", B.short + " " + fxNameFor(B.table, b.fx) + (b.on ? "" : " (off)")));
  const t = el("span", "");
  t.textContent = def ? def.p.slice(0, 6).map((p, k) => p.n + " " + dispFromCc(p, b.cc[k], false)).join(" · ") : "";
  row.appendChild(t);
  host.appendChild(row);
}
function renderPunch() {
  if (!built) return;
  const root = $("view-perf");
  root.dataset.pmode = String(PunchRt.mode);
  $("pn-mode").querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === PunchRt.mode));
  $("pn-save").classList.toggle("on", PunchRt.arm);
  $("pn-hint").textContent = hint || HINTS[PunchRt.mode];
  slotBtns.forEach((b, i) => {
    const s = snapOf(i), set = snapSet(s);
    b.classList.toggle("empty", !set);
    b.classList.toggle("held", PunchRt.held === i + 1);
    b.classList.toggle("sel", PunchRt.sel === i + 1);
    b.classList.toggle("act", PunchRt.active === i + 1);
    b.querySelector(".pn-sum").textContent = set ? s.map((x, k) => (x.set && x.fx > 0 ? fxNameFor(BUSES[k].table, x.fx) : "")).filter(Boolean).join(" · ") : "empty";
    const dots = b.querySelector(".pn-dots");
    dots.textContent = "";
    BUSES.forEach((B, k) => { const d = el("i", "bus" + k + (s && s[k].set ? " on" : "")); dots.appendChild(d); });
  });
  const vals = $("pn-vals");
  vals.textContent = "";
  if (PunchRt.mode === 1 && PunchRt.held) for (let b = 0; b < 5; b++) if (snapOf(PunchRt.held - 1)[b].set) valuesHtml(vals, b);
  paintMorph();
}
/* the values on show change while the knobs move */
setInterval(() => { if (PunchRt.held && PunchRt.mode === 1 && document.body.classList.contains("perf")) renderPunch(); }, 250);

export { PunchRt, PUNCH_SLOTS, punchOwns, buildPunch, renderPunch, up as punchUp };
