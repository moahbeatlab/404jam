import { el } from "../core/util.js";
import { call, json } from "./client.js";
import { L, say, changed, dropAllPads, onChange, freePads, BANKS, padLabel } from "./state.js";
import { btn, row, note, head, ask, sheet } from "./ui.js";
import * as store from "./persist.js";

/* PROJECT: open a project (a zip, or the folder from the SD card), start a new one, download the result */
const dlName = () => (L.info && L.info.name ? L.info.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "PROJECT" : "PROJECT");
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type: type || "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());
const isAudio = (n) => /\.(wav|wave|aif|aiff|flac|mp3|smp)$/i.test(n);
const extOf = (n) => (n.match(/\.[A-Za-z0-9]+$/) || [""])[0].toLowerCase();
const stem = (n) => n.replace(/\.[^.]+$/, "").replace(/^.*[\\/]/, "");

async function openFiles(files) {
  files = [...files];
  if (!files.length) return;
  say("Reading " + files.length + (files.length === 1 ? " file…" : " files…"));
  try {
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    if (zips.length === 1 && files.length === 1) {
      const n = await call("loadZip", await bytesOf(zips[0]));
      say("Opened " + zips[0].name + " (" + n + " files)");
    } else {
      await call("begin");
      let n = 0;
      for (const f of files) {
        const p = f.webkitRelativePath || f.name;
        if (/(^|\/)\._|\.DS_Store$/.test(p)) continue;
        /* big sample files are the point: read each one, hand it over, let go of it */
        await call("add", p, await bytesOf(f));
        n++;
      }
      const kept = await call("finish");
      say("Opened the folder (" + kept + " of " + n + " files are part of the project)");
    }
    dropAllPads();
    await changed();
    L.view = "pads";
    (await import("./lab.js")).show("pads");
  } catch (e) {
    say(String(e.message || e), "err");
  }
}
function pickFiles(opts) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    if (opts.accept) inp.accept = opts.accept;
    if (opts.multiple) inp.multiple = true;
    if (opts.folder) inp.webkitdirectory = true;
    inp.style.display = "none";
    inp.addEventListener("change", () => { resolve([...inp.files]); inp.remove(); });
    inp.addEventListener("cancel", () => { resolve([]); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
/* audio files onto free pads, from the selected pad on (used here and by PADS) */
async function addAudio(files, startPad) {
  files = files.filter((f) => isAudio(f.name));
  if (!files.length) { say("No audio files there (wav, aiff, flac, mp3).", "err"); return; }
  const pads = freePads(startPad, files.length);
  if (pads.length < files.length) say("Only " + pads.length + " free pads from " + padLabel(startPad) + " on: the rest are left out.", "err");
  let done = 0;
  const touched = [];
  for (let i = 0; i < Math.min(files.length, pads.length); i++) {
    const f = files[i];
    try {
      say("Adding " + f.name + " (" + (i + 1) + "/" + files.length + ")…");
      const m = await json("decode", await bytesOf(f), extOf(f.name));
      await call("assign", pads[i], m.id, stem(f.name).slice(0, 23));
      await call("free", m.id);
      touched.push(pads[i]); done++;
    } catch (e) { say(f.name + ": " + (e.message || e), "err"); }
  }
  await changed({ pads: touched });
  if (done) say("Added " + done + (done === 1 ? " sample" : " samples") + " from " + padLabel(touched[0]) + " on.");
}

function build(host) {
  const root = el("div", "lb-scroll");
  host.appendChild(root);
  async function render() {
    root.textContent = "";
    const info = L.info;
    if (!info || !info.open) {
      root.appendChild(head("Open or start a project"));
      root.appendChild(note("Prepare a project for the SP-404MKII right here: no unit and no account needed. Everything stays in this browser; nothing is uploaded."));
      root.appendChild(row("lb-col",
        btn("OPEN A ZIP OF A PROJECT", "go", async () => openFiles(await pickFiles({ accept: ".zip,application/zip" }))),
        btn("OPEN A PROJECT FOLDER", "", async () => openFiles(await pickFiles({ folder: true }))),
        btn("NEW EMPTY PROJECT", "", async () => {
          const name = await ask("Name of the project", "MY PROJECT", 31);
          if (name === null) return;
          await call("reset"); await call("newProject", name || "MY PROJECT");
          dropAllPads(); await changed(); L.view = "pads"; (await import("./lab.js")).show("pads");
        })));
      root.appendChild(note("On the SD card a project is the folder ROLAND/SP-404MKII/PROJECT_01 (and _02 …): PADCONF.BIN with the folders SMPL and PTN. Zip that folder, or pick it here. The unit must not be using the card while you copy."));
      const last = await store.load();
      if (last) {
        root.appendChild(head("Continue where you left off"));
        const when = new Date(last.at).toLocaleString();
        root.appendChild(btn("RESTORE " + last.name + " (" + when + ")", "", async () => {
          try { await call("loadZip", new Uint8Array(last.zip)); dropAllPads(); await changed(); L.view = "pads"; (await import("./lab.js")).show("pads"); }
          catch (e) { say(String(e.message || e), "err"); }
        }));
      }
      return;
    }
    root.appendChild(head(info.name));
    const used = info.pads.filter((p) => p.has).length;
    root.appendChild(note(used + " of 160 pads have a sample · " + info.patterns.length + " patterns · tempo " + info.tempo + " BPM"));
    root.appendChild(row("lb-col",
      btn("RENAME PROJECT", "", async () => {
        const n = await ask("Name of the project (31 characters)", info.name, 31);
        if (n) { await call("setName", n); await changed(); }
      }),
      btn("PROJECT TEMPO: " + info.tempo + " BPM", "", async () => {
        const t = await ask("Project tempo (20 to 300 BPM)", String(info.tempo), 6);
        if (t === null) return;
        try { await call("setTempo", parseFloat(t)); await changed(); } catch (e) { say(String(e.message || e), "err"); }
      })));
    root.appendChild(head("Add audio files"));
    root.appendChild(note("Each file goes on the next free pad from the selected pad (" + padLabel(L.pad) + "), converted to 48 kHz 16 bit."));
    root.appendChild(btn("ADD AUDIO FILES…", "", async () => addAudio(await pickFiles({ accept: "audio/*,.wav,.aif,.aiff,.flac,.mp3,.smp", multiple: true }), L.pad)));
    root.appendChild(head("Download"));
    const slot = el("select", "lb-select");
    for (let i = 1; i <= 16; i++) { const o = el("option", "", "PROJECT_" + String(i).padStart(2, "0")); o.value = o.textContent; slot.appendChild(o); }
    root.appendChild(row("", el("span", "lb-note", "Folder name:"), slot));
    root.appendChild(btn("DOWNLOAD PROJECT AS ZIP", "go", async () => {
      try {
        say("Packing…");
        const zip = await call("exportZip", slot.value);
        download(zip, dlName() + "-" + slot.value + ".zip", "application/zip");
        say("Downloaded. Unzip it and copy the folder " + slot.value + " to ROLAND/SP-404MKII/ on the SD card (it replaces that project).");
      } catch (e) { say(String(e.message || e), "err"); }
    }));
    root.appendChild(note("Not tested on a real SP-404MKII yet: keep a backup of the project folder before you copy this one over it."));
    root.appendChild(head("Close"));
    root.appendChild(btn("CLOSE THIS PROJECT", "warn", async () => {
      const i = await sheet("Close the project? Unsaved work is lost unless you downloaded it.", ["Close project", "Keep it open"]);
      if (i !== 0) return;
      await call("reset"); await store.clear(); dropAllPads(); await changed(); render();
    }));
  }
  const off = onChange(() => { if (L.view === "project") render(); });
  return { root, show() { render(); }, off };
}
export { build, pickFiles, addAudio, download, bytesOf, extOf, stem, isAudio };
