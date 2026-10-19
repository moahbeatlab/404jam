import { Midi } from "../core/midi.js";
import { saveState, state } from "../core/store.js";
import { $, NOTE_NAMES, clamp, el } from "../core/util.js";
import { BANK_NAMES, padPairHalf, pairJump, renderPattern } from "./pattern-grid.js";
import { showBanner } from "../ui/banner.js";
import { finishDragsIn } from "../ui/controls.js";

/* ===== play view: chromatic keys / vocoder keys / pad board =====
   note map (Mode B): pads on two adjacent channels (device setting "Pad
   MIDI Channels", default 1/2): lower = banks A-E, upper = F-J; block of 16
   notes per bank starting at 12, in pad order 13..16/9..12/5..8/1..4.
   Chromatic play: CH 16, notes 36-60. Vocoder pitch: CH 11 + pitch bend. */
const PAD_ORDER = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4];
/* display rows top->bottom exactly like the device: pad 1 top-left, 13 bottom-left.
   (note mapping is separate: PAD_ORDER, lowest notes on the bottom row) */
const PAD_ROWS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
function padNote(bank, pad) {
  const half = bank < 5 ? 0 : 1;
  return { ch: state.play.padChPair + half, note: 12 + (bank % 5) * 16 + PAD_ORDER.indexOf(pad) };
}
const heldNotes = new Map(); /* pointerId -> {ch, note, el} */
function flushNotesIn(host) {
  /* rebuilds must never orphan a held note (mirrors finishDragsIn) */
  for (const [id, h] of [...heldNotes]) {
    if (!host || host.contains(h.el)) {
      Midi.sendNote(h.ch, h.note, false);
      h.el.classList.remove("on", "hit");
      heldNotes.delete(id);
    }
  }
}
let flushBend = () => {};
function noteName(n) { return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1); }
function attachNoteSource(btn, getNote) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const nt = getNote();
    if (!nt) return;
    /* don't show the pad/key as pressed when nothing actually went out -
       matches the same fix on the pattern grid (renderPattern) */
    if (!Midi.sendNote(nt.ch, nt.note, true)) {
      showBanner("SP-404 not connected - nothing sent", "warn", 4000);
      return;
    }
    btn.setPointerCapture(e.pointerId);
    heldNotes.set(e.pointerId, { ch: nt.ch, note: nt.note, el: btn });
    btn.classList.add(btn.classList.contains("key") ? "on" : "hit");
  });
  const up = (e) => {
    const h = heldNotes.get(e.pointerId);
    if (!h || h.el !== btn) return;
    heldNotes.delete(e.pointerId);
    btn.classList.remove("on", "hit");
    Midi.sendNote(h.ch, h.note, false);
  };
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
}
function keysRange() {
  const narrow = window.innerWidth < 700;
  if (state.play.target === "sample") {
    if (!narrow) return [36, 60];
    return state.play.oct >= 1 ? [48, 60] : [36, 48];
  }
  const lo = clamp(48 + state.play.oct * 12, 12, 96);
  return [lo, lo + (narrow ? 12 : 24)];
}
function playCh() { return state.play.target === "sample" ? 15 : 10; }
const BLACKS = [1, 3, 6, 8, 10];
function buildKeys() {
  const host = $("keys");
  flushNotesIn(host);
  host.textContent = "";
  const r = keysRange(), lo = r[0], hi = r[1];
  let whiteCount = 0;
  for (let n = lo; n <= hi; n++) if (BLACKS.indexOf(n % 12) < 0) whiteCount++;
  const ww = 100 / whiteCount;
  let wi = 0;
  for (let n = lo; n <= hi; n++) {
    const black = BLACKS.indexOf(n % 12) >= 0;
    const key = el("button", "key " + (black ? "black" : "white"));
    if (black) {
      key.style.left = (wi * ww - ww * 0.3) + "%";
      key.style.width = (ww * 0.6) + "%";
    } else {
      key.style.left = (wi * ww) + "%";
      key.style.width = ww + "%";
      if (n % 12 === 0) key.appendChild(el("span", "kl", noteName(n)));
      wi++;
    }
    const note = n;
    attachNoteSource(key, () => ({ ch: playCh(), note }));
    host.appendChild(key);
  }
}
let padPickSlot = 0, padPickBank = 0;
function buildPads() {
  const bh = $("pad-banks");
  bh.textContent = "";
  /* compact bank picker: one button per row-pair (A/F, B/G, C/H, D/I, E/J -
     row i pairs bank i with bank i+5, the two Mode-B channel halves) instead
     of a button per bank - still reaches all 10, just less space. Each pair
     remembers its own last letter independently (pairJump). */
  for (let i = 0; i < 5; i++) {
    const b = el("button", (state.play.padBank === i || state.play.padBank === i + 5) ? "active" : "");
    b.appendChild(el("span", state.play.padBank === i ? "sel" : "", BANK_NAMES[i]));
    b.appendChild(document.createTextNode("/"));
    b.appendChild(el("span", state.play.padBank === i + 5 ? "sel" : "", BANK_NAMES[i + 5]));
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.play.padBank = pairJump(state.play.padBank, i, padPairHalf);
      saveState();
      buildPads();
    });
    bh.appendChild(b);
  }
  const star = el("button", state.play.padBank === 10 ? "active" : "", "★");
  star.addEventListener("pointerdown", (e) => { e.preventDefault(); state.play.padBank = 10; saveState(); buildPads(); });
  bh.appendChild(star);
  const g = $("pad-grid");
  flushNotesIn(g);
  g.textContent = "";
  const custom = state.play.padBank === 10;
  const cells = custom ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : PAD_ROWS.reduce((a, r2) => a.concat(r2), []);
  cells.forEach((cell) => {
    const btn = el("button", "pad");
    if (custom) {
      const a = state.play.custom[cell];
      btn.appendChild(el("span", "", a ? BANK_NAMES[a.bank] + a.pad : "–"));
      btn.appendChild(el("span", "pl", a ? "hold: edit" : "hold: assign"));
      attachNoteSource(btn, () => {
        const asg = state.play.custom[cell];
        return asg ? padNote(asg.bank, asg.pad) : null;
      });
      let hold = null;
      btn.addEventListener("pointerdown", () => {
        hold = setTimeout(() => {
          /* long-press edits: silence the note the touch just started */
          for (const [id, h] of [...heldNotes]) {
            if (h.el === btn) { Midi.sendNote(h.ch, h.note, false); heldNotes.delete(id); btn.classList.remove("hit"); }
          }
          openPadPick(cell);
        }, 500);
      });
      const clr = () => clearTimeout(hold);
      btn.addEventListener("pointerup", clr);
      btn.addEventListener("pointercancel", clr);
    } else {
      btn.textContent = String(cell);
      attachNoteSource(btn, () => padNote(state.play.padBank, cell));
    }
    g.appendChild(btn);
  });
}
function openPadPick(slot) {
  padPickSlot = slot;
  const a = state.play.custom[slot];
  padPickBank = a ? a.bank : 0;
  renderPadPick();
  $("padpick").classList.add("open");
}
function renderPadPick() {
  const bh = $("padpick-bank");
  bh.textContent = "";
  BANK_NAMES.forEach((n, i) => {
    const b = el("button", "setup-btn" + (i === padPickBank ? " sel" : ""), n);
    b.addEventListener("click", () => { padPickBank = i; renderPadPick(); });
    bh.appendChild(b);
  });
  const ph = $("padpick-pad");
  ph.textContent = "";
  const a = state.play.custom[padPickSlot];
  for (let p = 1; p <= 16; p++) {
    const sel = a && a.bank === padPickBank && a.pad === p;
    const b = el("button", "setup-btn" + (sel ? " sel" : ""), String(p));
    b.addEventListener("click", () => {
      state.play.custom[padPickSlot] = { bank: padPickBank, pad: p };
      saveState();
      $("padpick").classList.remove("open");
      buildPads();
    });
    ph.appendChild(b);
  }
}
const SCALES = [
  ["MAJ", [0, 2, 4, 5, 7, 9, 11]],
  ["MIN", [0, 2, 3, 5, 7, 8, 10]],
  ["MIN-P", [0, 3, 5, 7, 10]],
  ["MAJ-P", [0, 2, 4, 7, 9]],
  ["DOR", [0, 2, 3, 5, 7, 9, 10]],
  ["MIXO", [0, 2, 4, 5, 7, 9, 10]],
  ["BLUES", [0, 3, 5, 6, 7, 10]],
];
function buildScale() {
  const g = $("scale-grid");
  flushNotesIn(g);
  g.textContent = "";
  const iv = SCALES[state.play.scaleType][1];
  const base = (state.play.target === "sample" ? 36 : 48) + state.play.scaleRoot;
  const deg = (d) => base + Math.floor(d / iv.length) * 12 + iv[d % iv.length];
  /* rows bottom-up; ISO = rows a musical 4th apart (Move/Push layout) */
  for (let row = 3; row >= 0; row--) {
    const start = state.play.iso ? row * 3 : row * 4;
    for (let col = 0; col < 4; col++) {
      const n = deg(start + col);
      const oor = state.play.target === "sample" ? (n < 36 || n > 60) : (n < 0 || n > 127);
      const isRoot = (n - base) % 12 === 0;
      const btn = el("button", "pad" + (isRoot ? " root" : "") + (oor ? " oor" : ""), noteName(n));
      if (!oor) attachNoteSource(btn, () => ({ ch: playCh(), note: n }));
      g.appendChild(btn);
    }
  }
}
function renderPlay() {
  const mode = state.play.mode;
  $("view-play").classList.toggle("pads", mode === "pads");
  $("view-play").classList.toggle("scale", mode === "scale");
  $("play-keys-btn").classList.toggle("on", mode === "keys");
  $("play-scale-btn").classList.toggle("on", mode === "scale");
  $("play-pads-btn").classList.toggle("on", mode === "pads");
  const show = (id, on) => { $(id).style.display = on ? "" : "none"; };
  show("play-oct-down", mode === "keys");
  show("play-oct-up", mode === "keys");
  show("play-root", mode === "scale");
  show("play-scalesel", mode === "scale");
  show("play-layout", mode === "scale");
  $("play-target").textContent = mode === "pads"
    ? "PAD-CH " + (state.play.padChPair + 1) + "/" + (state.play.padChPair + 2)
    : (state.play.target === "sample" ? "SAMPLE CH16" : "VOCODER CH11");
  $("play-root").textContent = NOTE_NAMES[state.play.scaleRoot];
  $("play-scalesel").textContent = SCALES[state.play.scaleType][0];
  $("play-layout").textContent = state.play.iso ? "ISO" : "LIN";
  $("bend").classList.toggle("off", !(mode === "keys" && state.play.target === "voc"));
  $("play-note").textContent = mode === "pads"
    ? "Note map mode B, channels " + (state.play.padChPair + 1) + "/" + (state.play.padChPair + 2) + " (device setting \"Pad MIDI Channels\"). ★ = custom layout."
    : mode === "scale"
      ? "Scale pads " + NOTE_NAMES[state.play.scaleRoot] + " " + SCALES[state.play.scaleType][0] + ": bottom left = root, " + (state.play.iso ? "rows a fourth apart (Move layout)" : "rows continuous") + ". Roots highlighted."
      : state.play.target === "sample"
        ? "Chromatic: pitches whichever sample you last tapped in PADS (CH 16, fixed - independent of the Pad MIDI Channels setting; C2–C4)."
        : "Vocoder: pitches for the INPUT vocoder (CH 11); pitch bend on the right.";
  if (mode === "pads") buildPads(); else if (mode === "scale") buildScale(); else buildKeys();
}
function setupBend() {
  const bend = $("bend"), ind = $("bend-ind");
  let bid = null;
  function pos(e) {
    const r = bend.getBoundingClientRect();
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    ind.style.top = "calc(" + (ny * 100) + "% - 12px)";
    Midi.sendBend(10, Math.round((1 - ny) * 16383));
  }
  bend.addEventListener("pointerdown", (e) => { e.preventDefault(); bend.setPointerCapture(e.pointerId); bid = e.pointerId; pos(e); });
  bend.addEventListener("pointermove", (e) => { if (e.pointerId === bid) pos(e); });
  flushBend = () => {
    bid = null;
    ind.style.top = "calc(50% - 12px)";
    Midi.sendBend(10, 8192); /* spring back to center (idempotent) */
  };
  const end = (e) => { if (e.pointerId === bid) flushBend(); };
  bend.addEventListener("pointerup", end);
  bend.addEventListener("pointercancel", end);
}

export { PAD_ORDER, PAD_ROWS, padNote, heldNotes, flushNotesIn, flushBend, noteName, attachNoteSource, keysRange, playCh, BLACKS, buildKeys, padPickSlot, padPickBank, buildPads, openPadPick, renderPadPick, SCALES, buildScale, renderPlay, setupBend };
