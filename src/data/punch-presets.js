/* Punch presets: a pack is an idea with 4 variations, one for each PUNCH snapshot (1 gentle ... 4 extreme or odd).
   Each variation lists buses as [bus 0-3, effect, { PARAM: value }] with the values as the unit prints them
   (%, Hz, ms, dB, enum names such as "1/8D"); what is not named keeps the effect's own default.
   Buses 1+2 use the BUS 1/2 effect list, buses 3+4 the BUS 3/4 list (src/data/effects-db.js). */
const V = (name, ...b) => ({ name, b });
export const PUNCH_PRESETS = [
  { name: "RISER", note: "high-pass filter opens, big hall", v: [
    V("FILTER UP", [0, "Super Filter", { CUTOFF: 70, RESONANCE: 45, "FLT TYPE": "HPF" }]),
    V("HALL WASH", [2, "Reverb", { TYPE: "HALL2", TIME: 85, LEVEL: 75, "LOW CUT": "315" }]),
    V("BOTH", [0, "Super Filter", { CUTOFF: 75, RESONANCE: 50, "FLT TYPE": "HPF" }], [2, "Reverb", { TYPE: "HALL2", TIME: 90, LEVEL: 85, "LOW CUT": "315" }]),
    V("BLOW OUT", [0, "Super Filter", { CUTOFF: 90, RESONANCE: 70, "FLT TYPE": "HPF" }], [2, "Reverb", { TYPE: "HALL2", TIME: 100, LEVEL: 100, "LOW CUT": "400" }], [3, "Sync Delay", { TIME: "1/8D", FEEDBACK: 85, LEVEL: 100 }]),
  ] },
  { name: "TAPE", note: "warm cassette to dead lo-fi", v: [
    V("WARM", [0, "Cassette Sim", { TONE: 45, HISS: 10, AGE: 15, DRIVE: 40, "WOW FLUT": 25 }]),
    V("WORN", [0, "Cassette Sim", { TONE: 40, HISS: 35, AGE: 40, DRIVE: 55, "WOW FLUT": 70 }], [2, "Lo-fi", { "PRE FILT": 2, "LOFI TYPE": 4, TONE: -20, CUTOFF: "4000", BALANCE: "40:60", LEVEL: 80 }]),
    V("WOBBLY", [0, "Cassette Sim", { TONE: 35, HISS: 20, AGE: 50, "WOW FLUT": 95 }], [1, "Chorus", { DEPTH: 60, BALANCE: "50:50" }]),
    V("DEAD TAPE", [0, "Cassette Sim", { TONE: 15, HISS: 60, AGE: 60, DRIVE: 70, "WOW FLUT": 80 }], [2, "Lo-fi", { "LOFI TYPE": 6, CUTOFF: "1250", BALANCE: "20:80", LEVEL: 80 }]),
  ] },
  { name: "ECHO THROW", note: "slap, tape, dotted and endless echoes", v: [
    V("SLAP", [0, "Tape Echo", { TIME: 110, FEEDBACK: 20, LEVEL: 70, MODE: "S" }]),
    V("LONG TAPE", [0, "Tape Echo", { TIME: 375, FEEDBACK: 78, LEVEL: 100, MODE: "S+M", "W/F RATE": 30, "W/F DEPTH": 30 }]),
    V("DOTTED", [2, "SX Delay", { TIME: "1/8D", FEEDBACK: 65, BALANCE: "60:40" }]),
    V("ENDLESS", [0, "Tape Echo", { TIME: 300, FEEDBACK: 99, LEVEL: 100 }], [2, "Sync Delay", { TIME: "1/4D", FEEDBACK: 90, LEVEL: 100 }], [3, "Reverb", { TYPE: "HALL2", TIME: 80, LEVEL: 70 }]),
  ] },
  { name: "STUTTER", note: "scatter, loop and glitch", v: [
    V("SCATTER", [0, "Scatter", { TYPE: 2, DEPTH: "40", SCATTER: "ON", SPEED: "SINGLE" }]),
    V("DOUBLE", [0, "Scatter", { TYPE: 5, DEPTH: "100", SCATTER: "ON", SPEED: "DOUBLE" }]),
    V("LOOPER", [3, "DJFX Looper", { LENGTH: 0.06, SPEED: 0, "LOOP SW": "ON" }]),
    V("GLITCH", [0, "Scatter", { TYPE: 8, DEPTH: "80", SCATTER: "ON", SPEED: "DOUBLE" }], [1, "Crusher", { FILTER: 5000, RATE: 70, BALANCE: "20:80" }]),
  ] },
  { name: "TAPE STOP", note: "the sound winds down", v: [
    V("SLOW", [0, "Stopper", { DEPTH: 90, RATE: "1/2", RESONANCE: 30, "FLT MOD": 60, "AMP MOD": 60 }]),
    V("FAST", [0, "Stopper", { DEPTH: 100, RATE: "1/8", RESONANCE: 20, "FLT MOD": 40, "AMP MOD": 80 }]),
    V("BACKSPIN", [1, "Back Spin", { LENGTH: "1/2", SPEED: 70, "BACK SW": "ON" }]),
    V("STOP + HALL", [0, "Stopper", { DEPTH: 100, RATE: "1/4", RESONANCE: 50, "FLT MOD": 70, "AMP MOD": 50 }], [2, "Reverb", { TYPE: "HALL2", TIME: 90, LEVEL: 80 }]),
  ] },
  { name: "TELEPHONE", note: "band-pass, grit and radio", v: [
    V("BAND-PASS", [0, "Super Filter", { CUTOFF: 60, RESONANCE: 55, "FLT TYPE": "BPF" }]),
    V("GRITTY", [0, "Super Filter", { CUTOFF: 60, RESONANCE: 55, "FLT TYPE": "BPF" }], [2, "Overdrive", { DRIVE: 40, TONE: 20, BALANCE: "30:70", LEVEL: 80 }]),
    V("RADIO", [0, "Super Filter", { CUTOFF: 55, RESONANCE: 40, "FLT TYPE": "BPF" }], [2, "Lo-fi", { "LOFI TYPE": 3, CUTOFF: "3150", BALANCE: "30:70", LEVEL: 80 }]),
    V("WALKIE", [0, "Super Filter", { CUTOFF: 65, RESONANCE: 70, "FLT TYPE": "BPF" }], [1, "Distortion", { DRIVE: 65, TONE: 10, BALANCE: "20:80", LEVEL: 70 }]),
  ] },
  { name: "FILTER", note: "low-pass, high-pass, resonance, wah", v: [
    V("LOW CLOSE", [0, "Super Filter", { CUTOFF: 25, RESONANCE: 40, "FLT TYPE": "LPF" }]),
    V("HIGH THIN", [0, "Super Filter", { CUTOFF: 70, RESONANCE: 35, "FLT TYPE": "HPF" }]),
    V("RESONANT", [0, "Super Filter", { CUTOFF: 35, RESONANCE: 88, "FLT TYPE": "LPF" }]),
    V("AUTO WAH", [1, "Wah", { PEAK: 70, MANUAL: 45, DEPTH: 85, "FLT TYPE": "BPF" }]),
  ] },
  { name: "DUB", note: "echo and space, from dry to drowned", v: [
    V("DUB ECHO", [0, "Tape Echo", { TIME: 300, FEEDBACK: 70, LEVEL: 80, MODE: "S+M" }]),
    V("SPACE", [2, "Reverb", { TYPE: "HALL2", TIME: 85, LEVEL: 70, "LOW CUT": "200" }], [3, "Sync Delay", { TIME: "1/4D", FEEDBACK: 60, LEVEL: 70 }]),
    V("TAPE DUB", [0, "Tape Echo", { TIME: 420, FEEDBACK: 82, LEVEL: 90, MODE: "S+L" }], [1, "Cassette Sim", { TONE: 35, HISS: 15, AGE: 30, "WOW FLUT": 45 }], [2, "SX Reverb", { TIME: 70, TONE: -20, BALANCE: "60:40" }]),
    V("DROWN", [0, "Tape Echo", { TIME: 380, FEEDBACK: 92, LEVEL: 100, MODE: "S+M+L" }], [2, "Reverb", { TYPE: "HALL2", TIME: 100, LEVEL: 100, "LOW CUT": "125" }], [3, "Sync Delay", { TIME: "1/2", FEEDBACK: 88, LEVEL: 100 }]),
  ] },
  { name: "CRUSH", note: "bits, vinyl, crunch", v: [
    V("VINYL", [0, "404 VinylSim", { FREQUENCY: 60, NOISE: 40, "WOW FLUT": 35 }]),
    V("CRUSHED", [1, "Crusher", { FILTER: 6500, RATE: 55, BALANCE: "30:70" }]),
    V("8-BIT", [1, "Crusher", { FILTER: 3000, RATE: 85, BALANCE: "0:100" }]),
    V("TOASTED", [1, "Crusher", { FILTER: 2500, RATE: 90, BALANCE: "0:100" }], [2, "Lo-fi", { "LOFI TYPE": 8, CUTOFF: "2000", BALANCE: "0:100", LEVEL: 80 }], [0, "404 VinylSim", { FREQUENCY: 40, NOISE: 70, "WOW FLUT": 60 }]),
  ] },
  { name: "SWIRL", note: "phaser, flanger, chorus, tremolo", v: [
    V("PHASER", [1, "Phaser", { DEPTH: 65, MANUAL: 50, RESONANCE: 45, BALANCE: "50:50" }]),
    V("JET", [1, "Flanger", { DEPTH: 70, MANUAL: 40, RESONANCE: 70, BALANCE: "50:50" }]),
    V("CHORUS", [1, "Chorus", { DEPTH: 70, BALANCE: "50:50", LEVEL: 100 }]),
    V("TREMOLO", [1, "Tremolo/Pan", { DEPTH: 85, TYPE: "TRE", WAVE: "SQR" }]),
  ] },
  { name: "DRIVE", note: "from warm saturation to destroyed", v: [
    V("WARM", [1, "WrmSaturator", { DRIVE: 12, "Eq LOW": 3, LEVEL: 85 }]),
    V("CRUNCH", [1, "Overdrive", { DRIVE: 55, TONE: 15, BALANCE: "20:80", LEVEL: 75 }]),
    V("FUZZ", [1, "Distortion", { DRIVE: 80, TONE: -10, BALANCE: "10:90", LEVEL: 65 }]),
    V("DESTROY", [1, "Distortion", { DRIVE: 100, TONE: 30, BALANCE: "0:100", LEVEL: 60 }], [2, "Filter+Drive", { CUTOFF: 6000, RESONANCE: 50, DRIVE: 90, "FLT TYPE": "LPF" }]),
  ] },
  { name: "PITCH", note: "octaves, fifths and detune", v: [
    V("OCTAVE UP", [1, "Chromatic PS", { PITCH1: 12, PITCH2: 0, BALANCE: "50:50" }]),
    V("OCTAVE DOWN", [1, "Chromatic PS", { PITCH1: -12, PITCH2: 0, BALANCE: "50:50" }]),
    V("POWER", [1, "Chromatic PS", { PITCH1: 7, PITCH2: 12, PAN1: "L20", PAN2: "R20", BALANCE: "60:40" }]),
    V("DETUNE", [1, "Chromatic PS", { PITCH1: -0.2, PITCH2: 0.2, PAN1: "L40", PAN2: "R40", BALANCE: "50:50" }]),
  ] },
  { name: "CHOP", note: "slicer and trem: gate the sound", v: [
    V("SLOW CHOP", [1, "Slicer", { PATTERN: 3, DEPTH: 85 }]),
    V("FAST CHOP", [1, "Slicer", { PATTERN: 9, DEPTH: 95 }]),
    V("SHUFFLE", [1, "Slicer", { PATTERN: 14, DEPTH: 100, SHUFFLE: 60 }]),
    V("TRANCE GATE", [1, "Tremolo/Pan", { DEPTH: 100, TYPE: "TRE", WAVE: "SQR" }], [2, "Reverb", { TYPE: "ROOM", TIME: 50, LEVEL: 50 }]),
  ] },
  { name: "ISOLATE", note: "break down: keep one band", v: [
    V("NO BASS", [2, "Isolator", { LOW: -42, MID: 0, HIGH: 0 }]),
    V("BASS ONLY", [2, "Isolator", { LOW: 0, MID: -42, HIGH: -42 }]),
    V("MIDS", [2, "Isolator", { LOW: -42, MID: 3, HIGH: -42 }]),
    V("AIR", [2, "Isolator", { LOW: -42, MID: -42, HIGH: 6 }], [3, "Reverb", { TYPE: "HALL2", TIME: 70, LEVEL: 50 }]),
  ] },
];
