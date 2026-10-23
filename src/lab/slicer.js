import { el } from "../core/util.js";
import { call, json } from "./client.js";
import { bufferOf, play, stopAll, now, forget, RATE } from "./audio.js";
import { L, say, changed, padMeta, padLabel, freePads } from "./state.js";
import { btn, row, note, head, chips, slider, stepper, sheet, secs } from "./ui.js";
import { choosePad } from "./padpick.js";
import { putOnPad } from "./pads.js";
import { pickFiles, bytesOf, extOf, stem } from "./project.js";

/* SLICE: cut a sample, give each slice its own sound, set the order and the feel, hear it, bounce it onto pads */
const S = {
  src: null, /* {id, meta, name, pad, parts: [{name, from}]} */
  sl: null, /* the slicing, as the engine has it */
  sel: 0, marked: new Set(), cursor: 0,
  hist: [], fut: [],
  view: { from: 0, to: 1 },
  tie: true, snap: false, lane: 0,
  rounds: 1, takes: 1, sens: 0.5,
  playing: false, token: 0, cur: null, next: null,
};
let C = null; /* DOM */
let consts = null;
const hue = (i) => (i * 47) % 360;
const frames = () => (S.src ? S.src.meta.frames : 0);
const dump = () => JSON.stringify(S.sl);

async function sliceOp(op, args) {
  S.sl = await json("slicing", op, op === "new" ? "" : dump(), JSON.stringify(args || {}));
  return S.sl;
}
function push() { S.hist.push(dump()); if (S.hist.length > 100) S.hist.shift(); S.fut = []; }
async function mutate(fn) { /* fn changes S.sl in place */
  if (!S.src || !S.sl) return;
  push(); fn(S.sl); stopPlay(); paint();
}
async function mutateOp(op, args) {
  if (!S.src || !S.sl) return false;
  push();
  try { await sliceOp(op, args); } catch (e) { S.hist.pop(); say(String(e.message || e), "err"); return false; }
  S.sel = Math.min(S.sel, S.sl.slices.length - 1); S.marked.clear(); S.lane = 0;
  stopPlay(); paint();
  return true;
}
function undo() { if (!S.hist.length) return; S.fut.push(dump()); S.sl = JSON.parse(S.hist.pop()); S.sel = Math.min(S.sel, S.sl.slices.length - 1); stopPlay(); paint(); }
function redo() { if (!S.fut.length) return; S.hist.push(dump()); S.sl = JSON.parse(S.fut.pop()); stopPlay(); paint(); }

/* ---- the source ---- */
async function setSource(src) {
  stopPlay();
  if (S.src && S.src.own) forget(S.src.id);
  S.src = src;
  S.hist = []; S.fut = []; S.sel = 0; S.marked.clear(); S.cursor = 0; S.lane = 0;
  S.view = { from: 0, to: src.meta.frames };
  await sliceOp("new", { frames: src.meta.frames, n: 8 });
  S.sl.bpm = S.sl.bpm || 0;
  if (L.info) { S.sl.bpm = L.info.tempo; }
  paint(); /* shows the screen, so that the canvas has a size */
  await drawWave();
  paint();
}
async function fromPad(n) {
  const p = L.info.pads[n];
  if (!p.file) { say("Pad " + padLabel(n) + " has no sample.", "err"); return; }
  /* its own copy: the pad's handle is freed when the pad changes */
  const meta = await json("padSample", n);
  await setSource({ id: meta.id, meta, name: p.name || padLabel(n), pad: n, own: true, parts: [{ name: p.name, from: 0 }] });
}
async function fromFile() {
  const f = (await pickFiles({ accept: "audio/*,.wav,.aif,.aiff,.flac,.mp3,.smp" }))[0];
  if (!f) return;
  try {
    say("Loading " + f.name + "…");
    const meta = await json("decode", await bytesOf(f), extOf(f.name));
    await setSource({ id: meta.id, meta, name: stem(f.name).slice(0, 23), pad: -1, own: true, parts: [{ name: stem(f.name), from: 0 }] });
  } catch (e) { say(String(e.message || e), "err"); }
}
async function addSample() {
  if (!S.src) return;
  if (S.src.parts.length >= 8) { say("Up to 8 samples can be put together.", "err"); return; }
  const n = await choosePad("Add which pad's sample after this one?", L.pad, { hint: "The samples are joined one after the other; each part is cut on its own." });
  if (n < 0) return;
  const p = L.info.pads[n];
  if (!p.file) { say("Pad " + padLabel(n) + " has no sample.", "err"); return; }
  try {
    const add = await json("padSample", n);
    const id = await call("join", JSON.stringify([S.src.id, add.id]));
    const meta = await json("meta", id);
    const from = S.src.meta.frames;
    await call("free", add.id);
    if (S.src.own) forget(S.src.id);
    S.src = { id, meta, name: S.src.name, pad: -1, own: true, parts: [...S.src.parts, { name: p.name, from }] };
    S.view = { from: 0, to: meta.frames };
    S.hist = []; S.fut = [];
    await sliceOp("new", { frames: meta.frames, n: 8 });
    await mutateOp("divide", { n: 8 * S.src.parts.length, starts: starts() });
    await drawWave();
    paint();
  } catch (e) { say(String(e.message || e), "err"); }
}
const starts = () => (S.src ? S.src.parts.slice(1).map((p) => p.from) : []);

