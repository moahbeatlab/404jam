import { Midi } from "../core/midi.js";
import { saveState, state } from "../core/store.js";
import { $, el } from "../core/util.js";
import { showBanner } from "../ui/banner.js";

/* ===== pattern grid (Program Change; bank = MIDI channel; needs Mode B) ===== */
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
    const b = el("button", "pad" + (sent ? " sent" : ""), String(pc + 1));
    b.addEventListener("click", () => {
      /* don't claim success (highlighting the pad) when nothing actually
         went out - a silently dropped MIDI connection looked identical to
         a working pattern change otherwise */
      if (!Midi.sendPc(state.ptn.bank, pc)) {
        showBanner("SP-404 not connected - pattern not sent", "warn", 4000);
        return;
      }
      state.ptn.last = { bank: state.ptn.bank, pc };
      saveState();
      renderPattern();
    });
    g.appendChild(b);
  }
}

export { BANK_NAMES, pairJump, ptnPairHalf, padPairHalf, renderPattern };
