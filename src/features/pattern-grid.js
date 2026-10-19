import { Midi } from "../core/midi.js";
import { Pulse } from "../core/pulse.js";
import { saveState, state } from "../core/store.js";
import { $, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";

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
const ptnPairHalf = [false, false, false, false, false];
const padPairHalf = [false, false, false, false, false];
function renderPattern() {
  const bh = $("ptn-banks");
  bh.textContent = "";
  /* one button per row-pair (A/F, B/G, C/H, D/I, E/J - row i pairs bank i
     with bank i+5) instead of a button per bank, same compaction as PADS.
     Each pair remembers its own last letter independently (pairJump). */
  for (let i = 0; i < 5; i++) {
    const b = el("button", (state.ptn.bank === i || state.ptn.bank === i + 5) ? "active" : "");
    b.appendChild(el("span", state.ptn.bank === i ? "sel" : "", BANK_NAMES[i]));
    b.appendChild(document.createTextNode("/"));
    b.appendChild(el("span", state.ptn.bank === i + 5 ? "sel" : "", BANK_NAMES[i + 5]));
    /* click, not pointerdown: the view scrolls in phone landscape */
    b.addEventListener("click", () => {
      state.ptn.bank = pairJump(state.ptn.bank, i, ptnPairHalf);
      saveState();
      renderPattern();
    });
    bh.appendChild(b);
  }
  const g = $("ptn-grid");
  g.textContent = "";
  for (let pc = 0; pc < 16; pc++) {
    const sent = state.ptn.last && state.ptn.last.bank === state.ptn.bank && state.ptn.last.pc === pc;
    const nxt = Ptn.next && Ptn.next.bank === state.ptn.bank && Ptn.next.pc === pc;
    const b = el("button", "pad" + (sent ? " sent" : "") + (nxt ? " next" : ""), String(pc + 1));
    b.addEventListener("click", () => {
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

export { BANK_NAMES, pairJump, ptnPairHalf, padPairHalf, renderPattern };
