import { BUS_TABLES } from "../data/effects-db.js";
import { ccFromDisp, ccFromEnum, defaultCcs, dispFromCc, enumFromCc, fxDefFor, syncOnForCc } from "../core/conv.js";
import { saveState, state } from "../core/store.js";
import { $, BUSES, clamp, el } from "../core/util.js";
import { applyFullState } from "./snapshots.js";
import { showBanner } from "../ui/banner.js";

/* ===== Recipes: full 5-bus presets typed in directly (e.g. from an
   SP-404 "recipe card" pack) rather than captured from live state like
   Snapshots. Same {fx, cc[6], on} per-bus shape as a Snapshot's buses
   array and loaded the same way (applyFullState), just entered by hand -
   the whole point is letting a card's own printed values (dB, ms, %, note
   names) go straight into the app via ccFromDisp instead of eyeballing
   knob positions. Not capped at 8 like the Snapshot slots. ===== */
const RECIPE_MAX = 60;
function sanitizeRecipe(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.buses) || r.buses.length !== 5) return null;
  const buses = r.buses.map((b) => ({
    fx: clamp((b && b.fx | 0) || 0, 0, 127),
    cc: (b && Array.isArray(b.cc) && b.cc.length === 6) ? b.cc.map((v) => clamp(v | 0, 0, 127)) : [64, 64, 64, 64, 64, 64],
    on: !!(b && b.on),
  }));
  return {
    id: (typeof r.id === "string" && r.id) ? r.id : "rc" + Date.now() + Math.random().toString(36).slice(2, 7),
    name: (typeof r.name === "string" && r.name.trim()) ? r.name.slice(0, 30) : "Recipe",
    buses,
  };
}
function blankRecipeBuses() {
  return BUSES.map(() => ({ fx: 0, cc: [64, 64, 64, 64, 64, 64], on: false }));
}
function openRecipes() {
  renderRecipesList();
  $("recipes").classList.add("open");
}
function renderRecipesList() {
  const host = $("recipes-list");
  if (!host) return;
  host.textContent = "";
  if (!state.recipes.length) {
    host.appendChild(el("p", "pick-note", "No recipes yet — tap “+ New Recipe” below and type one in from a card."));
    return;
  }
  state.recipes.forEach((r, i) => {
    const row = el("div", "xy-custom-row");
    const nameBtn = el("button", "setup-btn xy-custom-name", r.name);
    nameBtn.addEventListener("click", () => loadRecipe(r));
    const ren = el("button", "xy-custom-icon", "✎");
    ren.addEventListener("click", (e) => { e.stopPropagation(); openRecipeEditor(i); });
    const del = el("button", "xy-custom-icon", "✕");
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteRecipe(r.id); });
    row.appendChild(nameBtn); row.appendChild(ren); row.appendChild(del);
    host.appendChild(row);
  });
}
function loadRecipe(r) {
  applyFullState(r.buses);
  $("recipes").classList.remove("open");
  showBanner("\"" + r.name + "\" loaded", "info", 2000);
}
function deleteRecipe(id) {
  state.recipes = state.recipes.filter((r) => r.id !== id);
  saveState();
  renderRecipesList();
}
let recipeDraft = null; /* { id, name, buses[5] } while the editor is open */
let recipeEditIndex = null;
function openRecipeEditor(index) {
  recipeEditIndex = index;
  const r = (index != null) ? state.recipes[index] : null;
  recipeDraft = r
    ? { id: r.id, name: r.name, buses: r.buses.map((b) => ({ fx: b.fx, cc: b.cc.slice(), on: b.on })) }
    : { id: null, name: "Recipe " + (state.recipes.length + 1), buses: blankRecipeBuses() };
  $("recipe-edit-title").textContent = (index != null) ? "EDIT RECIPE" : "NEW RECIPE";
  $("re-name").value = recipeDraft.name;
  renderRecipeBuses();
  $("recipes").classList.remove("open");
  $("recipe-edit").classList.add("open");
}
function renderRecipeBuses() {
  const host = $("re-buses");
  host.textContent = "";
  BUSES.forEach((B, bus) => {
    const draft = recipeDraft.buses[bus];
    const table = BUS_TABLES[B.table];
    const def = fxDefFor(B.table, draft.fx);
    const block = el("div", "re-bus-block");
    block.appendChild(el("h4", "", B.label));
    const sel = el("select", "re-fx-select");
    table.forEach((name, num) => {
      const o = document.createElement("option");
      o.value = String(num); o.textContent = name;
      if (num === draft.fx) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      draft.fx = +sel.value;
      /* start from that effect's own defaults - a leftover cc set from
         whatever the previous effect was here means nothing on the new one */
      draft.cc = defaultCcs(fxDefFor(B.table, draft.fx));
      renderRecipeBuses();
    });
    block.appendChild(sel);
    const onRow = el("label", "re-onoff");
    const onCb = document.createElement("input");
    onCb.type = "checkbox"; onCb.checked = draft.on;
    onCb.addEventListener("change", () => { draft.on = onCb.checked; });
    onRow.appendChild(onCb);
    onRow.appendChild(document.createTextNode("EFX on"));
    block.appendChild(onRow);
    if (def) {
      const fields = el("div", "re-fields");
      def.p.forEach((p, i) => {
        if (i >= 6) return;
        const syncOn = syncOnForCc(def, draft.cc);
        const field = el("label", "je-field", p.n + (p.u ? " (" + p.u + ")" : ""));
        if (p.t === "e") {
          const s = document.createElement("select");
          s.className = "re-fx-select";
          p.v.forEach((opt, oi) => {
            const o = document.createElement("option");
            o.value = String(oi); o.textContent = opt;
            if (oi === enumFromCc(draft.cc[i], p.v.length)) o.selected = true;
            s.appendChild(o);
          });
          s.addEventListener("change", () => { draft.cc[i] = ccFromEnum(+s.value, p.v.length); });
          field.appendChild(s);
        } else if (p.t === "b") {
          const cb = document.createElement("input");
          cb.type = "checkbox"; cb.checked = draft.cc[i] >= 64;
          cb.addEventListener("change", () => {
            draft.cc[i] = cb.checked ? 127 : 0;
            if (p.n === "SYNC") renderRecipeBuses(); /* flips sibling fields between ms/note display */
          });
          field.appendChild(cb);
        } else if (p.t === "c" && p.sv && syncOn && Array.isArray(p.sv)) {
          const s = document.createElement("select");
          s.className = "re-fx-select";
          p.sv.forEach((opt, oi) => {
            const o = document.createElement("option");
            o.value = String(oi); o.textContent = opt;
            if (oi === enumFromCc(draft.cc[i], p.sv.length)) o.selected = true;
            s.appendChild(o);
          });
          s.addEventListener("change", () => { draft.cc[i] = ccFromEnum(+s.value, p.sv.length); });
          field.appendChild(s);
        } else {
          const inp = document.createElement("input");
          inp.type = "text"; inp.inputMode = "decimal";
          inp.value = dispFromCc(p, draft.cc[i], syncOn);
          inp.addEventListener("change", () => {
            const v = ccFromDisp(p, inp.value, syncOn);
            if (v != null) draft.cc[i] = v;
          });
          field.appendChild(inp);
        }
        fields.appendChild(field);
      });
      block.appendChild(fields);
    }
    host.appendChild(block);
  });
}
function saveRecipeDraft() {
  const name = $("re-name").value.trim().slice(0, 30) || recipeDraft.name;
  const saved = { id: recipeDraft.id || ("rc" + Date.now() + Math.random().toString(36).slice(2, 7)), name, buses: recipeDraft.buses };
  if (recipeEditIndex != null) state.recipes[recipeEditIndex] = saved;
  else {
    if (state.recipes.length >= RECIPE_MAX) { showBanner("Recipe list is full (" + RECIPE_MAX + ") — delete one first", "warn", 3000); return; }
    state.recipes.push(saved);
  }
  saveState();
  $("recipe-edit").classList.remove("open");
  openRecipes();
  showBanner("\"" + name + "\" saved", "info", 2000);
}

export { RECIPE_MAX, sanitizeRecipe, blankRecipeBuses, openRecipes, renderRecipesList, loadRecipe, deleteRecipe, recipeDraft, recipeEditIndex, openRecipeEditor, renderRecipeBuses, saveRecipeDraft };
