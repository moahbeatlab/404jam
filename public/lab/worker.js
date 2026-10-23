/* The Lab's engine: 404tui's file code as WebAssembly, in a worker so that cutting, rendering and
   zipping never freeze the page. The page sends {id, fn, args}; this answers {id, value} or {id, error}.
   A classic worker (importScripts), served as it is from public/. */
importScripts("wasm_exec.js");
const query = self.location.search; /* ?v=VERSION: a new version loads a new wasm, not a cached one */
let ready;
function start() {
  const go = new Go();
  const url = "lab.wasm" + query;
  const run = (r) => { go.run(r.instance); };
  return WebAssembly.instantiateStreaming(fetch(url), go.importObject).catch(() =>
    /* a server that does not send application/wasm */
    fetch(url).then((r) => r.arrayBuffer()).then((b) => WebAssembly.instantiate(b, go.importObject))
  ).then((r) => { run(r); if (!self.LabGo) throw new Error("the engine did not start"); });
}
ready = start();
self.onmessage = async (e) => {
  const { id, fn, args } = e.data;
  try {
    await ready;
    if (typeof self.LabGo[fn] !== "function") throw new Error("no such function: " + fn);
    const r = self.LabGo[fn](...args);
    if (r && r.error !== undefined && typeof r.error === "string") throw new Error(r.error);
    const transfer = r && r.buffer instanceof ArrayBuffer ? [r.buffer] : [];
    self.postMessage({ id, value: r }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
self.onerror = (m) => self.postMessage({ id: -1, error: String(m) });
