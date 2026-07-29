# 404 Busdriver

A free, browser-based MIDI controller for the **Roland SP-404 MkII** — a single
HTML file, no installation, no dependencies, no account.

**Live: https://littletools404.github.io/404busdriver/**

## What it does

- Full control of all five effect buses (BUS 1–4 + INPUT): effect selection
  with real parameter names from the reference manual, six touch faders with
  relative drag and fine-tune pull-out, bidirectional sync with the hardware
  encoders.
- **Snapshots** (8 slots) with JSON export/import.
- **XY pad** (Kaoss-style, freely mappable, momentary spring-back) with
  **presets** — curated axis pairs for specific effects (built from real
  parameter names, auto-switches the bus's effect if needed) plus your own
  saved combos — and **four beat-synced LFOs** (incl. random drift), clocked
  by incoming MIDI clock or tap tempo.
- **Play surfaces:** chromatic keyboard (CH 16), scale pads with isometric
  Move-style layout, vocoder keyboard with pitch bend (CH 11), and a pad
  board incl. a freely assignable custom layout.
- **Pattern grid** with a quantized markov autopilot, plus a looper remote.
- **JAM tab:** your own pinned pads/faders — SP-404 bus parameters that stay
  put regardless of the loaded effect, raw MIDI (any channel/CC/Note/PC,
  two-way for CC controls) to any connected device (e.g. a second synth),
  or a captured **bus scene** (a whole bus's state momentarily recalled on
  hold, reverting to whatever was playing on release). Drag to reorder or
  swipe-to-delete in edit mode, multi-select to batch-set a MIDI channel or
  delete several at once, CLEAR to start over. **Presets** add a whole set
  of controls in one tap, built from real MIDI implementation charts (ships
  with an MC-101 4-track × Sound/Filter/Mod/FX template, in the device's own
  knob order).
- **Light/dark theme**, an optional horizontal fader layout for wide
  tablets, and balance-style rotary knobs as an alternative to bars for JAM
  controls, all in Setup.

## Requirements

- SP-404 MkII connected via USB-C.
- A browser with Web MIDI: Chrome or Edge on desktop; on iPhone/iPad use the
  **MIDIWeb Browser** app (iOS browsers cannot do Web MIDI).
- Effect control works in MIDI Mode A and B; pattern switching needs Mode B
  with "PC Rx" ON. Details in the built-in manual (Setup > Handbuch).

Full documentation: [MANUAL.md](MANUAL.md) — also built into the app
(Setup > Manual).

## Privacy

Everything runs locally in your browser. No server, no tracking, no accounts;
settings and snapshots live in your browser's localStorage.

## Disclaimer

This is an unofficial project, not affiliated with or endorsed by Roland
Corporation. "SP-404" is a trademark of Roland Corporation. Effect data is
derived from the publicly available SP-404MK2 reference manual.

## License

MIT — see [LICENSE](LICENSE).
