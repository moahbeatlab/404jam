import { Midi } from "../core/midi.js";
import { NOTE_NAMES } from "../core/util.js";
import { showBanner } from "../ui/banner.js";
import { openPick } from "./lfo-page.js";
import { BANK_NAMES } from "./pattern-grid.js";
import { padNote } from "./play-view.js";

/* the sample ARP and TRIG play: a pad of a bank. Picking it hits the pad once, so the unit takes it as the sample the chromatic
   channel pitches (the same way as tapping it in PADS; not verified on the unit). */
const ORIGIN = 48; /* the chromatic note that plays the sample at its own pitch: assumed C3 (not verified) */
const sampleLabel = (s) => (s ? BANK_NAMES[s.bank] + s.pad : "PICK");
function hitPad(s) {
  const p = padNote(s.bank, s.pad);
  if (!Midi.sendNote(p.ch, p.note, true, 100)) { showBanner("SP-404 not connected - nothing sent", "warn", 4000); return; }
  setTimeout(() => Midi.sendNote(p.ch, p.note, false), 150);
}
function pickSample(cur, done) {
  openPick("Sample: bank", BANK_NAMES.map((n) => ({ t: n })), cur ? cur.bank : -1, (b) => {
    openPick("Sample: pad of bank " + BANK_NAMES[b], Array.from({ length: 16 }, (_, i) => ({ t: String(i + 1) })), cur && cur.bank === b ? cur.pad - 1 : -1, (p) => {
      const s = { bank: b, pad: p + 1 };
      hitPad(s);
      done(s);
    }, 4);
  }, 5);
}
/* a chromatic note as the pitch it sounds, given the key the sample is tuned to */
const pitchName = (n, key) => NOTE_NAMES[(((n - ORIGIN + key) % 12) + 12) % 12];
export { ORIGIN, sampleLabel, hitPad, pickSample, pitchName };
