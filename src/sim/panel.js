import { $, el } from "../core/util.js";
import { BANK_NAMES } from "../features/pattern-grid.js";
import { PATTERNS } from "./patterns.js";
import { Sim, disable, enable, setTempo, setVolume, startTransport, stopTransport } from "./engine.js";

/* the panel of the demo unit: power, play/stop, tempo, volume, and what is on the pads */
let built = false;
function build() {
  if (built) return;
  built = true;
  $("sim-close").addEventListener("click", () => $("sim").classList.remove("open"));
  $("sim").addEventListener("pointerdown", (e) => { if (e.target === $("sim")) $("sim").classList.remove("open"); });
  $("sim-power").addEventListener("click", () => (Sim.on ? disable() : enable()));
  $("sim-play").addEventListener("click", () => (Sim.running ? stopTransport() : startTransport()));
  $("sim-tdown").addEventListener("click", () => setTempo(Sim.tempo - 1));
  $("sim-tup").addEventListener("click", () => setTempo(Sim.tempo + 1));
  $("sim-vol").addEventListener("input", (e) => setVolume(e.target.value / 100));
  Sim.hooks.add(render);
}
function kitText() {
  const by = [[], []];
  Sim.kit.forEach((k) => by[k.bank].push(k.pad + " " + k.name + (k.key && k.key !== "C" ? " (" + k.key + ")" : "")));
  return BANK_NAMES.slice(0, 2).map((n, i) => n + ": " + by[i].join(" · ")).join("\n");
}
function render() {
  if (!built || !$("sim").classList.contains("open")) return;
  const p = $("sim-power");
  p.textContent = Sim.loading ? "LOADING SOUNDS…" : Sim.on ? "TURN OFF" : "TURN ON";
  p.classList.toggle("on", Sim.on);
  $("sim-body").classList.toggle("off", !Sim.on);
  $("sim-play").textContent = Sim.running ? "■ STOP" : "▶ PLAY";
  $("sim-play").classList.toggle("on", Sim.running);
  $("sim-bpm").textContent = Sim.tempo + " BPM";
  const next = Sim.next !== undefined ? " · next " + Sim.next.id : "";
  $("sim-now").textContent = Sim.running ? "Pattern " + Sim.curId + (Sim.cur ? " " + Sim.cur.name : " (empty)") + next : "Stopped. Pick a pattern on PTN (banks A and B, 1–8) or press PLAY.";
  $("sim-kit").textContent = Sim.on ? kitText() : "";
}
function openSim() {
  build();
  $("sim").classList.add("open");
  render();
}
export { openSim, PATTERNS };
