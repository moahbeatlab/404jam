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
- **Device MIDI mode** ([SHIFT]+[PAD 12] > SYSTEM > MIDI): FX control works in
  mode **A and B**. Pattern switching (PTN) needs mode **B** with
  "PC Rx" = ON. For the pad board, the device setting "Pad MIDI Channels"
  must match the PAD-CH button in the app (default 1/2).
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
PTN (patterns, autopilot, looper). The LEDs in the bus tabs always show which
effects are on.

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

## Overview

All five buses side by side. On iPad/desktop the strips are directly
playable; if the width is tight, pan horizontally (start on a strip header or
effect name). On a phone in portrait you get cards — tap one for its focus
view.

## Choosing effects

Tap the effect name to open the picker: "Recent", "Favorites" (star an entry
by **holding** it), then categories with a jump bar. Note: **the three bus
types have different effect sets** (Roland's spec) — e.g. Sync Delay,
Isolator and Resonator only exist on BUS 3/4, the voice effects only on
INPUT.

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
**Export/Import:** JSON for backups and for moving snapshots between
devices or sharing them.

## XY pad and LFOs

**XY:** both axes freely assignable (bus + control). Absolute Kaoss-style
behavior: position = value. **MOMENTARY** springs both values back to the
pre-touch state on release.

**LFO row:** four modulator slots (chips 1–4; orange dot = running). Per
slot: target, waveform (SIN/TRI/SQR/SAW/**RND** = drift between random
anchors), rate in note values (4/1 to 1/16), depth. The time source shows on
the last button: **CLK** (MIDI clock present) or **TAP** — tap the beat a few
times to set the tempo and anchor the phase. Grabbing the target fader pauses
the LFO and re-centers it on your position; switching it off parks the value
at the center. Slot 4 comes preconfigured as a slow drift.

## PLAY: keys, scale, pads

- **KEYS:** keyboard. Target "SAMPLE CH16" plays the current sample
  chromatically (C2–C4, octave paging on phones). Target "VOCODER CH11"
  plays pitches for the INPUT vocoder — a **pitch-bend strip** appears on the
  right (springs back to center).
- **SCALE:** a 4×4 grid with only in-scale notes. Cycle root (C…B) and scale
  (major, minor, both pentatonics, Dorian, Mixolydian, blues) at the top.
  **ISO** = rows a fourth apart (Move/Push layout, chords as grips),
  **LIN** = continuous. Roots are highlighted. Note: the 404's chromatic mode
  has its own scale/key setting — leave it on chromatic when playing from the
  app.
- **PADS:** the pad board, laid out like the device (pad 1 top left). Banks
  A–J; the **★** tab is a free layout: hold any field to assign it any
  bank+pad combination. "PAD-CH" must match the device setting
  "Pad MIDI Channels" (default 1/2).

## PTN: patterns, autopilot, looper

- **Grid:** pick a bank (A–J), tap a pattern (1–16) — the app sends the
  program change. Needs mode B and "PC Rx" ON; the device does not confirm,
  the highlight marks the last one sent.
- **Autopilot:** wanders markov-style through the patterns — quantized every
  2/4/8 bars (tempo from clock or tap), within the chosen bank or across all.
- **Looper:** remote control for the device's looper mode (REC, OVERDUB,
  DEL, UNDO/REDO, STOP ALL, tempo reset, BPM fader). The device must be in
  looper mode itself.

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