/* ---- the waveform ---- */
let peaks = null, bg = null;
async function drawWave() {
  if (!S.src || !C) return;
  const cv = C.wave, dpr = window.devicePixelRatio || 1;
  const w = Math.max(Math.floor(cv.clientWidth * dpr), 50), h = Math.max(Math.floor(cv.clientHeight * dpr), 60);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const cols = Math.floor(w / 2);
  peaks = await call("peaks", S.src.id, Math.floor(S.view.from), Math.ceil(S.view.to), cols);
  bg = document.createElement("canvas"); bg.width = w; bg.height = h;
  const g = bg.getContext("2d");
  const cs = getComputedStyle(document.documentElement);
  g.fillStyle = cs.getPropertyValue("--tile-empty") || "#1d1d20"; g.fillRect(0, 0, w, h);
  g.fillStyle = cs.getPropertyValue("--muted") || "#999";
  for (let c = 0; c < peaks.length; c++) {
    const a = Math.max(2, (peaks[c] / 32768) * (h / 2 - 2));
    g.fillRect(c * 2, h / 2 - a, 1.6, a * 2);
  }
  overlay();
}
const xOf = (f) => ((f - S.view.from) / (S.view.to - S.view.from)) * C.wave.width;
const fOf = (x) => S.view.from + (x / C.wave.width) * (S.view.to - S.view.from);
function overlay(playFrame) {
  if (!C || !bg || !bg.width || !bg.height || !C.wave.width) return;
  const cv = C.wave, g = cv.getContext("2d"), w = cv.width, h = cv.height, dpr = window.devicePixelRatio || 1;
  g.drawImage(bg, 0, 0);
  S.sl.slices.forEach((s, i) => {
    const x0 = xOf(s.start), x1 = xOf(s.end);
    if (x1 < 0 || x0 > w) return;
    g.fillStyle = "hsla(" + hue(i) + ",70%," + (i === S.sel ? "55%" : "50%") + "," + (i === S.sel ? 0.34 : s.chance === 0 ? 0.04 : 0.14) + ")";
    g.fillRect(x0, 0, x1 - x0, h);
    g.fillStyle = "hsl(" + hue(i) + ",70%,60%)";
    g.fillRect(x0, 0, 2 * dpr, h);
    if (x1 - x0 > 14 * dpr) { g.font = "bold " + 11 * dpr + "px system-ui"; g.fillText(String(i + 1), x0 + 5 * dpr, 13 * dpr); }
    if (S.marked.has(i)) { g.fillStyle = "#ffb000"; g.fillRect(x0, h - 5 * dpr, x1 - x0, 5 * dpr); }
  });
  const sel = S.sl.slices[S.sel];
  if (sel) {
    g.fillStyle = "#ffb000";
    const x0 = xOf(sel.start), x1 = xOf(sel.end), gw = 10 * dpr;
    g.fillRect(x0 - 1, 0, 3 * dpr, h); g.fillRect(x1 - 2 * dpr, 0, 3 * dpr, h);
    g.fillRect(x0 - 1, h / 2 - 16 * dpr, gw, 32 * dpr); g.fillRect(x1 - gw + 1, h / 2 - 16 * dpr, gw, 32 * dpr);
  }
  g.fillStyle = "#fff";
  const cx = xOf(S.cursor);
  g.fillRect(cx, 0, 1 * dpr, h);
  if (playFrame !== undefined && playFrame >= 0) { g.fillStyle = "#3ddc84"; g.fillRect(xOf(playFrame) - dpr, 0, 3 * dpr, h); }
}
function bindWave() {
  const cv = C.wave;
  let drag = null;
  const px = (e) => (e.clientX - cv.getBoundingClientRect().left) * (cv.width / cv.getBoundingClientRect().width);
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    const x = px(e), dpr = window.devicePixelRatio || 1, sel = S.sl.slices[S.sel], grab = 22 * dpr;
    drag = { x, moved: false, mode: null, long: null };
    if (sel) {
      const dl = Math.abs(x - xOf(sel.start)), dr = Math.abs(x - xOf(sel.end));
      if (Math.min(dl, dr) < grab) { drag.mode = dl <= dr ? "start" : "end"; push(); drag.pushed = true; }
    }
    if (!drag.mode) drag.long = setTimeout(async () => { drag.long = null; drag.cut = true; S.cursor = Math.round(fOf(x)); await cutAtCursor(); }, 650);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const x = px(e);
    if (Math.abs(x - drag.x) > 6) { drag.moved = true; if (drag.long) { clearTimeout(drag.long); drag.long = null; } }
    if (!drag.mode) return;
    const f = Math.min(Math.max(Math.round(fOf(x)), 0), frames());
    const s = S.sl.slices[S.sel], MIN = 64;
    if (drag.mode === "start") {
      const nf = Math.min(f, s.end - MIN);
      if (S.tie) { const p = S.sl.slices.find((q, i) => i !== S.sel && q.end === s.start); if (p && nf > p.start + MIN) p.end = nf; }
      s.start = nf;
    } else {
      const nf = Math.max(f, s.start + MIN);
      if (S.tie) { const p = S.sl.slices.find((q, i) => i !== S.sel && q.start === s.end); if (p && nf < p.end - MIN) p.start = nf; }
      s.end = nf;
    }
    overlay();
  });
  const end = async (e) => {
    if (!drag) return;
    if (drag.long) clearTimeout(drag.long);
    const d = drag; drag = null;
    if (d.mode) {
      if (S.snap) { const s = S.sl.slices[S.sel]; const k = d.mode; s[k] = await call("zeroCrossing", S.src.id, s[k], 400); }
      stopPlay(); paint();
    } else if (!d.moved && !d.cut) {
      const f = Math.round(fOf(d.x));
      S.cursor = f;
      const hit = S.sl.slices.map((s, i) => [s, i]).filter(([s]) => f >= s.start && f < s.end);
      if (hit.length) S.sel = hit.sort((a, b) => (a[0].end - a[0].start) - (b[0].end - b[0].start))[0][1];
      paint();
    }
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", () => { if (drag && drag.long) clearTimeout(drag.long); drag = null; });
}
async function cutAtCursor() {
  const i = S.sl.slices.findIndex((s) => S.cursor > s.start && S.cursor < s.end);
  if (i < 0) { say("Tap inside a slice to put the cursor there, then cut.", "err"); return; }
  if (await mutateOp("split", { i, frame: S.cursor })) { S.sel = i + 1; paint(); }
}

