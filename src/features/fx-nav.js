import { BUS_TABLES } from "../data/effects-db.js";
import { fxChange } from "../core/midi.js";
import { favList, state } from "../core/store.js";
import { BUSES } from "../core/util.js";

/* ===== 11 fx prev/next through favorites ===== */
function fxStep(dir) {
  const bus = state.activeBus, B = BUSES[bus], table = BUS_TABLES[B.table];
  let list = favList(B.table);
  if (!list.length) list = state.recents[B.table].slice();
  if (!list.length) list = Array.from({ length: table.length - 1 }, (_, i) => i + 1);
  list = list.filter((n) => n > 0 && n < table.length);
  if (!list.length) return;
  const pos = list.indexOf(state.buses[bus].fx);
  const next = pos < 0 ? list[0] : list[(pos + dir + list.length) % list.length];
  fxChange(bus, next, "user");
}

export { fxStep };
