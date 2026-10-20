import { onClockByte } from "../core/clock.js";
import { fxDefFor, fxNameFor } from "../core/conv.js";
import { Midi } from "../core/midi.js";
import { state } from "../core/store.js";
import { BUSES, CC_CTRL, CC_FX, CC_SW } from "../core/util.js";
import { PAD_ORDER } from "../features/play-view.js";
import { showBanner, updateConnUi } from "../ui/banner.js";
import { SimInfo } from "./info.js";
import { PATTERNS } from "./patterns.js";

/* ===== the demo unit: a pretend SP-404 in the browser. 404jam sends its MIDI bytes here instead of to a port, and this plays
   them with Web Audio: the pads (a small synthesized kit in public/sim/), the chromatic channel (CH16), the 4 buses with
   simple approximations of their effects, program changes (patterns) and a MIDI clock that goes back into the app.
   It is a toy to try the features, not an emulation of the unit. ===== */
const SRC = "Demo unit";
const Sim = { on: false, loading: false, ctx: null, master: null, vol: 0.8, tempo: 92, bankBpm: [92, 90, 124, 140, 92, 92, 92, 92, 92, 92], running: false, cur: null, next: undefined, curId: "", chroma: null, nowStep: -1, kit: [], hooks: new Set(), powerHooks: new Set() };
const pads = new Map(); /* bank*16 + pad -> { buf, name, bus, gate, choke, key } */
const voices = new Set(), held = new Map();
let buses = [];

/* ---- sounds ---- */
async function loadKit() {
  if (pads.size) return;
  const base = document.baseURI;
  const kit = await (await fetch(new URL("sim/kit.json", base))).json();
  Sim.kit = kit.kit;
  await Promise.all(kit.kit.map(async (k) => {
    const raw = await (await fetch(new URL("sim/" + k.file, base))).arrayBuffer();
    const buf = await Sim.ctx.decodeAudioData(raw);
    pads.set(k.bank * 16 + k.pad, { buf, name: k.name, bus: k.bus, gate: k.gate, choke: k.choke, key: k.key, bank: k.bank, pad: k.pad });
  }));
}
function release(v, t) {
  const now = Sim.ctx.currentTime;
  try { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + t); v.src.stop(now + t + 0.02); } catch (e) { /* already stopped */ }
}
function play(item, vel, rate) {
  const ctx = Sim.ctx;
  if (item.choke) voices.forEach((v) => { if (v.item.choke === item.choke) release(v, 0.01); });
  while (voices.size >= 40) release(voices.values().next().value, 0.02), voices.delete(voices.values().next().value);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = item.buf; src.playbackRate.value = rate || 1;
  g.gain.value = Math.pow(vel / 127, 1.3);
  src.connect(g); g.connect(buses[item.bus] ? buses[item.bus].input : Sim.master);
  const v = { src, g, item };
  voices.add(v);
  src.onended = () => voices.delete(v);
  src.start();
  return v;
}

