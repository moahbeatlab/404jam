import { onClockByte, onClockOnly } from "./clock.js";
import { defaultCcs, fxDefFor } from "./conv.js";
import { directName, saveState, state } from "./store.js";
import { BUSES, CC_CTRL, CC_FX, CC_SW, RECV_CCS, clamp } from "./util.js";
import { LfoRt } from "../features/lfo.js";
import { blinkTx, showBanner, updateConnUi } from "../ui/banner.js";
import { controls, jamRawUpdateFns, queueSlotRender } from "../ui/controls.js";
import { renderSetup } from "../ui/setup.js";
import { renderBus, updateBusChrome } from "../ui/views.js";

/* ===== 05 MIDI (transport seam: all bytes leave through sendBytes,
        arrive through handleBytes - a future WebSocket bridge plugs in here) ===== */
const Midi = {
  access: null, demo: false,
  echoLog: new Map(), lastSent: new Map(),
  activeCCs: new Set(), /* keys ch<<8|cc currently owned by a finger */
  /* state check tolerant of shims that report undefined instead of "connected" */
  live(p) { return p && p.state !== "disconnected"; },
  out() {
    if (!this.access || !state.midi.outName) return null;
    let found = null;
    this.access.outputs.forEach((p) => { if (!found && p.name === state.midi.outName && this.live(p)) found = p; });
    return found;
  },
  in_() {
    if (!this.access || !state.midi.inName) return null;
    let found = null;
    this.access.inputs.forEach((p) => { if (!found && p.name === state.midi.inName && this.live(p)) found = p; });
    return found;
  },
  /* any currently-connected output by name - lets custom controls (JAM tab)
     target a second device (e.g. an MC-101) simultaneously with the SP-404,
     which stays bound to state.midi.outName via out() as before */
  outByName(name) {
    if (!this.access) return null;
    let found = null;
    this.access.outputs.forEach((p) => { if (!found && p.name === name && this.live(p)) found = p; });
    return found;
  },
  sendBytesTo(portName, bytes) {
    if (this.demo) return true;
    const o = portName ? this.outByName(portName) : this.out();
    if (!o) return false;
    try { o.send(bytes); return true; } catch (e) { return false; }
  },
  sendBytes(bytes) { return this.sendBytesTo(null, bytes); },
  sendPc(ch, pc) {
    const ok = this.sendBytes([0xC0 | ch, pc & 0x7F]);
    if (ok) blinkTx();
    return ok;
  },
  sendNote(ch, note, on, vel) {
    const ok = this.sendBytes(on ? [0x90 | ch, note & 0x7F, vel || 110] : [0x80 | ch, note & 0x7F, 0]);
    if (ok) blinkTx();
    return ok;
  },
  sendBend(ch, v14) { /* 0..16383, center 8192 */
    v14 = clamp(v14 | 0, 0, 16383);
    if (this.sendBytes([0xE0 | ch, v14 & 0x7F, v14 >> 7])) blinkTx();
  },
  send(ch, ccNum, val, force) {
    val = clamp(val | 0, 0, 127);
    const key = ch << 8 | ccNum;
    if (!force && this.lastSent.get(key) === val) return;
    this.lastSent.set(key, val);
    this.echoLog.set(key, { val, t: performance.now() });
    if (this.sendBytes([0xB0 | ch, ccNum, val])) blinkTx();
  },
  /* -To variants: same messages, but routed to an explicit port name
     (null = primary SP-404 output) instead of always the primary port */
  sendToPort(portName, ch, ccNum, val) {
    val = clamp(val | 0, 0, 127);
    /* log to echoLog same as send() - lets applyRawCC recognize this value
       bouncing back from a device that echoes its own incoming CCs, instead
       of misreading it as an external change a moment later */
    this.echoLog.set(ch << 8 | ccNum, { val, t: performance.now() });
    if (this.sendBytesTo(portName, [0xB0 | ch, ccNum, val])) blinkTx();
  },
  sendNoteTo(portName, ch, note, on, vel) {
    if (this.sendBytesTo(portName, on ? [0x90 | ch, note & 0x7F, vel || 110] : [0x80 | ch, note & 0x7F, 0])) blinkTx();
  },
  sendPcTo(portName, ch, pc) {
    if (this.sendBytesTo(portName, [0xC0 | ch, pc & 0x7F])) blinkTx();
  },
  async connect(interactive) {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      if (interactive) showBanner("MIDI access denied - check browser permission", "warn", 5000);
      updateConnUi(); renderSetup();
      return;
    }
    this.access.onstatechange = () => { this.refreshPorts(); };
    this.refreshPorts();
  },
  refreshPorts() {
    if (!this.access) return;
    const outs = [], ins = [];
    this.access.outputs.forEach((p) => { if (this.live(p)) outs.push(p); });
    this.access.inputs.forEach((p) => { if (this.live(p)) ins.push(p); });
    /* auto-match: the SP-404 wins as soon as it shows up - virtual fallback
       ports (e.g. the shim's own MIDIWeb pair) are only kept while the
       device is absent, so stale selections never swallow sends */
    const spOut = outs.find((p) => /sp-?404/i.test(p.name));
    if (spOut && !/sp-?404/i.test(state.midi.outName || "")) state.midi.outName = spOut.name;
    if (!outs.some((p) => p.name === state.midi.outName)) {
      state.midi.outName = spOut ? spOut.name : (outs.length === 1 ? outs[0].name : state.midi.outName);
    }
    const spIn = ins.find((p) => /sp-?404/i.test(p.name));
    if (spIn && !/sp-?404/i.test(state.midi.inName || "")) state.midi.inName = spIn.name;
    if (!ins.some((p) => p.name === state.midi.inName)) {
      const cand = ins.find((p) => p.name === state.midi.outName);
      state.midi.inName = cand ? cand.name : spIn ? spIn.name : (ins.length === 1 ? ins[0].name : state.midi.inName);
    }
    /* bind ALL inputs unconditionally (midimonitor.com pattern - proven to
       receive clock in the iOS shim browsers): selected port gets the full
       handler, every other port is listened to for clock only */
    this.access.inputs.forEach((p) => {
      p.onmidimessage = (p.name === state.midi.inName) ? onMidiMessage : onClockOnly;
    });
    saveState(); updateConnUi(); renderSetup();
  },
};

