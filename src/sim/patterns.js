/* the demo unit's patterns: one bar of 16 steps each. X = loud, x = normal, o = soft, . = nothing.
   Lanes are pads: "A1" = bank A pad 1. The bank is the MIDI channel of the program change, the pattern is its number (0-7 here). */
const L = (name, lanes) => ({ name, lanes });
const BANKS = [
  [ /* A: drums */
    L("Boom bap", { A1: "X.....x...x.....", A3: "....X.......X...", A5: "x.x.x.x.x.x.x.x.", A6: "..............o." }),
    L("Four on the floor", { A2: "X...X...X...X...", A4: "....X.......X...", A5: "..x...x...x...x.", A6: "..o...o...o...o.", A10: "oxoxoxoxoxoxoxox" }),
    L("Halftime", { A1: "X.........x.....", A3: "........X.......", A5: "o.o.o.o.o.o.o.o.", A7: "......x.......x." }),
    L("Breaks", { A1: "X..x..x....x.x..", A3: "....X..x.x..X...", A5: "x.x.x.xxx.x.x.x.", A12: ".......o.....o.o" }),
    L("Trap", { A2: "X.....x...x.....", A3: "........X.......", A14: "........X.......", A5: "x.x.x.xxxxx.x.x." }),
    L("Latin percussion", { A12: "x..x..x...x.x...", A11: "x...x...x...x...", A10: "oxoxoxoxoxoxoxox", A8: "..........x...x.", A9: "........x......." }),
    L("Funky", { A1: "X..x....X.x.....", A3: "....X..o.o..X..x", A5: "x.xxx.xxx.xxx.xx", A6: "......o.......o.", A7: "..x.......x....." }),
    L("Fill", { A3: "ooooxxxxxxxxXXXX", A8: "........o.o.o...", A1: "X.......", A13: "X..............." }),
  ],
  [ /* B: drums with the melodic pads (B6 is a sample in F) */
    L("Keys loop", { A1: "X.....x...x.....", A3: "....X.......X...", A5: "x.x.x.x.x.x.x.x.", B2: "X.......x.......", B1: "X.......X.x....." }),
    L("Pluck groove", { A2: "X...X...X...X...", A4: "....X.......X...", A5: "..x...x...x...x.", B3: "x..x..x.x..x..x.", B1: "X..x....X......." }),
    L("Organ stabs", { A1: "X..x..x...x.....", A3: "....X.......X...", A5: "x.x.x.x.x.x.x.x.", B5: "x.....x..x......", B1: "X.....x.X......." }),
    L("Bell hook", { A1: "X.....x...x.....", A3: "........X.......", A7: "..x.......x.....", B4: "X.....x...x..x..", B1: "X......." }),
    L("Keys in F", { A1: "X.....x...x.....", A3: "....X.......X...", A5: "x.x.x.x.x.x.x.x.", B6: "X.....x.....X..." }),
    L("Pad bed", { A3: "........X.......", A5: "o...o...o...o...", A10: "oxoxoxoxoxoxoxox", B7: "X..............." }),
    L("Vox chops", { A1: "X.....x...x.....", A3: "....X.......X...", A5: "x.x.x.x.x.x.x.x.", B8: "X.......x.......", B1: "X.......X......." }),
    L("Everything", { A1: "X..x..x...x.....", A3: "....X.......X...", A5: "x.x.x.xxx.x.x.x.", A6: "..............o.", B2: "X.......", B3: "..x...x...x...x.", B1: "X.....x.X......." }),
  ],
];
const VEL = { X: 125, x: 100, o: 62 };
/* [bank][pc] -> { name, steps: 16 x [{ bank, pad, vel }] } */
const PATTERNS = BANKS.map((bank) => bank.map((p) => {
  const steps = Array.from({ length: 16 }, () => []);
  Object.entries(p.lanes).forEach(([pad, row]) => {
    const b = pad.charCodeAt(0) - 65, n = +pad.slice(1);
    [...row].forEach((c, i) => { if (VEL[c]) steps[i].push({ bank: b, pad: n, vel: VEL[c] }); });
  });
  return { name: p.name, steps };
}));
export { PATTERNS };