/* ---- playing ---- */
function stopPlay() {
  S.playing = false; S.token++;
  if (S.cur) { S.cur.h.stop(); S.cur = null; }
  if (S.next) { S.next.h && S.next.h.stop(); S.next = null; }
  if (C) { C.play.textContent = "▶ PLAY"; C.play.classList.remove("on"); overlay(); }
}
async function renderRound(round) {
  const r = await json("render", S.src.id, dump(), S.rounds, round);
  const buf = await bufferOf(r.id, r);
  return { r, buf };
}
async function startPlay() {
  if (!S.src) return;
  stopPlay();
  S.playing = true; const token = ++S.token;
  C.play.textContent = "■ STOP"; C.play.classList.add("on");
  try {
    let round = 0;
    let a = await renderRound(round);
    if (token !== S.token) return;
    let when = now() + 0.05;
    const loop = async () => {
      const dur = a.buf.duration;
      const h = play(a.buf, { when });
      S.cur = { h, r: a.r, start: when, dur };
      /* the next round is made while this one sounds, and starts exactly where it ends */
      const nextWhen = when + dur;
      const nextP = renderRound(round + 1);
      round++;
      const b = await nextP;
      if (token !== S.token) { forget(b.r.id); return; }
      forget(a.r.id);
      a = b; when = nextWhen;
      const wait = Math.max((when - now() - 0.15) * 1000, 0);
      setTimeout(() => { if (token === S.token) loop(); else forget(b.r.id); }, wait);
    };
    loop();
    tick(token);
  } catch (e) { stopPlay(); say(String(e.message || e), "err"); }
}
function tick(token) {
  if (token !== S.token) return;
  const c = S.cur;
  if (c) {
    const t = now() - c.start;
    if (t >= 0 && t < c.dur + 0.05) {
      const fr = t * RATE;
      const p = c.r.placed.find((q) => fr >= q.at && fr < q.at + q.frames);
      if (p && !p.rest) {
        const s = S.sl.slices[p.slice];
        overlay(s.start + Math.min(Math.max(fr - p.at - p.lead, 0), p.audio) * (p.len ? Math.min((s.end - s.start) / p.len, 1) : 1));
      } else overlay();
    }
  }
  requestAnimationFrame(() => tick(token));
}
async function hearSlice(i) {
  try {
    const m = await json("sliceAudio", S.src.id, dump(), i);
    const buf = await bufferOf(m.id, m);
    play(buf);
    setTimeout(() => forget(m.id), Math.ceil(buf.duration * 1000) + 500);
  } catch (e) { say(String(e.message || e), "err"); }
}