function onMidiMessage(e) {
  const d = e.data;
  if (!d || !d.length) return;
  const src = (e.target && e.target.name) || "";
  if (window.busdriver && window.busdriver.monitor && d[0] !== 0xF8 && d[0] !== 0xFE)
    console.log("MIDI in:", Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" "));
  /* realtime bytes (clock/start/stop) may arrive alone, batched, or
     interleaved with channel messages (shim browsers do this) - scan all */
  let msg = d, rt = false;
  for (let i = 0; i < d.length; i++) if (d[i] >= 0xF8) { rt = true; onClockByte(d[i], src); }
  if (rt) msg = Array.from(d).filter((b) => b < 0xF8);
  if (msg.length < 3) return;
  const type = msg[0] & 0xF0, ch = msg[0] & 0x0F;
  /* JAM raw controls can be pinned to any channel (e.g. a second device),
     so this check runs independently of the ch<=4/RECV_CCS gate below,
     which is specific to the SP-404's own 5-bus CC set */
  if (type === 0xB0) applyRawCC(ch, msg[1], msg[2]);
  if (type !== 0xB0 || ch > 4 || !RECV_CCS.has(msg[1])) return;
  handleBytes(ch, msg[1], msg[2]);
}
function handleBytes(ch, ccNum, val) {
  const key = ch << 8 | ccNum;
  /* R1: while a finger owns this control, the device never wins */
  if (Midi.activeCCs.has(key)) return;
  /* R2: drop echoes of our own sends (value match within 400 ms) */
  const e = Midi.echoLog.get(key);
  if (e && e.val === val && performance.now() - e.t < 400) return;
  /* R3: device-sourced apply renders only, never re-sends */
  Midi.lastSent.set(key, val); /* device now holds val - keeps send dedupe truthful */
  applyCC(ch, ccNum, val, "device");
}

function applyCC(bus, ccNum, val, source) {
  const b = state.buses[bus];
  if (ccNum === CC_SW) {
    b.on = val >= 64;
    updateBusChrome(bus);
  } else if (ccNum === CC_FX) {
    if (b.fx !== val) fxChange(bus, val, source);
  } else {
    const slot = CC_CTRL.indexOf(ccNum);
    if (slot < 0) return;
    b.cc[slot] = clamp(val, 0, 127);
    queueSlotRender(bus, slot);
    queueSyncSiblings(bus, slot);
  }
  saveState();
}
function queueSyncSiblings(bus, slot) {
  /* a SYNC flip changes sibling displays (msec <-> note values) */
  const def = fxDefFor(BUSES[bus].table, state.buses[bus].fx);
  if (def && def.p[slot] && def.p[slot].n === "SYNC") {
    def.p.forEach((p, i) => { if (p.sv) queueSlotRender(bus, i); });
  }
}

