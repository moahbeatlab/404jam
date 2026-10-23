import { el } from "../core/util.js";

/* small building blocks of the Lab's screens */
const btn = (label, cls, fn) => {
  const b = el("button", "lb-btn" + (cls ? " " + cls : ""), label);
  if (fn) b.addEventListener("click", fn);
  return b;
};
const row = (cls, ...kids) => {
  const r = el("div", "lb-row" + (cls ? " " + cls : ""));
  kids.flat().filter(Boolean).forEach((k) => r.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
  return r;
};
const note = (text, cls) => el("p", "lb-note" + (cls ? " " + cls : ""), text);
const head = (text) => el("h3", "lb-h", text);
/* a row of single-choice chips: items are strings or {t, s}; returns {root, set(i)} */
function chips(items, sel, pick, cls) {
  const root = el("div", "lb-chips" + (cls ? " " + cls : ""));
  const bs = items.map((it, i) => {
    const b = el("button", "lb-chip", typeof it === "string" ? it : it.t);
    if (typeof it !== "string" && it.s) b.title = it.s;
    b.addEventListener("click", () => { set(i); pick(i); });
    root.appendChild(b);
    return b;
  });
  const set = (i) => bs.forEach((b, j) => b.classList.toggle("on", j === i));
  set(sel);
  return { root, set, buttons: bs };
}
/* a labelled slider; fmt shows the value; onInput fires while dragging, onChange on release */
function slider(label, min, max, step, value, fmt, onInput, onChange) {
  const root = el("label", "lb-slider");
  const name = el("span", "lb-sl-name", label);
  const val = el("b", "lb-sl-val", fmt(value));
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  inp.addEventListener("input", () => { val.textContent = fmt(+inp.value); if (onInput) onInput(+inp.value); });
  inp.addEventListener("change", () => { if (onChange) onChange(+inp.value); });
  root.append(name, inp, val);
  return { root, set(v) { inp.value = v; val.textContent = fmt(v); }, input: inp };
}
/* a +/- stepper: [-] value [+]; step returns the new value or undefined */
function stepper(label, get, fmt, change) {
  const root = el("div", "lb-stepper");
  const v = el("b", "lb-st-val");
  const show = () => { v.textContent = fmt(get()); };
  const mk = (t, d) => { const b = el("button", "lb-st-btn", t); b.addEventListener("click", () => { change(d); show(); }); return b; };
  root.append(el("span", "lb-sl-name", label), mk("−", -1), v, mk("+", 1));
  show();
  return { root, show };
}
/* a bottom sheet to choose from a list; resolves with the index or -1 */
function sheet(title, items, selected) {
  return new Promise((resolve) => {
    const back = el("div", "lb-sheet-back");
    const box = el("div", "lb-sheet");
    box.appendChild(el("h3", "lb-h", title));
    const list = el("div", "lb-sheet-list");
    const done = (i) => { back.remove(); resolve(i); };
    items.forEach((it, i) => {
      const b = el("button", "lb-sheet-item" + (i === selected ? " on" : ""));
      b.appendChild(el("span", "", typeof it === "string" ? it : it.t));
      if (typeof it !== "string" && it.s) b.appendChild(el("small", "", it.s));
      b.addEventListener("click", () => done(i));
      list.appendChild(b);
    });
    box.appendChild(list);
    box.appendChild(btn("Cancel", "", () => done(-1)));
    back.appendChild(box);
    back.addEventListener("pointerdown", (e) => { if (e.target === back) done(-1); });
    document.body.appendChild(back);
  });
}
/* ask for a line of text */
function ask(title, value, maxLength) {
  return new Promise((resolve) => {
    const back = el("div", "lb-sheet-back");
    const box = el("div", "lb-sheet");
    box.appendChild(el("h3", "lb-h", title));
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = value || ""; inp.maxLength = maxLength || 40; inp.className = "lb-text";
    inp.autocomplete = "off"; inp.spellcheck = false;
    const done = (v) => { back.remove(); resolve(v); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(inp.value); });
    box.appendChild(inp);
    box.appendChild(row("", btn("Cancel", "", () => done(null)), btn("OK", "go", () => done(inp.value))));
    back.appendChild(box);
    back.addEventListener("pointerdown", (e) => { if (e.target === back) done(null); });
    document.body.appendChild(back);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}
const secs = (frames) => (frames / 48000).toFixed(frames < 48000 * 10 ? 2 : 1) + " s";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export { btn, row, note, head, chips, slider, stepper, sheet, ask, secs, esc };
