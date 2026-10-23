import { VERSION } from "../core/util.js";

/* The page's side of the Lab engine (public/lab/worker.js): call("fn", args...) returns a promise.
   The worker is started on first use; the wasm (about 1.5 MB over the network) loads then, not with the page. */
let worker = null, seq = 0;
const pending = new Map();
let status = "idle"; /* idle, loading, ready, failed */
const listeners = new Set();
function setStatus(s) { status = s; listeners.forEach((f) => f(s)); }
function start() {
  if (worker) return;
  setStatus("loading");
  worker = new Worker("lab/worker.js?v=" + encodeURIComponent(VERSION));
  worker.onmessage = (e) => {
    const { id, value, error } = e.data;
    if (id === -1) { setStatus("failed"); pending.forEach((p) => p.reject(new Error(error))); pending.clear(); return; }
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (status === "loading") setStatus("ready");
    if (error !== undefined) p.reject(new Error(error)); else p.resolve(value);
  };
  worker.onerror = (e) => { setStatus("failed"); pending.forEach((p) => p.reject(new Error("the engine failed to load"))); pending.clear(); };
}
function call(fn, ...args) {
  start();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    const transfer = args.filter((a) => a instanceof Uint8Array && a.buffer.byteLength === a.byteLength).map((a) => a.buffer);
    worker.postMessage({ id, fn, args }, transfer);
  });
}
const json = async (fn, ...args) => JSON.parse(await call(fn, ...args));
const onStatus = (f) => { listeners.add(f); return () => listeners.delete(f); };
const engineStatus = () => status;
export { call, json, onStatus, engineStatus };
