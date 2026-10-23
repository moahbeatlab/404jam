import { el } from "../core/util.js";
import { L, BANKS, padLabel } from "./state.js";
import { btn, chips } from "./ui.js";

/* a sheet with the 160 pads: pick one (or several in a row). Resolves with the pad number, or -1. */
function choosePad(title, start, opts = {}) {
  return new Promise((resolve) => {
    const back = el("div", "lb-sheet-back");
    const box = el("div", "lb-sheet");
    box.appendChild(el("h3", "lb-h", title));
    let bank = Math.floor((start || 0) / 16);
    const grid = el("div", "lb-grid lb-grid-sm");
    const done = (n) => { back.remove(); resolve(n); };
    const bc = chips(BANKS.split(""), bank, (i) => { bank = i; paint(); }, "lb-banks");
    box.appendChild(bc.root);
    function paint() {
      grid.textContent = "";
      for (let k = 0; k < 16; k++) {
        const n = bank * 16 + k, p = L.info ? L.info.pads[n] : null;
        const t = el("button", "lb-pad" + (p && (p.has || p.file) ? " has" : "") + (n === (opts.mark ?? -1) ? " sel" : ""));
        t.appendChild(el("small", "", padLabel(n)));
        t.appendChild(el("span", "lb-pad-name", p && p.name ? p.name : ""));
        t.addEventListener("click", () => done(n));
        grid.appendChild(t);
      }
    }
    paint();
    box.appendChild(grid);
    if (opts.hint) box.appendChild(el("p", "lb-note", opts.hint));
    box.appendChild(btn("Cancel", "", () => done(-1)));
    back.appendChild(box);
    back.addEventListener("pointerdown", (e) => { if (e.target === back) done(-1); });
    document.getElementById("lab").appendChild(back);
  });
}
export { choosePad };
