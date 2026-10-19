import { Midi } from "../core/midi.js";
import { JAM_MAX, sanitizeJamSlot, saveState, state } from "../core/store.js";
import { $, el } from "../core/util.js";
import { buildJam } from "./jam.js";
import { showBanner } from "../ui/banner.js";
import { controls } from "../ui/controls.js";

/* ===== JAM presets: factory templates for common gear, from verified
   MIDI implementation charts (not guessed) - each control still gets its
   own editable channel/CC/label after adding, so a wrong assumption here
   (e.g. this device's default per-track channel, which is user-configurable
   on the MC-101 itself) is a one-tap fix, not a dead end. ===== */
const JAM_PRESETS = [
  {
    id: "mc101-knobs",
    name: "MC-101 — 4 tracks × Sound/Filter/Mod/FX",
    note: "CC 80–83 (SOUND/FILTER/MOD/FX knobs, in the device's own left-to-right " +
      "order) per track, from Roland's MC-101 " +
      "MIDI implementation chart — both transmit and receive, so these mirror the " +
      "hardware knobs live. Track channels default to 1–4; check yours against " +
      "SHIFT + TRACK SEL on the device if it differs.",
    build() {
      /* physical knob order on the MC-101 itself: CTRL1 SOUND, CTRL2 FILTER,
         CTRL3 MOD, CTRL4 FX - matches left-to-right so the JAM grid mirrors
         the hardware layout */
      const knobs = [["SOUND", 83], ["FILTER", 80], ["MOD", 81], ["FX", 82]];
      const slots = [];
      for (let t = 0; t < 4; t++) {
        knobs.forEach(([label, num]) => {
          slots.push({ kind: "fader", source: "raw", ch: t, type: "cc", num, label: "T" + (t + 1) + " " + label, val: 64 });
        });
      }
      return slots;
    },
  },
];
let jamPresetPending = null;
function openJamPresets() {
  jamPresetPending = null;
  $("jampreset-title").textContent = "JAM PRESETS";
  $("jampreset-note").textContent = "Adds the preset's controls to your JAM grid – " +
    "existing controls are kept. Every added control keeps its own editable " +
    "channel/CC/label afterward, same as anything else in JAM.";
  const host = $("jampreset-list");
  host.textContent = "";
  JAM_PRESETS.forEach((preset) => {
    const b = el("button", "setup-btn", preset.name);
    b.addEventListener("click", () => openJamPresetPortPick(preset));
    host.appendChild(b);
  });
  $("jampreset").classList.add("open");
}
function openJamPresetPortPick(preset) {
  jamPresetPending = preset;
  $("jampreset-title").textContent = preset.name;
  $("jampreset-note").textContent = preset.note + " Pick which connected output this preset's controls should target.";
  const host = $("jampreset-list");
  host.textContent = "";
  const back = el("button", "setup-btn", "‹ Back");
  back.addEventListener("click", openJamPresets);
  host.appendChild(back);
  const mkPort = (name, label) => {
    const b = el("button", "setup-btn", label);
    b.addEventListener("click", () => applyJamPreset(preset, name));
    host.appendChild(b);
  };
  mkPort(null, "Default (SP-404 output)");
  if (Midi.access) Midi.access.outputs.forEach((p) => { if (Midi.live(p)) mkPort(p.name, p.name); });
}
function applyJamPreset(preset, port) {
  const room = JAM_MAX - state.jam.slots.length;
  if (room <= 0) { showBanner("JAM grid is full – delete some controls first", "warn", 3000); return; }
  const built = preset.build().map((c) => Object.assign({ port }, c));
  const clean = built.slice(0, room).map(sanitizeJamSlot).filter(Boolean);
  state.jam.slots.push(...clean);
  saveState();
  $("jampreset").classList.remove("open");
  buildJam();
  const dropped = built.length - clean.length;
  showBanner("Added " + clean.length + " controls from \"" + preset.name + "\"" + (dropped ? " (" + dropped + " skipped, grid full)" : ""), "info", 3000);
}

export { JAM_PRESETS, jamPresetPending, openJamPresets, openJamPresetPortPick, applyJamPreset };