/* ---- bounce ---- */
const slcName = (suffix) => (S.src.name || "slice").slice(0, 12).trim() + " " + suffix;
async function bounceToPad() {
  if (!L.info.open) { say("Open or start a project first.", "err"); return; }
  const first = await choosePad(S.takes > 1 ? "First pad for " + S.takes + " takes" : "Put the result on which pad?", L.pad);
  if (first < 0) return;
  const pads = S.takes > 1 ? freePads(first, S.takes) : [first];
  if (pads.length < S.takes) { say("Only " + pads.length + " free pads from " + padLabel(first) + " on.", "err"); if (!pads.length) return; }
  try {
    const touched = [];
    for (let k = 0; k < pads.length; k++) {
      say("Rendering " + (k + 1) + "/" + pads.length + "…");
      const r = await json("render", S.src.id, dump(), S.rounds, 1000 + k * 7919 + S.takes);
      await putOnPad(pads[k], r.id, S.takes > 1 ? slcName("slc" + (k + 1)) : slcName("slc"));
      touched.push(pads[k]);
    }
    say("Done: " + touched.map(padLabel).join(", "));
  } catch (e) { say(String(e.message || e), "err"); }
}
async function bounceMarked() {
  const ids = S.marked.size ? [...S.marked].sort((a, b) => a - b) : [S.sel];
  const first = await choosePad("First pad for " + ids.length + (ids.length === 1 ? " slice" : " slices") + " (each on its own pad)", L.pad);
  if (first < 0) return;
  const pads = freePads(first, ids.length);
  if (pads.length < ids.length) { say("Only " + pads.length + " free pads from " + padLabel(first) + " on.", "err"); if (!pads.length) return; }
  try {
    for (let k = 0; k < pads.length; k++) {
      const m = await json("sliceAudio", S.src.id, dump(), ids[k]);
      await putOnPad(pads[k], m.id, slcName(String(ids[k] + 1)));
    }
    say("Slices " + ids.slice(0, pads.length).map((i) => i + 1).join(", ") + " are on " + pads.map(padLabel).join(", "));
  } catch (e) { say(String(e.message || e), "err"); }
}
async function bounceStretch() {
  const bpm = S.sl.division > 0 && S.sl.bpm > 0 ? S.sl.bpm : L.info.tempo;
  const n = await choosePad("Stretch the whole sample to whole bars at " + bpm + " BPM onto which pad?", L.pad);
  if (n < 0) return;
  try {
    const r = await json("stretchToBars", S.src.id, bpm);
    await putOnPad(n, r.meta.id, slcName("st"));
    say("Stretched to " + r.bars + " bars (x" + r.ratio.toFixed(3) + ") on " + padLabel(n));
  } catch (e) { say(String(e.message || e), "err"); }
}

