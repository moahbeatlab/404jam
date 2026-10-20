import { Midi } from "../core/midi.js";
import { Pulse } from "../core/pulse.js";
import { saveState, state } from "../core/store.js";
import { $, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { openPick } from "./lfo-page.js";
import { SimInfo } from "../sim/info.js";

/* ===== pattern grid (Program Change; bank = MIDI channel; needs Mode B) ===== */
/* The unit takes a pattern over at the end of the one that plays and does not say when. The pattern that was tapped
   blinks until the next bar line (the nearest guess, as in 404tui), then it is the current one (state.ptn.last). */
const Ptn = { next: null, due: 0, lastN: 0 };
const TICKS_BAR = 96;
const dueAfter = (n) => (Math.floor(n / TICKS_BAR) + 1) * TICKS_BAR;
Pulse.busyFns.add(() => !!Ptn.next);
Pulse.subs.add((n) => {
  if (!Ptn.next) return;
  if (n < Ptn.lastN) Ptn.due = TICKS_BAR; /* the unit started again: the count began from 0 */
  Ptn.lastN = n;
  if (n < Ptn.due) return;
  state.ptn.last = Ptn.next;
  Ptn.next = null;
  saveState();
  if (document.body.classList.contains("pattern")) renderPattern();
});
/* STOP: MIDI Stop to the unit (whether the unit follows it depends on its MIDI sync setting: not verified), and the highlight goes out */
function stopPattern() {
  if (!Midi.sendBytes([0xFC])) { showBanner("SP-404 not connected - nothing sent", "warn", 4000); return; }
  Ptn.next = null;
  state.ptn.last = null;
  saveState();
  renderPattern();
}
const BANK_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
/* compact A/F-style bank pickers (PTN, PADS): each of the 5 pair buttons
   remembers its OWN last-used letter independently, rather than a shared
   "current half" that follows whichever bank happens to be selected - the
   shared version let clicking a pair jump somewhere other than what its
   own label last showed, which was genuinely easy to get lost in. */
function pairJump(current, i, halfMem) {
  let next;
  if (current === i) next = i + 5;
  else if (current === i + 5) next = i;
  else next = halfMem[i] ? i + 5 : i;
  halfMem[i] = next >= 5;
  return next;
}
const padPairHalf = [false, false, false, false, false];
function renderPattern() {
  /* the bank: one chip that opens the list of banks (as in 404tui) */
  const bh = $("ptn-banks");
  bh.textContent = "";
  const chip = el("button", "bankchip");
  chip.appendChild(el("span", "", "BANK"));
  chip.appendChild(el("b", "", BANK_NAMES[state.ptn.bank]));
  chip.appendChild(el("i", "", "▾"));
  chip.addEventListener("click", () => openPick("Patterns of bank", BANK_NAMES.map((n, i) => ({ t: n, s: SimInfo.on ? (SimInfo.pat(i, 0) ? "8 demo patterns" : "empty") : "" })), state.ptn.bank, (i) => {
    state.ptn.bank = i;
    saveState();
    renderPattern();
  }, 5));
  bh.appendChild(chip);
  const stop = el("button", "stopchip", "■ STOP");
  stop.addEventListener("click", stopPattern);
  bh.appendChild(stop);
  const g = $("ptn-grid");
  g.textContent = "";
  for (let pc = 0; pc < 16; pc++) {
    const sent = state.ptn.last && state.ptn.last.bank === state.ptn.bank && state.ptn.last.pc === pc;
    const nxt = Ptn.next && Ptn.next.bank === state.ptn.bank && Ptn.next.pc === pc;
    const nm = SimInfo.on ? SimInfo.pat(state.ptn.bank, pc) : null;
    const b = el("button", "pad" + (sent ? " sent" : "") + (nxt ? " next" : "") + (SimInfo.on && !nm ? " empty" : ""));
    b.appendChild(el("span", "", String(pc + 1)));
    if (SimInfo.on) b.appendChild(el("span", "pl", nm || "empty"));
    /* holding the current pattern stops it */
    let held = false, holdT = null;
    if (sent) {
      b.addEventListener("pointerdown", () => { held = false; holdT = setTimeout(() => { held = true; stopPattern(); }, 600); });
      const clr = () => clearTimeout(holdT);
      b.addEventListener("pointerup", clr); b.addEventListener("pointercancel", clr); b.addEventListener("pointerleave", clr);
    }
    b.addEventListener("click", () => {
      if (held) { held = false; return; }
      /* don't claim success (highlighting the pad) when nothing actually
         went out - a silently dropped MIDI connection looked identical to
         a working pattern change otherwise */
      if (!Midi.sendPc(state.ptn.bank, pc)) {
        showBanner("SP-404 not connected - pattern not sent", "warn", 4000);
        return;
      }
      Ptn.next = { bank: state.ptn.bank, pc };
      Ptn.lastN = Pulse.n;
      Ptn.due = dueAfter(Pulse.n);
      renderPattern();
    });
    g.appendChild(b);
  }
}

export { BANK_NAMES, pairJump, padPairHalf, renderPattern };