/* ---- the 4 buses and simple stand-ins for their effects ---- */
function iRev(ctx) {
  const n = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return b;
}
const FX = {
  filter(ctx) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; return { in: f, out: f, set: (c) => { f.frequency.value = 80 * Math.pow(150, c[0] / 127); f.Q.value = 0.5 + (c[1] / 127) * 12; } }; },
  lofi(ctx) {
    const f = ctx.createBiquadFilter(), w = ctx.createWaveShaper(); f.type = "lowpass"; f.connect(w);
    return { in: f, out: w, set: (c) => { f.frequency.value = 600 * Math.pow(20, c[0] / 127); const L = Math.pow(2, 12 - (c[1] / 127) * 8), cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) cv[i] = Math.round(((i / 1023.5) - 1) * L) / L; w.curve = cv; } };
  },
  drive(ctx) {
    const w = ctx.createWaveShaper(), f = ctx.createBiquadFilter(), o = ctx.createGain(); f.type = "lowpass"; w.connect(f); f.connect(o);
    return { in: w, out: o, set: (c) => { const k = 1 + (c[0] / 127) * 30, cv = new Float32Array(2048); for (let i = 0; i < 2048; i++) cv[i] = Math.tanh(k * ((i / 1023.5) - 1)) / Math.tanh(k); w.curve = cv; f.frequency.value = 2500 + (c[1] / 127) * 9000; o.gain.value = 0.7; } };
  },
  mod(ctx) {
    const i = ctx.createGain(), o = ctx.createGain(), d = ctx.createDelay(0.05), wet = ctx.createGain(), lfo = ctx.createOscillator(), dep = ctx.createGain();
    d.delayTime.value = 0.014; lfo.connect(dep); dep.connect(d.delayTime); lfo.start();
    i.connect(o); i.connect(d); d.connect(wet); wet.connect(o);
    return { in: i, out: o, set: (c) => { lfo.frequency.value = 0.2 + (c[0] / 127) * 5; dep.gain.value = (c[1] / 127) * 0.006; wet.gain.value = 0.2 + (c[2] / 127) * 0.8; }, stop: () => lfo.stop() };
  },
  delay(ctx) {
    const i = ctx.createGain(), o = ctx.createGain(), d = ctx.createDelay(1.5), fb = ctx.createGain(), tone = ctx.createBiquadFilter(), wet = ctx.createGain();
    tone.type = "lowpass"; tone.frequency.value = 3500;
    i.connect(o); i.connect(d); d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(wet); wet.connect(o);
    return { in: i, out: o, set: (c) => { d.delayTime.value = 0.06 + (c[0] / 127) * 0.7; fb.gain.value = (c[1] / 127) * 0.85; wet.gain.value = 0.15 + (c[2] / 127) * 0.7; } };
  },
  reverb(ctx) {
    const i = ctx.createGain(), o = ctx.createGain(), cv = ctx.createConvolver(), damp = ctx.createBiquadFilter(), wet = ctx.createGain();
    cv.buffer = iRev(ctx); damp.type = "lowpass";
    i.connect(o); i.connect(damp); damp.connect(cv); cv.connect(wet); wet.connect(o);
    return { in: i, out: o, set: (c) => { damp.frequency.value = 1500 + (c[1] / 127) * 9000; wet.gain.value = 0.2 + (c[2] / 127) * 0.9; } };
  },
};
function fxKind(bus, num) {
  const def = fxDefFor(BUSES[bus].table, num);
  if (!def) return null;
  const name = fxNameFor(BUSES[bus].table, num);
  if (/reverb/i.test(name)) return "reverb";
  if (/delay|echo|dly/i.test(name)) return "delay";
  return ({ filter: "filter", lofi: "lofi", drive: "drive", mod: "mod", delayverb: "delay" })[def.c] || null; /* the glitch/voice/direct effects pass the sound through */
}
function rewire(i) {
  const b = buses[i];
  b.input.disconnect();
  if (b.chain) { try { b.chain.out.disconnect(); } catch (e) { /* ignore */ } if (b.chain.stop) b.chain.stop(); b.chain = null; }
  const kind = b.on ? fxKind(i, b.fx) : null;
  if (kind) {
    b.chain = FX[kind](Sim.ctx);
    b.chain.set(b.cc);
    b.input.connect(b.chain.in); b.chain.out.connect(b.out);
  } else b.input.connect(b.out);
  b.kind = kind;
}
function buildBuses() {
  buses = BUSES.slice(0, 4).map((B, i) => {
    const sb = state.buses[i];
    const b = { input: Sim.ctx.createGain(), out: Sim.ctx.createGain(), on: !!sb.on, fx: sb.fx, cc: sb.cc.slice(), chain: null, kind: null };
    b.out.connect(Sim.master);
    return b;
  });
  buses.forEach((_, i) => rewire(i));
}

/* ---- bytes from the app ---- */
function padFor(ch, note) {
  const pair = state.play.padChPair, half = ch - pair;
  if (half !== 0 && half !== 1) return null;
  const idx = note - 12;
  if (idx < 0 || idx >= 80) return null;
  return pads.get((half * 5 + Math.floor(idx / 16)) * 16 + PAD_ORDER[idx % 16]) || null;
}
function receive(bytes) {
  if (!Sim.on || !Sim.ctx) return;
  if (bytes[0] === 0xFC) { stopTransport(); return; } /* MIDI Stop / Start from the app */
  if (bytes[0] === 0xFA) { startTransport(); return; }
  const st = bytes[0] & 0xF0, ch = bytes[0] & 0x0F;
  if (st === 0x90 && bytes[2] > 0) {
    const key = ch + ":" + bytes[1], vel = bytes[2];
    if (ch === 15) { /* chromatic: pitches the sample tapped last, C3 = its own pitch */
      if (!Sim.chroma) return;
      if (held.has(key)) release(held.get(key), 0.03);
      held.set(key, play(Sim.chroma, vel, Math.pow(2, (bytes[1] - 48) / 12)));
      return;
    }
    const item = padFor(ch, bytes[1]);
    if (!item) return;
    Sim.chroma = item;
    held.set(key, play(item, vel));
    Sim.hooks.forEach((f) => f());
  } else if (st === 0x80 || st === 0x90) {
    const key = ch + ":" + bytes[1], v = held.get(key);
    if (v && v.item.gate) release(v, 0.12);
    held.delete(key);
  } else if (st === 0xC0) {
    const pat = PATTERNS[ch] && PATTERNS[ch][bytes[1]];
    const sel = { pat: pat || null, id: String.fromCharCode(65 + ch) + (bytes[1] + 1) };
    if (!Sim.running) { Sim.cur = sel.pat; Sim.curId = sel.id; useBankTempo(); startTransport(); } else Sim.next = sel;
    Sim.hooks.forEach((f) => f());
  } else if (st === 0xB0 && ch < 4) {
    const b = buses[ch], cc = bytes[1], val = bytes[2];
    if (cc === CC_SW) { b.on = val >= 64; rewire(ch); }
    else if (cc === CC_FX) { b.fx = val; b.cc = state.buses[ch].cc.slice(); rewire(ch); }
    else { const k = CC_CTRL.indexOf(cc); if (k >= 0) { b.cc[k] = val; if (b.chain) b.chain.set(b.cc); } }
  }
}

