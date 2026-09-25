import { BUS_TABLES, CAT_LABELS, CAT_ORDER, EFFECTS } from "../data/effects-db.js";
import { fxDefFor } from "../core/conv.js";
import { fxChange } from "../core/midi.js";
import { assignableNames, directName, favList, fxDisplayName, isFav, saveState, setDirectFx, state } from "../core/store.js";
import { $, BUSES, el } from "../core/util.js";
import { scheduleSync } from "../features/randomizer.js";
import { renderFocusFavs } from "./views.js";

/* ===== 09 picker ===== */
let pickerBus = 0, pressTimer = null, pressFired = false;
function openPicker(bus, assignSlot) {
  pickerBus = bus;
  const B = BUSES[bus];
  const body = $("picker-body");
  body.textContent = "";
  /* assign mode: choose which effect sits on a device Direct-FX slot */
  if (typeof assignSlot === "number") {
    const oj = $("jumpbar"); if (oj) oj.remove();
    $("picker-title").textContent = "DIRECT FX" + (assignSlot + 1) + " · ASSIGNMENT";
    body.appendChild(el("div", "pick-note",
      "Tell the app which effect sits on the device Direct FX slot " + (assignSlot + 1) +
      " (SP-404 SYSTEM setting) - the faders then show the real parameter names."));
    const curName = directName(assignSlot + 1);
    const mkA = (name, isClear) => {
      const it = el("button", "pick-item" + (isClear ? " off-item" : "") +
        ((isClear ? !curName : curName === name) ? " sel" : ""));
      it.appendChild(el("span", "", isClear ? "(not set)" : name));
      it.addEventListener("click", () => { setDirectFx(assignSlot, isClear ? null : name); closePicker(); });
      return it;
    };
    const g0 = el("div", "pick-grid");
    g0.appendChild(mkA(null, true));
    body.appendChild(g0);
    const byCat = {};
    CAT_ORDER.forEach((c) => { byCat[c] = []; });
    assignableNames().forEach((n) => {
      const c = EFFECTS[n] ? EFFECTS[n].c : "weird";
      (byCat[c] || byCat.weird).push(n);
    });
    CAT_ORDER.forEach((c) => {
      if (!byCat[c] || !byCat[c].length) return;
      const sec = el("div", "pick-cat");
      sec.appendChild(el("h3", "", CAT_LABELS[c]));
      const g = el("div", "pick-grid");
      byCat[c].forEach((n) => g.appendChild(mkA(n, false)));
      sec.appendChild(g);
      body.appendChild(sec);
    });
    $("picker").classList.add("open");
    return;
  }
  $("picker-title").textContent = B.label + " · EFFECT";
  const table = BUS_TABLES[B.table];
  const cur = state.buses[bus].fx;

  const mkItem = (num, wide) => {
    const name = table[num];
    const item = el("button", "pick-item" + (num === 0 ? " off-item" : "") + (num === cur ? " sel" : ""));
    item.appendChild(el("span", "", fxDisplayName(B.table, num)));
    if (num > 0) {
      const star = el("span", "star" + (isFav(B.table, num) ? " fav" : ""), "★");
      item.appendChild(star);
    }
    /* select only on a full down+up pair on THIS item without movement:
       protects against scroll gestures and against the picker opening under
       an already-down finger */
    let armed = false, moved = false, sx = 0, sy = 0;
    item.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      armed = true; moved = false; sx = e.clientX; sy = e.clientY;
      pressFired = false;
      clearTimeout(pressTimer);
      if (num > 0) {
        pressTimer = setTimeout(() => {
          pressFired = true;
          state.favs[B.table][num] = { on: !isFav(B.table, num), t: Date.now() };
          saveState(); scheduleSync(); openPicker(bus); /* re-render, keep open */
          renderFocusFavs(); /* favoriting doesn't change fx, nothing else would refresh this */
        }, 420);
      }
    });
    item.addEventListener("pointermove", (e) => {
      if (armed && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
        moved = true; clearTimeout(pressTimer);
      }
    });
    item.addEventListener("pointerup", () => {
      clearTimeout(pressTimer);
      if (!armed) return;
      armed = false;
      if (pressFired || moved) return;
      fxChange(bus, num, "user");
      closePicker();
    });
    item.addEventListener("pointercancel", () => { clearTimeout(pressTimer); armed = false; });
    item.addEventListener("pointerleave", () => clearTimeout(pressTimer));
    return item;
  };

  /* the three bus types have different effect sets (Roland spec) */
  const NOTES = {
    bus12: "Effect set of BUS 1+2. BUS 3/4 and INPUT have their own sets (Roland spec) - e.g. Sync Delay, Isolator and Resonator only exist on BUS 3/4.",
    bus34: "Effect set of BUS 3+4 (Roland spec) - incl. Sync Delay, Isolator, Filter+Drive, Resonator and DJFX Looper.",
    input: "Effect set of the INPUT bus (Roland spec) - Auto Pitch, Vocoder, Harmony, Gt Amp Sim.",
  };
  body.appendChild(el("div", "pick-note", NOTES[B.table]));
  const grid0 = el("div", "pick-grid");
  grid0.appendChild(mkItem(0));
  body.appendChild(grid0);

  /* jump bar built up front so RECENT/FAVORITES get a shortcut too, same as
     the categories below - favorites in particular can end up far down a
     long list (e.g. bus34's 40 effects), so it needs the same one-tap
     jump the categories already get, not just a scroll */
  const oldJump = $("jumpbar");
  if (oldJump) oldJump.remove();
  const jump = el("div", ""); jump.id = "jumpbar";
  const addJumpBtn = (label, sec) => {
    const jb = el("button", "", label);
    jb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      sec.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    jump.appendChild(jb);
  };

  const addRow = (title, nums) => {
    if (!nums.length) return null;
    const cat = el("div", "pick-cat");
    cat.appendChild(el("h3", "", title));
    const g = el("div", "pick-grid");
    nums.forEach((n) => g.appendChild(mkItem(n)));
    cat.appendChild(g);
    body.appendChild(cat);
    return cat;
  };
  const recentSec = addRow("RECENT", state.recents[B.table].filter((n) => n < table.length));
  const favSec = addRow("FAVORITES", favList(B.table).filter((n) => n < table.length));
  if (recentSec) addJumpBtn("RE", recentSec);
  if (favSec) addJumpBtn("FA", favSec);

  const catSecs = {};
  CAT_ORDER.forEach((c) => { catSecs[c] = []; });
  for (let n = 1; n < table.length; n++) {
    const def = fxDefFor(B.table, n);
    const c = def ? def.c : "weird";
    (catSecs[c] || catSecs.weird).push(n);
  }
  CAT_ORDER.forEach((c) => {
    if (!catSecs[c].length) return;
    const sec = el("div", "pick-cat");
    sec.dataset.cat = c;
    sec.appendChild(el("h3", "", CAT_LABELS[c]));
    const g = el("div", "pick-grid");
    catSecs[c].forEach((n) => g.appendChild(mkItem(n)));
    sec.appendChild(g);
    body.appendChild(sec);
    addJumpBtn(CAT_LABELS[c].slice(0, 2), sec);
  });
  $("picker-panel").appendChild(jump); /* outside the scroller so it stays put */
  $("picker").classList.add("open");
}
function closePicker() { $("picker").classList.remove("open"); }

export { pickerBus, pressTimer, pressFired, openPicker, closePicker };
