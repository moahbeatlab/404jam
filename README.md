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
- **XY pad** (Kaoss-style, freely mappable, momentary spring-back) and
  **four beat-synced LFOs** (incl. random drift), clocked by incoming MIDI
  clock or tap tempo.
- **Play surfaces:** chromatic keyboard (CH 16), scale pads with isometric
  Move-style layout, vocoder keyboard with pitch bend (CH 11), and a pad
  board incl. a freely assignable custom layout.
- **Pattern grid** with a quantized markov autopilot, plus a looper remote.

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
