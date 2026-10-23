import { el } from "../core/util.js";
import { call, json } from "./client.js";
import { bufferOf, play, stopAll } from "./audio.js";
import { L, BANKS, padLabel, say, changed, onChange, padMeta, dropPad } from "./state.js";
import { btn, row, note, chips, sheet, ask, secs } from "./ui.js";
import { choosePad } from "./padpick.js";
import { pickFiles, addAudio, download, bytesOf, extOf, stem } from "./project.js";

/* PADS: the 160 pads of the project, listen, replace, rename, move, tools */
const undoStack = [];
let current = null, moving = -1;
async function snapshot(n) {
  const p = L.info.pads[n];
  if (!p.file) return { pad: n, meta: null, name: p.name };
  return { pad: n, meta: await json("padSample", n), name: p.name };
}
function remember(s) {
  undoStack.push(s);
  while (undoStack.length > 10) { const o = undoStack.shift(); if (o.meta) call("free", o.meta.id).catch(() => {}); }
}
async function undo() {
  const s = undoStack.pop();
  if (!s) { say("Nothing to undo."); return; }
  try {
    const now = await snapshot(s.pad);
    if (s.meta) { await call("assign", s.pad, s.meta.id, s.name); await call("free", s.meta.id); }
    else await call("clearPad", s.pad);
    if (now.meta) await call("free", now.meta.id);
    await changed({ pads: [s.pad] });
    say("Undone: " + padLabel(s.pad));
  } catch (e) { say(String(e.message || e), "err"); }
}
async function putOnPad(n, id, name, keepFree) {
  remember(await snapshot(n));
  await call("assign", n, id, name);
  if (!keepFree) await call("free", id);
  await changed({ pads: [n] });
}
async function listen(n) {
  const p = L.info.pads[n];
  if (current) { current.stop(); current = null; }
  if (!p.file) return;
  try {
    const m = await padMeta(n);
    current = play(await bufferOf(m.id, m));
  } catch (e) { say(String(e.message || e), "err"); }
}