/* ---- the clock and the patterns ---- */
let timer = null, sp = 0, acc = 0, last = 0;
function pulse() {
  onClockByte(0xF8, SRC);
  if (sp % 96 === 0 && Sim.next !== undefined) { Sim.cur = Sim.next.pat; Sim.curId = Sim.next.id; Sim.next = undefined; useBankTempo(); Sim.hooks.forEach((f) => f()); }
  if (sp % 6 === 0) {
    const i = (sp / 6) % 16;
    Sim.nowStep = i;
    if (Sim.cur) Sim.cur.steps[i].forEach((e) => { const it = pads.get(e.bank * 16 + e.pad); if (it) play(it, e.vel); });
  }
  sp++;
}
function startTransport() {
  if (Sim.running) return;
  if (!Sim.cur && Sim.next === undefined) { Sim.cur = PATTERNS[0][0]; Sim.curId = "A1"; }
  Sim.running = true; sp = 0; acc = 0; last = performance.now();
  onClockByte(0xFA, SRC);
  timer = setInterval(() => {
    const now = performance.now(), per = 60000 / Sim.tempo / 24;
    acc += now - last; last = now;
    while (acc >= per) { acc -= per; pulse(); }
  }, 8);
  Sim.hooks.forEach((f) => f());
}
function stopTransport() {
  if (!Sim.running) return;
  clearInterval(timer); timer = null; Sim.running = false; Sim.nowStep = -1;
  onClockByte(0xFC, SRC);
  Sim.hooks.forEach((f) => f());
}
/* every bank has its own tempo (the unit keeps one per pattern; here one per bank): a pattern of the bank brings it, the +/- changes it for the bank of the pattern that plays */
const bankIx = () => Math.max(0, "ABCDEFGHIJ".indexOf((Sim.curId || "A")[0]));
function useBankTempo() { Sim.tempo = Sim.bankBpm[bankIx()]; }
function setTempo(bpm) { Sim.tempo = Math.max(60, Math.min(180, Math.round(bpm))); Sim.bankBpm[bankIx()] = Sim.tempo; Sim.hooks.forEach((f) => f()); }
function setVolume(v) { Sim.vol = v; if (Sim.master) Sim.master.gain.value = v; }

async function enable() {
  if (Sim.on || Sim.loading) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { showBanner("This browser has no Web Audio", "warn", 4000); return; }
  Sim.loading = true; Sim.hooks.forEach((f) => f());
  try {
    if (!Sim.ctx) {
      Sim.ctx = new AC();
      const comp = Sim.ctx.createDynamicsCompressor();
      Sim.master = Sim.ctx.createGain(); Sim.master.gain.value = Sim.vol;
      Sim.master.connect(comp); comp.connect(Sim.ctx.destination);
    }
    await Promise.race([Sim.ctx.resume(), new Promise((r) => setTimeout(r, 1500))]); /* pending without a tap: it starts at the first one */
    await loadKit();
    buildBuses();
    Midi.demo = true; Midi.simHandler = receive;
    if (window.busdriver) window.busdriver.sim = Sim; /* for tests in the console */
    Sim.on = true;
    SimInfo.on = true;
    SimInfo.pad = (b, p) => { const x = pads.get(b * 16 + p); return x ? x.name : null; };
    SimInfo.pat = (b, pc) => (PATTERNS[b] && PATTERNS[b][pc] ? PATTERNS[b][pc].name : null);
    SimInfo.chroma = () => (Sim.chroma ? "ABCDEFGHIJ"[Sim.chroma.bank] + Sim.chroma.pad + " " + Sim.chroma.name : null);
    showBanner("Demo unit on: sounds and patterns 1–8 on banks A to D", "info", 4500);
  } catch (e) {
    showBanner("Demo unit: could not load the sounds (" + (e && e.message || e) + ")", "warn", 6000);
  }
  Sim.loading = false;
  updateConnUi(); Sim.hooks.forEach((f) => f()); Sim.powerHooks.forEach((f) => f());
}
function disable() {
  if (!Sim.on) return;
  stopTransport();
  voices.forEach((v) => release(v, 0.02)); voices.clear(); held.clear();
  Sim.on = false; SimInfo.on = false; Midi.demo = false; Midi.simHandler = null;
  Sim.ctx.suspend();
  updateConnUi(); Sim.hooks.forEach((f) => f()); Sim.powerHooks.forEach((f) => f());
}
export { Sim, enable, disable, receive, startTransport, stopTransport, setTempo, setVolume, pads };