/* incoming CC from ANY connected input, matched against JAM raw controls by
   channel+CC number - applyCC/handleBytes above is the SP-404-specific
   pipeline (bus-indexed, only looks at the primary input's ch 0-4), so a
   second device pinned in JAM (e.g. an MC-101's own hardware knobs on ch
   11-14) needs its own path that scans every connected port instead of
   just the one selected as the primary SP-404 input. */
const jamRawRenderQueue = new Set(); /* cfg.id values needing repaint */
let jamRawFlushReq = 0;
function queueJamRawRender(id) {
  jamRawRenderQueue.add(id);
  if (jamRawFlushReq) return;
  jamRawFlushReq = requestAnimationFrame(() => {
    jamRawFlushReq = 0;
    const q = [...jamRawRenderQueue];
    jamRawRenderQueue.clear();
    q.forEach((rid) => {
      const fns = jamRawUpdateFns.get(rid);
      if (fns) fns.forEach((fn) => { try { fn(); } catch (e) { /* one broken control must never freeze the render loop */ } });
    });
  });
}
function applyRawCC(ch, ccNum, val) {
  const key = ch << 8 | ccNum;
  if (Midi.activeCCs.has(key)) return; /* a finger is dragging this control */
  const e = Midi.echoLog.get(key);
  if (e && e.val === val && performance.now() - e.t < 400) return; /* our own send bouncing back */
  let touched = false;
  state.jam.slots.forEach((cfg) => {
    if (cfg.source === "raw" && cfg.type === "cc" && cfg.ch === ch && cfg.num === ccNum) {
      cfg.val = clamp(val, 0, 127);
      touched = true;
      queueJamRawRender(cfg.id);
    }
  });
  if (touched) saveState();
}

/* ===== effect change sequence (the one deterministic sync point) ===== */
function memKey(table, num) {
  if (table === "bus12" && num >= 1 && num <= 5) {
    const a = directName(num);
    if (a) return "dfx:" + a; /* per assigned effect, not per slot */
  }
  return table + ":" + num;
}
const fxTimers = BUSES.map(() => []);
function fxChange(bus, num, source) {
  const B = BUSES[bus], b = state.buses[bus];
  /* cancel a still-running ctrl push of a previous change (any source) */
  fxTimers[bus].forEach(clearTimeout);
  fxTimers[bus] = [];
  if (b.fx > 0) state.mem[memKey(B.table, b.fx)] = b.cc.slice();
  b.fx = num;
  const def = fxDefFor(B.table, num);
  const saved = state.mem[memKey(B.table, num)];
  b.cc = saved ? saved.slice() : defaultCcs(def);
  LfoRt.forEach((rt, i) => { /* effect switch moved the ground under running LFOs */
    const t = state.lfos[i].target;
    if (rt.on && t && t.bus === bus) rt.center = b.cc[t.slot];
  });
  if (source === "user" && num > 0) {
    const r = state.recents[B.table].filter((n) => n !== num);
    r.unshift(num); state.recents[B.table] = r.slice(0, 6);
  }
  if (source === "user") {
    Midi.send(B.ch, CC_FX, num, true);
    b.cc.forEach((v, i) => fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_CTRL[i], v, true), 5 * (i + 1))));
    if ((bus === 2 || bus === 3) && b.on && num > 0) {
      /* BUS 3/4 can sit in device-side bypass; an OFF->ON cycle re-arms
         them (verified at the device by Martin) */
      fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_SW, 0, true), 42));
      fxTimers[bus].push(setTimeout(() => Midi.send(B.ch, CC_SW, 127, true), 50));
    }
  }
  renderBus(bus);
  saveState();
}

export { Midi, onMidiMessage, handleBytes, applyCC, queueSyncSiblings, jamRawRenderQueue, jamRawFlushReq, queueJamRawRender, applyRawCC, memKey, fxTimers, fxChange };
