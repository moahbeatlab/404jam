import { call } from "./client.js";

/* Listening in the Lab: a sample is a handle in the engine; its audio comes over once and is kept as an AudioBuffer. */
let ctx = null;
const cache = new Map(); /* handle -> AudioBuffer */
const RATE = 48000;
function context() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE }); }
    catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
/* the handle's audio; meta is {frames, channels} */
async function bufferOf(id, meta) {
  if (cache.has(id)) return cache.get(id);
  const pcm = await call("pcm", id); /* Int16Array, interleaved */
  const ch = Math.max(meta.channels || 1, 1), frames = Math.floor(pcm.length / ch);
  const buf = context().createBuffer(Math.min(ch, 2), Math.max(frames, 1), RATE);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < frames; i++) d[i] = pcm[i * ch + c] / 32768;
  }
  cache.set(id, buf);
  return buf;
}
function forget(id) { cache.delete(id); call("free", id).catch(() => {}); }
const playing = new Set();
/* plays a buffer; returns {stop, startTime, src}; opts: gain, loop, offset (s), onend */
function play(buf, opts = {}) {
  const c = context();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = !!opts.loop;
  const g = c.createGain();
  g.gain.value = opts.gain === undefined ? 0.9 : opts.gain;
  src.connect(g).connect(c.destination);
  const when = opts.when || c.currentTime;
  src.start(when, opts.offset || 0);
  const h = {
    src, startTime: when - (opts.offset || 0), gain: g,
    stop() { try { src.stop(); } catch (e) { /* already stopped */ } playing.delete(h); },
  };
  src.onended = () => { playing.delete(h); if (opts.onend) opts.onend(); };
  playing.add(h);
  return h;
}
function stopAll() { [...playing].forEach((h) => h.stop()); }
const now = () => context().currentTime;
export { context, bufferOf, forget, play, stopAll, now, RATE };
