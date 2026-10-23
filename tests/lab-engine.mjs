// End-to-end test of the Lab engine (public/lab/lab.wasm) under Node: the same calls the browser's worker makes.
// Run it with: node tests/lab-engine.mjs   (or npm run test:lab)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const dir = process.argv[2] || new URL("../public/lab", import.meta.url).pathname;
globalThis.require = createRequire(import.meta.url);
vm.runInThisContext(fs.readFileSync(dir + "/wasm_exec.js", "utf8"));
const go = new Go();
const { instance } = await WebAssembly.instantiate(fs.readFileSync(dir + "/lab.wasm"), go.importObject);
go.run(instance);
const L = globalThis.LabGo;
let fails = 0, checks = 0;
const t = (name, ok, extra = "") => { checks++; if (!ok) { fails++; console.log("FAIL", name, extra); } };
const call = (fn, ...a) => { const r = L[fn](...a); if (r && r.error) throw new Error(fn + ": " + r.error); return r; };
const j = (fn, ...a) => JSON.parse(call(fn, ...a));
const fails_ = (fn, ...a) => { const r = L[fn](...a); return !!(r && r.error); };

// A WAV: stereo-less sine, 44.1 kHz
function wav(hz, secs, rate = 44100) {
  const n = Math.floor(rate * secs), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * hz) * 20000 * Math.exp(-3 * i / n)), 44 + i * 2);
  return new Uint8Array(b);
}

call("newProject", "WASM TEST");
let m = j("decode", wav(261.63, 0.6), ".wav");
t("decode frames 48k", m.frames === 28800 && m.resampled, JSON.stringify(m));
call("assign", 0, m.id, "Tone");
let info = j("info");
t("info after assign", info.open && info.pads[0].has && info.pads[0].name === "Tone" && info.pads[0].frames === 28800);

// pcm / peaks come back as typed arrays
const pcm = call("pcm", m.id);
t("pcm is Int16Array", pcm instanceof Int16Array && pcm.length === 28800, pcm.constructor.name + pcm.length);
const pk = call("peaks", m.id, 0, 28800, 20);
t("peaks is Int32Array of 20", pk instanceof Int32Array && pk.length === 20 && pk[0] > pk[19]);
t("wav roundtrip", call("wav", m.id) instanceof Uint8Array);

// slicer
let s = j("slicing", "new", "", JSON.stringify({ frames: m.frames, n: 4 }));
t("slicing new", s.slices.length === 4);
s = j("slicing", "divide", JSON.stringify(s), JSON.stringify({ n: 8 }));
t("slicing divide", s.slices.length === 8);
const r = j("render", m.id, JSON.stringify(s), 1, 0);
t("render", r.frames > 28000 && r.placed.length === 8);
call("assign", 1, r.id, "Sliced");
t("slicing error is reported", fails_("slicing", "split", JSON.stringify(s), JSON.stringify({ i: 0, frame: 5 })));
const tr = call("transients", m.id, 8, 0.5);
t("transients typed", tr instanceof Int32Array);

// chords and arps
const consts = j("arpConsts");
t("arp consts", consts.dirs.length === 11 && consts.scales.length >= 6 && consts.progressions.length >= 10);
const kit = j("chordKit", 0, 0, false);
t("chord kit C major", kit.map(c => c.name).join(" ") === "C Dm Em F G Am Bdim");
const base = j("defaultArp");
base.Notes = j("chordNotes", 0, -1, 0, 0);
const vs = j("arpVariants", JSON.stringify(base), 16, 7);
t("16 variants", vs.length === 16 && new Set(vs.map(v => v.name)).size >= 10);
for (let i = 0; i < kit.length; i++) {
  const arp = { ...base, Notes: kit[i].notes, Root: kit[i].notes[0], Dir: 0 };
  const c = j("renderArp", m.id, JSON.stringify(arp));
  call("assign", 16 + i, c.id, kit[i].name);
}
const v0 = j("renderArp", m.id, JSON.stringify(vs[0].arp));
t("arp variant renders", v0.frames === 96000, v0.frames);
call("writeProgression", 1, JSON.stringify({ pads: [16, 17, 18, 19, 20, 21, 22], degrees: [1, 5, 6, 4], bars: 4, rhythm: "3+3+2", velocity: 100 }));
let pat = j("pattern", 1);
t("progression pattern", pat.bars === 4 && pat.notes.length === 20, JSON.stringify(pat.notes.length));

// patterns
call("newPattern", 2, 2);
call("patternOp", 2, "insert", JSON.stringify({ pad: 0, tick: 0, vel: 110, len: 200 }));
call("patternOp", 2, "double", "{}");
pat = j("pattern", 2);
t("pattern doubled", pat.bars === 4 && pat.notes.length === 2);
t("pattern error", fails_("patternOp", 99, "double", "{}"));

// export, reload, compare
const zip = call("exportZip", "PROJECT_01");
t("zip is bytes", zip instanceof Uint8Array && zip.length > 100000, zip.length);
call("reset");
t("reset clears", !j("info").open);
const n = call("loadZip", zip);
info = j("info");
t("reloaded", n === 12 && info.name === "WASM TEST" && info.pads[0].name === "Tone" && info.pads[16].name === "C" && info.patterns.length === 2, JSON.stringify(info.patterns));
t("loadZip garbage fails", fails_("loadZip", new Uint8Array([1, 2, 3])));
const again = call("exportZip", "PROJECT_01");
t("export is stable", again.length === zip.length && Buffer.compare(Buffer.from(again), Buffer.from(zip)) === 0);

// pad sample from project
const ps = j("padSample", 0);
t("padSample", ps.frames === 28800);
t("bad ids fail cleanly", fails_("pcm", 9999) && fails_("assign", 500, 1, "x"));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