function build(host) {
  const root = el("div", "lb-scroll");
  host.appendChild(root);
  const bankRow = chips(BANKS.split(""), L.bank, (i) => { L.bank = i; if (Math.floor(L.pad / 16) !== i) { L.pad = i * 16; } paint(); }, "lb-banks");
  const grid = el("div", "lb-grid");
  const detail = el("div", "lb-detail");
  root.append(bankRow.root, grid, detail);

  function paint() {
    if (!L.info || !L.info.open) { grid.textContent = ""; detail.textContent = ""; detail.appendChild(note("Open or start a project first (PROJECT).")); return; }
    bankRow.set(L.bank);
    grid.textContent = "";
    for (let k = 0; k < 16; k++) {
      const n = L.bank * 16 + k, p = L.info.pads[n];
      const t = el("button", "lb-pad" + (p.has && p.file ? " has" : "") + (p.has !== p.file ? " odd" : "") + (n === L.pad ? " sel" : "") + (n === moving ? " moving" : ""));
      t.dataset.pad = n;
      t.appendChild(el("small", "", padLabel(n)));
      t.appendChild(el("span", "lb-pad-name", p.name || (p.file ? "?" : "")));
      t.appendChild(el("small", "lb-pad-len", p.file ? secs(p.frames) : ""));
      t.addEventListener("click", () => tap(n));
      grid.appendChild(t);
    }
    paintDetail();
  }
  async function tap(n) {
    if (moving >= 0) {
      const from = moving; moving = -1;
      if (from !== n) {
        try {
          remember(await snapshot(from)); remember(await snapshot(n));
          await call("movePad", from, n);
          L.pad = n;
          await changed({ pads: [from, n] });
          say(padLabel(from) + " moved to " + padLabel(n) + (L.info.pads[from].has ? " (the two swapped places)" : ""));
        } catch (e) { say(String(e.message || e), "err"); }
      }
      paint();
      return;
    }
    L.pad = n;
    paint();
    listen(n);
  }
  function paintDetail() {
    detail.textContent = "";
    const n = L.pad, p = L.info.pads[n];
    const title = el("div", "lb-pad-title");
    title.appendChild(el("b", "", padLabel(n) + "  " + (p.name || (p.file ? "(no name)" : "empty"))));
    if (p.file) title.appendChild(el("span", "lb-note", secs(p.frames) + " · " + (p.ch === 2 ? "stereo" : "mono") + " · 48 kHz"));
    detail.appendChild(title);
    if (p.has && !p.file) detail.appendChild(note("The pad says it has a sample but its file BANK" + (Math.floor(n / 16) + 1) + "-" + String(n % 16 + 1).padStart(2, "0") + ".SMP is missing from the project.", "err"));
    if (!p.has && p.file) detail.appendChild(note("There is a sample file but the pad does not point at it. Rename or reload it to fix that.", "err"));
    if (moving >= 0) { detail.appendChild(note("Tap the pad to move " + padLabel(moving) + " to (a pad with a sample swaps places).")); detail.appendChild(btn("Cancel move", "", () => { moving = -1; paint(); })); return; }
    const r1 = row("lb-wrap");
    if (p.file) {
      r1.appendChild(btn("▶ PLAY", "go", () => listen(n)));
      r1.appendChild(btn("■", "", () => { stopAll(); current = null; }));
    }
    r1.appendChild(btn("LOAD FILE…", "", async () => {
      const f = (await pickFiles({ accept: "audio/*,.wav,.aif,.aiff,.flac,.mp3,.smp" }))[0];
      if (!f) return;
      try {
        say("Loading " + f.name + "…");
        const m = await json("decode", await bytesOf(f), extOf(f.name));
        await putOnPad(n, m.id, p.name && p.file ? p.name : stem(f.name).slice(0, 23));
        say(f.name + " is on " + padLabel(n) + (m.resampled ? " (converted from " + m.srcRate + " Hz to 48 kHz)" : ""));
      } catch (e) { say(String(e.message || e), "err"); }
    }));
    detail.appendChild(r1);
    if (p.file) {
      const r2 = row("lb-wrap");
      r2.appendChild(btn("RENAME", "", async () => {
        const v = await ask("Name of " + padLabel(n) + " (23 characters)", p.name, 23);
        if (v === null) return;
        try { await call("renamePad", n, v); await changed({ pads: [] }); } catch (e) { say(String(e.message || e), "err"); }
      }));
      r2.appendChild(btn("SLICE…", "", async () => {
        const lab = await import("./lab.js"), st = await import("./state.js");
        await lab.show("slicer"); await st.views.slicer.open(n);
      }));
      r2.appendChild(btn("CHORDS / ARPS…", "", async () => {
        const lab = await import("./lab.js"), st = await import("./state.js");
        await lab.show("chords"); if (st.views.chords.use) await st.views.chords.use(n);
      }));
      detail.appendChild(r2);
      const r3 = row("lb-wrap");
      r3.appendChild(btn("TOOLS…", "", () => tools(n)));
      r3.appendChild(btn("MOVE…", "", () => { moving = n; paint(); }));
      r3.appendChild(btn("WAV", "", async () => {
        const m = await padMeta(n);
        download(await call("wav", m.id), (p.name || padLabel(n)).replace(/[^A-Za-z0-9 _-]/g, "") + ".wav", "audio/wav");
      }));
      r3.appendChild(btn("CLEAR", "warn", async () => {
        try { remember(await snapshot(n)); await call("clearPad", n); await changed({ pads: [n] }); say(padLabel(n) + " is empty now (UNDO brings it back)."); } catch (e) { say(String(e.message || e), "err"); }
      }));
      detail.appendChild(r3);
    }
    const r4 = row("lb-wrap");
    r4.appendChild(btn("UNDO" + (undoStack.length ? " (" + undoStack.length + ")" : ""), "", undo));
    r4.appendChild(btn("ADD FILES FROM HERE…", "", async () => addAudio(await pickFiles({ accept: "audio/*,.wav,.aif,.aiff,.flac,.mp3,.smp", multiple: true }), n)));
    detail.appendChild(r4);
    detail.appendChild(note("Tap a pad to select and hear it. On a computer you can also drop audio files on the pads."));
  }
  async function tools(n) {
    const p = L.info.pads[n];
    const items = [
      { t: "Pitch up 1 semitone", s: "like the chromatic mode: also shorter" }, { t: "Pitch down 1 semitone" },
      { t: "Pitch up an octave" }, { t: "Pitch down an octave" },
      { t: "Reverse" }, { t: "Normalize to -1 dB" },
      { t: "Stretch to whole bars", s: "at the project tempo (" + L.info.tempo + " BPM), pitch stays" },
    ];
    const i = await sheet("Tools for " + padLabel(n) + " " + p.name, items);
    if (i < 0) return;
    try {
      const m = await padMeta(n);
      let id;
      if (i < 4) id = await call("pitched", m.id, [1, -1, 12, -12][i]);
      else if (i === 4) id = await call("reversed", m.id);
      else if (i === 5) id = await call("normalize", m.id, -1);
      else {
        const r = await json("stretchToBars", m.id, L.info.tempo);
        id = r.meta.id;
        say("Stretched to " + r.bars + " bars (x" + r.ratio.toFixed(3) + ")");
      }
      await putOnPad(n, id, p.name);
    } catch (e) { say(String(e.message || e), "err"); }
  }
  /* drop files on the grid (desktop) */
  grid.addEventListener("dragover", (e) => { e.preventDefault(); });
  grid.addEventListener("drop", async (e) => {
    e.preventDefault();
    const t = e.target.closest(".lb-pad");
    await addAudio([...e.dataTransfer.files], t ? +t.dataset.pad : L.pad);
  });
  onChange((what) => { if (L.view === "pads") paint(); });
  return { root, show() { if (Math.floor(L.pad / 16) !== L.bank) L.bank = Math.floor(L.pad / 16); paint(); }, listen, putOnPad, snapshot, remember };
}
export { build, putOnPad };
