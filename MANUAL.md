# 404 Busdriver — Manual

A browser-based MIDI controller for the Roland SP-404 MkII: controls the five
effect buses, plays samples chromatically or in scales, triggers pads,
switches patterns and modulates parameters with LFOs — all via Web MIDI,
no installation. This manual is also built into the app (Setup > Manual).

## Requirements and connection

- **Device:** SP-404 MkII via USB-C, connected directly to the computer or
  iPad/iPhone.
- **Browser:** Chrome or Edge on desktop. No iOS browser can do Web MIDI —
  install the **MIDIWeb Browser** app (App Store) and open the Busdriver URL
  there.
- **Device MIDI setup** ([SHIFT]+[PAD 12] > SYSTEM > MIDI) — everything the
  device needs, checklist form:
  - **MIDI Mode → B.** Mode A also works, but only for FX control — the pad
    note-mapping, chromatic play and pattern switching this app uses all
    assume mode B.
  - **"PC Rx" → ON.** Needed only for pattern switching (PTN tab). Without
    it the app's Program Change messages send fine but the device silently
    ignores them — no error, just nothing happening.
  - **"Pad MIDI Channels" → match the app's PAD-CH button** (PLAY > PADS,
    default 1/2). Whatever channel pair you set on the device is what you
    pick there.
  - Nothing else to configure: Chromatic/Sample Play always uses a fixed
    channel 16, FX control always uses fixed channels 1–5, and the app
    never uses SysEx.
- **Connect:** Setup (top right) > "Connect to SP-404". The app remembers the
  ports; when an SP-404 appears it takes over input and output automatically.
- **Looks outdated?** Setup shows a build number. If features seem missing,
  reload the URL with `?v=99` appended to bypass the cache.

## Layout

**Status bar:** connection dot (tap = Setup), TX blinker, BPM display
(appears on incoming MIDI clock), Overview/Focus toggle, XY, **ALL OFF**
(switches every bus off and remembers the state — a second tap restores),
Snap, Setup.

**Tab bar:** BUS 1–4 and IN (focus view per bus), PLAY (playing surfaces),
PTN (patterns, autopilot, looper), JAM (your own pinned controls). The LEDs
in the bus tabs always show which effects are on.

## Focus view: one bus, six faders

- **Faders:** relative drag — the first touch never jumps; only movement
  changes the value. **Fine-tune:** while dragging, pull the finger sideways
  (from 60 px: 4x finer, from 120 px: 10x). **Double tap** sets the musical
  default. Tapping the value window opens a ±1 stepper. Desktop: mouse wheel
  ±1, Shift ±10.
- **Parameters:** faders carry the real parameter names of the selected
  effect (from the Roland reference manual); switches render as pads, small
  option lists as steppers, note-value parameters snap.
- **EFX pad:** tap toggles the bus effect. **Hold** (from 0.35 s) acts
  momentary — on while held, off on release.
- **‹ / ›** step through favorites (falling back to recent/all).
- **RND** randomizes the continuous parameters (LEVEL/SEND/GAIN are spared);
  right afterwards the button becomes **UNDO** for 6 seconds.
- **SAVE** captures this bus's current effect + all six values + on/off as a
  JAM bus-scene pad in one tap — opens the JAM editor pre-filled (label
  already set, mode defaults to Momentary) so you just confirm or tweak it.
- **Scene sidebar:** any bus-scene pads captured for the bus you're looking
  at appear as small buttons on the left of the faders — hold to preview,
  release to return to exactly what was playing before (including the
  effect itself, not just its values), no need to leave Focus. A small
  **✎** on each one opens its editor (rename, re-capture, delete).

## Overview

All five buses side by side. On iPad/desktop the strips are directly
playable; if the width is tight, pan horizontally (start on a strip header or
effect name). On a phone in portrait you get cards — tap one for its focus
view.

## Choosing effects