/* ---- the screen ---- */
function sound(fn) { /* change the sound of the marked slices, or the selected one */
  const ids = S.marked.size ? [...S.marked] : [S.sel];
  mutate((sl) => ids.forEach((i) => fn(sl.slices[i], sl)));
}
let panelEls = {};
function paint() {
  if (!C) return;
  if (!S.src) { C.main.style.display = "none"; C.empty.style.display = ""; return; }
  C.main.style.display = ""; C.empty.style.display = "none";
  const sl = S.sl, s = sl.slices[S.sel] || sl.slices[0];
  C.info.textContent = S.src.name + " · " + secs(frames()) + " · " + sl.slices.length + " slices" + (S.src.parts.length > 1 ? " · " + S.src.parts.length + " samples" : "");
  C.undo.disabled = !S.hist.length; C.redo.disabled = !S.fut.length;
  C.tie.classList.toggle("on", S.tie); C.snap.classList.toggle("on", S.snap);
  overlay();
  /* the selected slice */
  const marks = S.marked.size ? " (" + S.marked.size + " marked: changes go to all)" : "";
  C.selTitle.textContent = "SLICE " + (S.sel + 1) + " of " + sl.slices.length + " · " + secs(s.end - s.start) + marks;
  panelEls.chance.set(s.chance); panelEls.gain.set(s.gain); panelEls.pitch.set(s.pitch);
  panelEls.rev.classList.toggle("on", !!s.reverse);
  panelEls.mute.classList.toggle("on", s.chance === 0);
  panelEls.roll.set(Math.max(consts.rolls.indexOf(s.roll || 0), 0));
  panelEls.rollLoud.set(s.roll_loud || 0); panelEls.rollPitch.set(s.roll_pitch || 0);
  panelEls.att.show(); panelEls.rel.show();
  panelEls.mark.classList.toggle("on", S.marked.has(S.sel));
  /* feel */
  panelEls.div.set(Math.max(consts.divisions.indexOf(sl.division || 0), 0));
  panelEls.swing.set(Math.max(consts.swings.indexOf(sl.swing || 0), 0));
  panelEls.human.set(Math.max(consts.humanizes.indexOf(sl.humanize || 0), 0));
  panelEls.mode.set(sl.mode || 0);
  panelEls.bpm.show(); panelEls.seed.textContent = "seed " + (sl.seed || 0);
  const grid = sl.division > 0 && sl.bpm > 0;
  panelEls.gridNote.textContent = grid
    ? "Steps on a 1/" + sl.division + " grid at " + sl.bpm + " BPM. The sample is " + (frames() / (60 / sl.bpm * RATE * 4)).toFixed(2) + " bars of 4/4 at this tempo (a whole number means the tempo fits)."
    : "Grid off: slices play at their own length, one after the other.";
  /* the order lane */
  C.lane.textContent = "";
  sl.order.forEach((si, k) => {
    const b = el("button", "lb-step" + (k === S.lane ? " on" : ""), String(si + 1));
    b.style.borderColor = "hsl(" + hue(si) + ",70%,55%)";
    b.addEventListener("click", () => { S.lane = k; S.sel = si; paint(); });
    C.lane.appendChild(b);
  });
  C.bounceInfo.textContent = S.rounds + " round" + (S.rounds > 1 ? "s" : "") + " × " + S.takes + " take" + (S.takes > 1 ? "s" : "");
}
function build(host) {
  consts = null;
  const root = el("div", "lb-scroll");
  host.appendChild(root);
  C = {};
  C.empty = el("div", "");
  C.empty.append(head("Slice a sample"), note("Cut a sample into slices, give each its own sound, set their order and feel, hear it, and put the result on pads."),
    row("lb-col", btn("SLICE THE SELECTED PAD", "go", () => { if (L.info && L.info.open) fromPad(L.pad); else say("Open or start a project first.", "err"); }), btn("SLICE AN AUDIO FILE…", "", fromFile)));
  C.main = el("div", "");
  root.append(C.empty, C.main);
  /* top: source line, waveform, transport (stays in view) */
  const top = el("div", "lb-sticky");
  C.info = el("div", "lb-note lb-ellipsis");
  C.wave = el("canvas", "lb-wave");
  const zoomRow = row("lb-wrap lb-tight");
  const zoom = (f) => {
    const c = Math.min(Math.max(S.cursor, S.view.from), S.view.to), span = (S.view.to - S.view.from) * f;
    const lo = Math.max(0, Math.min(c - span / 2, frames() - span)), hi = Math.min(frames(), lo + span);
    S.view = { from: Math.max(0, lo), to: Math.max(hi, lo + 256) };
    drawWave();
  };
  C.play = btn("▶ PLAY", "go", () => (S.playing ? stopPlay() : startPlay()));
  C.undo = btn("UNDO", "", undo); C.redo = btn("REDO", "", redo);
  zoomRow.append(C.play, btn("HEAR", "", () => hearSlice(S.sel)), btn("−", "", () => zoom(2)), btn("+", "", () => zoom(0.5)), btn("FIT", "", () => { S.view = { from: 0, to: frames() }; drawWave(); }), C.undo, C.redo);
  C.pan = document.createElement("input"); C.pan.type = "range"; C.pan.min = 0; C.pan.max = 1000; C.pan.value = 0; C.pan.className = "lb-pan";
  C.pan.addEventListener("input", () => {
    const span = S.view.to - S.view.from, lo = (frames() - span) * (C.pan.value / 1000);
    S.view = { from: lo, to: lo + span }; drawWave();
  });
  top.append(C.info, C.wave, C.pan, zoomRow);
  C.main.appendChild(top);
  bindWave();
  /* cutting */
  const cut = el("div", "lb-sec");
  cut.appendChild(head("Cut"));
  const eq = row("lb-wrap");
  [2, 4, 8, 16, 32, 64].forEach((n) => eq.appendChild(btn("÷" + n, "", () => mutateOp("divide", { n, starts: starts() }))));
  cut.append(el("div", "lb-note", "Equal slices"), eq);
  const rnd = row("lb-wrap");
  [4, 8, 16, 32].forEach((n) => rnd.appendChild(btn("?" + n, "", () => mutateOp("random", { n, seed: (Math.random() * 1e6) | 0, starts: starts() }))));
  cut.append(el("div", "lb-note", "At random places"), rnd);
  const sens = slider("Sensitivity", 0, 100, 5, S.sens * 100, (v) => v + "%", null, (v) => { S.sens = v / 100; });
  cut.append(el("div", "lb-note", "At the onsets (where sounds start)"), sens.root,
    row("lb-wrap", btn("FIND ONSETS", "", async () => { if (await mutateOp("onsets", { id: S.src.id, limit: 64, sens: S.sens })) say(S.sl.slices.length + " slices at the onsets."); })));
  const gridRow = row("lb-wrap",
    btn("CUT ON THE GRID", "", async () => {
      if (!(S.sl.division > 0)) S.sl.division = 16;
      const step = 60 / S.sl.bpm * RATE * 4 / S.sl.division;
      await mutateOp("grid", { step, anchor: -1, starts: starts() });
    }),
    btn("…WITH A LINE AT THE CURSOR", "", async () => {
      if (!(S.sl.division > 0)) S.sl.division = 16;
      const step = 60 / S.sl.bpm * RATE * 4 / S.sl.division;
      await mutateOp("grid", { step, anchor: S.cursor, starts: starts() });
    }),
    btn("FIT TEMPO", "", () => {
      const secs_ = frames() / RATE; let best = 0, bd = 1e9;
      [1, 2, 4, 8, 16].forEach((b) => { const t = b * 4 * 60 / secs_; if (t >= 70 && t <= 180 && Math.abs(t - S.sl.bpm) < bd) { bd = Math.abs(t - S.sl.bpm); best = t; } });
      if (!best) { say("No whole number of bars gives a tempo between 70 and 180.", "err"); return; }
      mutate((sl) => { sl.bpm = Math.round(best * 100) / 100; });
    }));
  cut.append(el("div", "lb-note", "On the tempo grid"), gridRow);
  const hand = row("lb-wrap", btn("CUT AT CURSOR", "", cutAtCursor),
    btn("DELETE SLICE", "warn", () => mutateOp("remove", { i: S.sel })),
    C.tie = btn("TIE EDGES", "", () => { S.tie = !S.tie; paint(); }),
    C.snap = btn("SNAP TO ZERO", "", () => { S.snap = !S.snap; paint(); }));
  cut.append(el("div", "lb-note", "By hand: tap the waveform to put the cursor and select a slice; drag the amber grips to move its edges; hold to cut there."), hand);
  C.main.appendChild(cut);
  /* the selected slice */
  const snd = el("div", "lb-sec");
  C.selTitle = head("SLICE");
  snd.appendChild(C.selTitle);
  panelEls.chance = slider("Chance", 0, 100, 5, 100, (v) => v + "%", null, (v) => sound((x) => { x.chance = v; }));
  panelEls.gain = slider("Gain", 0, 200, 5, 100, (v) => v + "%", null, (v) => sound((x) => { x.gain = v; }));
  panelEls.pitch = slider("Pitch", -12, 12, 1, 0, (v) => (v > 0 ? "+" : "") + v + " st", null, (v) => sound((x) => { x.pitch = v; }));
  const stepEnv = (key) => (d) => sound((x) => {
    const steps = consts.envSteps, cur = x[key] || 0;
    let i = steps.indexOf(cur); if (i < 0) i = steps.findIndex((v) => v >= cur);
    x[key] = steps[Math.min(Math.max(i + d, 0), steps.length - 1)];
  });
  panelEls.att = stepper("Attack", () => (S.sl ? S.sl.slices[S.sel].attack || 0 : 0), (v) => v + " ms", stepEnv("attack"));
  panelEls.rel = stepper("Release", () => (S.sl ? S.sl.slices[S.sel].release || 0 : 0), (v) => v + " ms", stepEnv("release"));
  panelEls.rev = btn("REVERSE", "", () => sound((x) => { x.reverse = !x.reverse; }));
  panelEls.mute = btn("MUTE", "", () => sound((x) => { if (x.chance === 0) x.chance = 100; else x.chance = 0; }));
  panelEls.mark = btn("MARK", "", () => { if (S.marked.has(S.sel)) S.marked.delete(S.sel); else S.marked.add(S.sel); paint(); });
  panelEls.roll = chips(["no roll", "×2", "×3", "×4", "×6", "×8"], 0, (i) => sound((x) => { x.roll = consts.rolls[i]; }));
  panelEls.rollLoud = slider("Roll loudness", -100, 100, 25, 0, (v) => (v > 0 ? "+" : "") + v + "%", null, (v) => sound((x) => { x.roll_loud = v; }));
  panelEls.rollPitch = slider("Roll pitch", -12, 12, 1, 0, (v) => (v > 0 ? "+" : "") + v + " st", null, (v) => sound((x) => { x.roll_pitch = v; }));
  snd.append(row("lb-wrap", panelEls.rev, panelEls.mute, panelEls.mark,
    btn("MARK ALL", "", () => { S.marked = new Set(S.sl.slices.map((_, i) => i)); paint(); }),
    btn("MARK NONE", "", () => { S.marked.clear(); paint(); }),
    btn("PLAIN", "", () => sound((x) => { Object.assign(x, { chance: 100, gain: 100, pitch: 0, reverse: false, roll: 0, roll_loud: 0, roll_pitch: 0, attack: 0, release: 0 }); }))),
    panelEls.chance.root, panelEls.gain.root, panelEls.pitch.root, panelEls.att.root, panelEls.rel.root,
    el("div", "lb-note", "Roll: the start of the slice repeats, like a drum roll"), panelEls.roll.root, panelEls.rollLoud.root, panelEls.rollPitch.root);
  C.main.appendChild(snd);
  /* order and feel */
  const feel = el("div", "lb-sec");
  feel.appendChild(head("Order and feel"));
  panelEls.mode = chips(["order", "random", "no repeat", "shuffle"], 0, (i) => mutate((sl) => { sl.mode = i; }));
  feel.append(el("div", "lb-note", "How the slices are picked: order = the lane below, random = by chance as weight, no repeat = never the same twice, shuffle = each once per round."), panelEls.mode.root);
  C.lane = el("div", "lb-lane");
  const laneBtns = row("lb-wrap lb-tight",
    btn("◀", "", () => { const o = S.sl.order, k = S.lane; if (k > 0) mutate((sl) => { [sl.order[k - 1], sl.order[k]] = [sl.order[k], sl.order[k - 1]]; S.lane = k - 1; }); }),
    btn("▶", "", () => { const k = S.lane; if (k < S.sl.order.length - 1) mutate((sl) => { [sl.order[k + 1], sl.order[k]] = [sl.order[k], sl.order[k + 1]]; S.lane = k + 1; }); }),
    btn("SLICE −", "", () => mutate((sl) => { sl.order[S.lane] = (sl.order[S.lane] + sl.slices.length - 1) % sl.slices.length; S.sel = sl.order[S.lane]; })),
    btn("SLICE +", "", () => mutate((sl) => { sl.order[S.lane] = (sl.order[S.lane] + 1) % sl.slices.length; S.sel = sl.order[S.lane]; })),
    btn("REPEAT", "", () => mutate((sl) => { sl.order.splice(S.lane + 1, 0, sl.order[S.lane]); S.lane++; })),
    btn("DROP", "warn", () => { if (S.sl.order.length > 1) mutate((sl) => { sl.order.splice(S.lane, 1); S.lane = Math.min(S.lane, sl.order.length - 1); }); }),
    btn("SHUFFLE", "", async () => { push(); S.sl = JSON.parse(await call("shuffleOrder", dump(), (Math.random() * 1e6) | 0)); stopPlay(); paint(); }),
    btn("RESET", "", () => mutateOp("reset")));
  feel.append(el("div", "lb-note", "Order of the slices (tap a step; the editing buttons act on it)"), C.lane, laneBtns);
  panelEls.div = chips(["off", "1/2", "1/4", "1/8", "1/16"], 0, (i) => mutate((sl) => { sl.division = consts.divisions[i]; if (sl.division && !(sl.bpm > 0)) sl.bpm = L.info.tempo; }));
  panelEls.bpm = stepper("Tempo", () => (S.sl && S.sl.bpm) || 0, (v) => v + " BPM", (d) => mutate((sl) => { sl.bpm = Math.min(Math.max(Math.round((sl.bpm || L.info.tempo) * 10 + d * 10) / 10, 20), 300); }));
  panelEls.swing = chips(["off", "54%", "58%", "62%", "66%", "70%"], 0, (i) => mutate((sl) => { sl.swing = consts.swings[i]; }));
  panelEls.human = chips(["0", "25%", "50%", "100%"], 0, (i) => mutate((sl) => { sl.humanize = consts.humanizes[i]; }));
  panelEls.seed = el("b", "lb-note", "seed 0");
  panelEls.gridNote = note("");
  feel.append(el("div", "lb-note", "Grid (steps of a note length at the tempo)"), panelEls.div.root, panelEls.bpm.root, panelEls.gridNote,
    el("div", "lb-note", "Swing (needs the grid)"), panelEls.swing.root, el("div", "lb-note", "Humanize"), panelEls.human.root,
    row("lb-wrap", panelEls.seed, btn("NEW SEED", "", () => mutate((sl) => { sl.seed = (Math.random() * 1e6) | 0; }))));
  C.main.appendChild(feel);
  /* bounce */
  const bn = el("div", "lb-sec");
  bn.appendChild(head("Put it on pads"));
  bn.appendChild(note("PLAY above loops what the slices sound like. These render it onto pads (the sample on a pad is never replaced without UNDO)."));
  const rounds = chips(["1", "2", "4", "8"], 0, (i) => { S.rounds = [1, 2, 4, 8][i]; paint(); });
  const takes = chips(["1", "2", "4", "8"], 0, (i) => { S.takes = [1, 2, 4, 8][i]; paint(); });
  C.bounceInfo = el("b", "lb-note", "");
  bn.append(el("div", "lb-note", "Rounds (how many times the sequence plays)"), rounds.root, el("div", "lb-note", "Takes (different renders, one pad each; random modes make them differ)"), takes.root, C.bounceInfo,
    row("lb-col", btn("RENDER TO PAD…", "go", bounceToPad), btn("SELECTED / MARKED SLICES TO PADS…", "", bounceMarked), btn("WHOLE SAMPLE STRETCHED TO BARS…", "", bounceStretch), btn("ADD ANOTHER SAMPLE…", "", addSample)));
  C.main.appendChild(bn);
  C.main.style.display = "none";
  return {
    root,
    async show() {
      if (!consts) consts = JSON.parse(await call("slicerConsts"));
      if (!L.info || !L.info.open) { C.main.style.display = "none"; C.empty.style.display = ""; return; }
      if (!S.src) { paint(); return; }
      paint(); drawWave();
    },
    async open(n) { if (!consts) consts = JSON.parse(await call("slicerConsts")); await fromPad(n); },
  };
}
export { build };
