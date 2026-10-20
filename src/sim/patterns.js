/* the demo unit's patterns: one bar of 16 steps each. X = loud, x = normal, o = soft, . = nothing.
   Lanes are pads: "A1" = bank A pad 1. The bank is the MIDI channel of the program change, the pattern is its number (0-7 here). Spaces in a row are ignored. */
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
  [ /* C: EDM with the 909-style kit (C1 kick, C2 snare, C3 clap, C4/C5 hats, C6 ride, C13-C16 bass and stabs in F minor). Grooves as in the 404tui templates. */
    L("House", { C1: "X...x...X...x...", C3: "....X.......X...", C5: "..x...x...x...x.", C4: "og.g og.g og.g og.g", C6: "o...............", C15: "...x.....x.x...." }),
    L("Deep house", { C1: "x...x...x...x...", C3: "....x.......x...", C5: "..o...o...o...o.", C4: ".g.g .g.g .g.g .g.o", C10: "ggog ggog ggog ggog", C7: "...g...o..g....g", C16: "x..x....x.....x." }),
    L("Tech house", { C1: "X...X...X...X...", C3: "....X.......X...", C2: "..............ox", C5: "..x...x...x...x.", C4: "og.g og.g og.g og.g", C6: "x.o.x.o.x.o.x.o.", C9: "...o..x.....o...", C13: "..x...x...x...x." }),
    L("Techno", { C1: "X..gX...X..gX...", C3: "....X..g....X.g.", C4: "ggxg ggxg ggxg ggxg", C5: "..x...x...x.....", C8: "...o...g...o...g", C6: "x.o.x.o.x.o.x.o." }),
    L("Trance", { C1: "X...X...X...X...", C3: "....x.......x...", C5: "..x...x...x...x.", C4: "g.g.g.g.g.g.g.g.", C14: "..x...x...x...x.", C15: "x..x..x.x..x..x." }),
    L("Psytrance", { C1: "X...X...X...X...", C3: "....x.......x...", C5: "..x...x...x...x.", C4: "...o...o...o...o", C14: ".xxx.xxx.xxx.xxx" }),
    L("Hard techno", { C1: "X...X..gX...X..g", C3: "....X.......X...", C5: "..x...x...x...x.", C4: "gogo gogo gogo gogo", C8: "..............og" }),
    L("Disco", { C1: "X...X...X...X...", C3: "....x.......x...", C5: "..x...x...x...x.", C4: "xogo xogo xogo xogo", C16: "..x...x...x...x." }),
  ],
  [ /* D: beats and bass music with the real TR-808 kit (D1/D2 kicks, D3 snare, D5 clap, D6/D7 hats) and the sub bass C13 */
    L("Electro", { D1: "X..x..X...x..x..", D3: "....X.......X...", D5: "....x.......x...", D6: "..x...x...x...x.", D11: "......o.......o." }),
    L("Trap", { D1: "X......x..x.....", C13: "X......x..x.....", D5: "........X.......", D6: "x.xgx.xgx.x.xoxo", D7: "..............x." }),
    L("Dubstep", { D1: "X.........x.....", C13: "X.........x.....", D3: "........X.......", D6: "x.x.x.x.x.x.x.x.", D10: "............g.g." }),
    L("Drum and bass", { D2: "X.........x.....", D3: "....X.......X...", D6: "x.o.x.o.x.o.x.o.", D7: "..............x.", C14: "X.......x......." }),
    L("Jungle", { D2: "X.x.......x.....", D3: "....X..g.g..X..g", D6: "x.x.x.x.x.x.x.x.", D12: "..............o." }),
    L("UK garage", { D2: "X.........x.....", D3: "....X.......X...", D6: "x.ox x.ox x.ox x.ox", D16: "..o...o...o...o.", D11: "......g.....g...", C15: "...x.....x...x.." }),
    L("Amapiano", { D2: "x...x...x...x...", D10: "x..x..x...x..x..", D5: "....o.......o...", D16: "ogog ogog ogog ogog", D7: "..o...o...o...o.", C16: "x..x..x...x.x..x" }),
    L("Reggaeton", { D1: "X...X...X...X...", D3: "...x..x....x..x.", D6: "x.o.x.o.x.o.x.o.", D11: "..............g.", C13: "X..x....X..x...." }),
  ],
];
const VEL = { X: 125, x: 100, o: 62, g: 36 };
/* [bank][pc] -> { name, steps: 16 x [{ bank, pad, vel }] } */
const PATTERNS = BANKS.map((bank) => bank.map((p) => {
  const steps = Array.from({ length: 16 }, () => []);
  Object.entries(p.lanes).forEach(([pad, row]) => {
    const b = pad.charCodeAt(0) - 65, n = +pad.slice(1);
    [...row.replace(/[ |]/g, "")].forEach((c, i) => { if (VEL[c]) steps[i].push({ bank: b, pad: n, vel: VEL[c] }); });
  });
  return { name: p.name, steps };
}));
export { PATTERNS };