Tap the effect name to open the picker: "Recent", "Favorites" (star an entry
by **holding** it), then categories with a jump bar — RECENT and FAVORITES
get their own jump-bar shortcuts too. Note: **the three bus types have
different effect sets** (Roland's spec) — e.g. Sync Delay, Isolator,
Resonator and Filter+Drive only exist on BUS 3/4, the voice effects only on
INPUT.

Favorited effects for the bus you're looking at also show as small chips
right under the header in Focus view — a one-tap shortcut that skips the
picker entirely. Scrolls sideways if you have more than fit. Tapping a chip
always lands with EFX off, even if it was on before — the point is loading
an effect to dial it in, not punching it in live; hit EFX yourself once
you're happy with it.

**Direct FX (BUS 1/2):** the five DFX slots are freely assignable on the
device. Mirror the assignment in Setup ("Direct FX assignment") — the faders
then show real parameter names (e.g. "DFX3 · Sync Delay") and values are
remembered per effect.

The app remembers parameter values **per effect**: switching an effect sends
the effect number plus all six values, keeping app and device in sync.
Parameters with a SYNC switch flip their display between milliseconds and
note values.

## Snapshots (Snap panel)

Eight slots for the full state of all five buses (effect, values, on/off).
**Tap loads** (an empty slot saves), **hold saves** and lets you type the
name right in the slot, ✕ deletes. The panel shows what would be saved;
each slot lists its content ("1● Tape Echo · 3○ Lo-fi": ● on, ○ off).

**Recipes:** the same full 5-bus shape as a snapshot, but *typed in*
instead of captured from live state — and not capped at 8. Meant for
transcribing chains from recipe cards/packs (the kind that list an effect
and six control values per bus) straight into the app, no fader-dragging
required. Open via **Library** in the top status bar (visible from any
view) or **"Open Recipes"** below the snapshot grid — same panel either
way. **+ New Recipe** (or ✎ on an existing one) opens the editor: pick an
effect per bus from a dropdown, and the value fields that appear are
labeled with that effect's real parameter names and units — type what's
printed on the card (dB, ms, %, a note value, "L12"/"R12"/"CTR" for pan,
"80:20" or "80/20" for a balance split) and it converts to the right
underlying value automatically, the same math the app uses to display it.
Tap a saved recipe to load it onto all 5 buses, same as a snapshot. Ships
with six factory recipes transcribed from
[electronoir](https://electronoir.gumroad.com) (@noirtdc) FX Recipe
cards — House Chord Synth, "Quack" Bass, Risers, Bass Destroyer, Techno
Kick Fattener, and Top Loops Sauce. A few of the source cards give a
*range* for a field ("10 to 20") rather than one fixed number, meant as a
live-tweak/automation target rather than a strict setting; those load
with the range's midpoint as a starting value, same as everything else
in a recipe — fully editable afterward.

**Export/Import:** JSON for backups and for moving your whole setup —
snapshots, JAM, XY combos, *and* recipes — between devices, e.g. editing
on a laptop browser and bringing it to your phone: Export, copy/share the
JSON, paste it into the same field on the other device, Import. Import
overwrites matching snapshot slot numbers and replaces JAM/XY
combos/recipes entirely; tap Import again within 8 seconds to undo.

## XY pad and LFOs

**XY:** both axes freely assignable (bus + control). Absolute Kaoss-style
behavior: position = value. **MOMENTARY** springs both values back to the
pre-touch state on release.

**PRESETS:** one-tap axis assignments. **Templates** are curated pairs for
specific effects (e.g. "Isolator — LOW × HIGH", "Tape Echo — TIME ×
FEEDBACK"), built from their real parameter names — picking one asks which
bus (only buses that actually have that effect are offered), switches that
bus to the effect if it isn't already loaded, and assigns both axes. **Your
combos** are your own saved X/Y pairs: dial in an assignment, "Save current
X/Y as…", rename with the ✎, tap the name to recall it later, ✕ to delete.
Unlike templates these just re-point to whatever bus+slot you saved, no
effect-switching involved.

**LFO row:** four modulator slots (chips 1–4; orange dot = running). Per
slot: target, waveform (SIN/TRI/SQR/SAW/**RND** = drift between random
anchors), rate in note values (4/1 to 1/16), depth. The time source shows on
the last button: **CLK** (MIDI clock present) or **TAP** — tap the beat a few
times to set the tempo and anchor the phase. Grabbing the target fader pauses
the LFO and re-centers it on your position; switching it off parks the value
at the center. Slot 4 comes preconfigured as a slow drift.

## PLAY: keys, scale, pads

- **KEYS:** keyboard. Target "SAMPLE CH16" plays whichever sample you last
  tapped in PADS, chromatically (C2–C4, octave paging on phones) — tap the
  pad you want first, *then* switch to KEYS. CH 16 is fixed by the device
  and has nothing to do with the "Pad MIDI Channels" setting used by PADS.
  Target "VOCODER CH11" plays pitches for the INPUT vocoder — a
  **pitch-bend strip** appears on the right (springs back to center).
- **SCALE:** a 4×4 grid with only in-scale notes. Cycle root (C…B) and scale
  (major, minor, both pentatonics, Dorian, Mixolydian, blues) at the top.
  **ISO** = rows a fourth apart (Move/Push layout, chords as grips),
  **LIN** = continuous. Roots are highlighted. Note: the 404's chromatic mode
  has its own scale/key setting — leave it on chromatic when playing from the
  app.
- **PADS:** the pad board, laid out like the device (pad 1 top left). Banks
  A–J as five pair buttons (A/F, B/G, C/H, D/I, E/J — pairing each bank
  with its Mode-B channel-half counterpart): tap a different pair to jump
  to it on your current half, tap the active pair again to flip to its
  other letter. All ten banks stay reachable, just in five buttons instead
  of ten. The **★** tab is a free layout: hold
  any field to assign it any bank+pad combination. "PAD-CH" must match the
  device setting "Pad MIDI Channels" (default 1/2).
- **Looper** (underneath the pad grid): just **LOOPER REC**, toggling
  start/stop (CC#88). The device must be in looper mode itself. The rest
  of the looper CC set (overdub, delete, undo/redo, tempo reset, BPM) isn't
  exposed here - use the device directly for those.

## PTN: patterns, autopilot

- **Grid:** pick a bank via the five pair buttons (A/F, B/G, C/H, D/I, E/J -
  same compact picker as PADS: tap a different pair to jump to it on your
  current half, tap the active pair again to flip its other letter), tap a
  pattern (1–16) — the app sends the program change. Needs mode B and
  "PC Rx" ON; the device does not confirm, the highlight marks the last
  one sent.
- **Autopilot:** wanders markov-style through the patterns — quantized every
  2/4/8 bars (tempo from clock or tap), within the chosen bank or across all.

## JAM: pinned controls

A tab of your own pads and faders, independent of whatever effect happens to
be loaded. Two kinds of control per slot:

- **SP-404 bus param:** pins one of a bus's six control slots (e.g. "BUS 1 ·
  CTRL 1") under a name you choose, so it stays visible and adjustable no
  matter which effect is currently selected on that bus — this is how a
  Faderfox/TouchOSC-style fixed layout (HPF, LPF, Stopper, ...) works: the
  slot always sends the same CC, its effect depends on whatever's loaded.
- **Raw MIDI:** any channel/CC/Note/Program Change to any currently connected
  MIDI output — not just the SP-404. Use this to reach a second device (e.g.
  an MC-101) from the same page. CC controls are two-way: turning the actual
  hardware knob on that channel/CC updates the app too, from *any* connected
  MIDI input (not just the one selected as the primary SP-404 input) — so a
  second device just needs to reach the browser somehow, either connected
  directly (e.g. the MC-101 over its own USB) or passed through another
  device, whichever your setup allows.
- **Bus scene:** captures one bus's full state (effect + all six values +
  on/off) into a pad. Pressing always switches EFX **on** regardless of
  what was captured (the point is to hear it), even if the bus was off when
  you captured it. **Momentary** mode holds the captured scene while
  pressed and, on release, always restores exactly what that bus was doing
  the instant before you pressed — including the effect itself, not just
  its values, and not back to some fixed old state but to wherever you'd
  since moved it, so it works mid-transition. Anything you tweak while
  holding is just a preview; release always discards it and goes back.
  **Toggle** mode applies on the first tap, restores on the second. Use it
  to punch in a prepared sound (e.g. an isolator with only the mids up) for
  a bar, then let go. To set one up: dial in the sound live on the bus,
  open the control's editor, pick **Bus scene**, choose the bus, tap
  **Capture** — or just tap **SAVE** in the Focus header to do all of that
  for the bus you're currently looking at in one step.

**CLEAR** (top right) removes every control in JAM immediately — no dialog
(some Web MIDI wrapper browsers don't support them reliably); the button
becomes **UNDO** for 6 seconds instead.

**EDIT** (top right) turns the grid into an editor: tiles show a pencil
badge, tap one to change its settings or delete it, or drag it to a new
position to reorder. **Swipe a tile left** past about half its width to
arm delete (turns red with a 🗑 icon) — release to remove it, same
instant+UNDO behavior as CLEAR below. Tap **+** (outside edit mode) to add
a new control. Fader values and pad on/off state are remembered per slot,
same as everywhere else in the app (`localStorage`, nothing is ever sent
on load).

**SELECT** (top right) turns the grid into a multi-select picker: tap
tiles to check them (a bar appears above the grid showing how many are
selected), then either type a **channel** number and tap **Apply** to
set that channel on every selected raw-MIDI control in one go (bus params
and bus scenes don't carry a channel, so they're skipped), or tap
**Delete** to remove all selected tiles at once — again instant with a
6-second **UNDO** via CLEAR. Handy for retuning a whole preset (e.g. an
MC-101 template) to different track channels without opening each tile.

**PRESETS:** factory templates that add a set of controls in one tap, built
from the target device's actual MIDI implementation chart rather than
guesswork. Currently ships one: **MC-101 — 4 tracks × Sound/Filter/Mod/FX**
(CC 80–83, the four hardware knobs, one row per track, in the device's own
left-to-right knob order). Picking a preset
asks which connected output to route it to (so it doesn't silently reuse
whatever the SP-404 is on), then appends the controls to your existing JAM
grid — nothing is removed. Track channels default to 1–4; verify against
the device's own Track MIDI Channel setting (SHIFT + TRACK SEL on the
MC-101) since every control's channel is still editable afterward if it
doesn't match.

## Display: theme and fader orientation

Setup has two display toggles:

- **Theme:** dark (default) or light.
- **Horizontal faders:** switches the Focus-view faders from a column of
  vertical bars to full-width horizontal strips stacked top to bottom —
  useful on a wide/landscape tablet where a sideways drag has more travel to
  work with than a narrow vertical one.
- **JAM style:** bars (default) or rotary knobs for every fader-type control
  in the JAM tab — same drag behavior (relative drag, fine-tune pull,
  double-tap default, wheel ±1), just drawn as a balance-style dial: pointer
  straight up at the center value (64), tilts right and fills orange toward
  127, tilts left toward 0.

## Tempo and Ableton Link

The BPM display reads MIDI clock from **any** connected port — AUM, Ableton
or a Link-to-MIDI bridge. The Link route: the Link source sends clock to the
SP-404 (which follows as a sync slave: UTILITY > SYSTEM > MIDI, "MIDI Sync")
and to the computer — device, app and Link session then run in sync. LFOs and
autopilot use the clock automatically; without clock, tap tempo applies.

## Keyboard (desktop)

1–5 = select bus · Space = EFX on/off · O = overview · X = XY pad ·
Esc = close overlays · mouse wheel on faders = ±1 (Shift ±10).

## Tips and known limits

- **No SysEx:** the app cannot read the device state. Effect changes made on
  the device are invisible to it (the device sends nothing) — switch effects
  from the app. Encoder turns on the device do arrive and move the faders.
- **BUS 3/4 silent?** Usually the device's BUS FX setting sits on "Bypass" —
  toggle the bus's EFX pad off/on once (the app does this automatically on
  effect switches). Also check DRY routing and the DSP limit.
- **The app never sends on load** — the stored state is only displayed.
  Align via Setup > "Send state to device" or simply the first gesture per
  control.
- **Demo mode:** without Web MIDI (e.g. iOS Safari) you can explore the UI;
  nothing is sent.

---

404 Busdriver is an unofficial open-source project (MIT license), not
affiliated with or endorsed by Roland Corporation. "SP-404" is a trademark of
Roland Corporation.
