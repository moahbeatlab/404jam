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
  [ /* E: boom bap with the dusty kit (E1/E2 kicks, E3 snare, E4 rim, E5 clap, E6/E7 hats, E14 horn, E15 vox, E16 bass) */
    L("Dusty boom bap", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.xox.xox.xox.xo", E13: "o......o.......o" }),
    L("Swing hat", { E1: "X..x....X..x....", E3: "....X.......X..g", E6: "x.o.x.o.x.o.x.o.", E7: "..............x." }),
    L("Horn loop", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", E14: "X.......x.......", E16: "X.....x.X......." }),
    L("Head nod", { E2: "X.........x.....", E4: "....x.......x...", E5: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", E10: "..o...o...o...o." }),
    L("Scratch break", { E1: "X..x..x...x.....", E3: "....X.......X...", E6: "xoxoxoxoxoxoxoxo", E12: "..............X." }),
    L("Ride groove", { E1: "X.....x...x.....", E3: "....X.......X...", E8: "x.x.x.x.x.x.x.x.", E9: "o.o.o.o.o.o.o.o." }),
    L("Hey!", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", E15: "............X...", E14: "x.......x......." }),
    L("Break hits", { E11: "X..x..x....x.x..", E3: "....X.......X...", E6: "x.xxx.xxx.xxx.xx", E13: "o...o...o...o..." }),
  ],
  [ /* F: lo-fi (F1-F3 keys in C, F, A; F4 pad, F5 guitar, F6 bass, F7 vibes, F8 flute, F11-F15 drums) */
    L("Rainy day", { F11: "X.....x...x.....", F12: "....X.......X...", F13: "x.x.x.x.x.x.x.x.", F1: "X...............", F10: "X...............", F6: "X.....x.X......." }),
    L("Chill keys", { F11: "X..x....X.......", F12: "....X.......X...", F13: "x.o.x.o.x.o.x.o.", F1: "X...............", F2: "........X.......", F6: "X..x....X..x...." }),
    L("Wurli walk", { F11: "X.....x...x.....", F12: "....X.......X...", F13: "x.x.x.x.x.x.x.x.", F3: "X.....x.....x...", F6: "X..x..x.X..x..x." }),
    L("Pad and pluck", { F11: "X.......x.......", F15: "....x.......x...", F13: "o.o.o.o.o.o.o.o.", F4: "X...............", F5: "..x..x..x..x..x." }),
    L("Vibes", { F11: "X.....x...x.....", F12: "....X.......X...", F13: "x.x.x.x.x.x.x.x.", F7: "X..x..x...x.....", F16: "..............x." }),
    L("Flute", { F11: "X.....x...x.....", F12: "....X.......X...", F14: "..............x.", F13: "x.x.x.x.x.x.x.x.", F8: "X...............", F6: "X.....x.X......." }),
    L("Tape stop", { F11: "X.....x...x.....", F12: "....X.......X...", F13: "x.x.x.x.x.x.x.x.", F1: "X...............", F9: "..............X." }),
    L("Lo-fi hop", { F11: "X..x....X.x.....", F12: "....X.......X...", F13: "x.x.x.x.x.x.x.x.", F1: "X...............", F6: "X.....x.X.......", F10: "X...............", F5: "..x...x...x...x." }),
  ],
  [ /* G: Latin and world percussion (G1/G2 bongos, G3-G5 congas, G6/G7 timbales, G8 cowbell, G9 claves, G10 guiro, G11/G12 shakers, G13 triangle, G14/G15 agogo) */
    L("Son clave", { G9: "X..x..x...x.x...", G5: "x...x...x...x...", G8: "x...x...x...x...", G12: "oxoxoxoxoxoxoxox" }),
    L("Rumba", { G9: "X..x...x..x.x...", G3: "..x...x...x...x.", G4: "....x.......x...", G11: "xoxoxoxoxoxoxoxo" }),
    L("Martillo", { G1: "x.xx.xx.x.xx.xx.", G2: "..x...x...x...x.", G8: "X.......X.......", G12: "oxoxoxoxoxoxoxox" }),
    L("Cha-cha", { G8: "x...x...x...x...", G9: "x..x..x...x.x...", G5: "x.x.x.x.x.x.x.x.", G10: "x.xx.xx.x.xx.xx." }),
    L("Timbales", { G6: "x..x..x.x..x..x.", G7: "..x...x...x...x.", G3: "x...x...x...x...", G13: "X...............", G14: "x.......x......." }),
    L("Afro", { G14: "x.x..x.x.x..x.x.", G15: "..x..x..x..x..x.", G11: "ogogogogogogogog", G3: "x...x...x...x...", G2: "......x.....x..." }),
    L("Calypso", { G5: "x.x.x.x.x.x.x.x.", G1: "..x.x...x.x.x...", G8: "X.......X.......", G16: "..............X." }),
    L("Percussion jam", { G1: "x.xx.xx.x.xx.xx.", G3: "x...x...x...x...", G8: "x...x...x...x...", G9: "X..x..x...x.x...", G12: "oxoxoxoxoxoxoxox", G13: "X..............." }),
  ],
  [ /* H: effects over a drum bed (H1 riser, H2 downlifter, H3 impact, H4 sub drop, H5 reverse crash, H6 laser, H10 glitch, H11 siren) */
    L("Build", { C1: "X...X...X...X...", C4: "x.x.x.x.x.x.x.x.", C3: "....X.......X...", H1: "X...............", H14: "..............X." }),
    L("Drop", { H3: "X...............", H4: "X...............", C1: "X...X...X...X...", C3: "....X.......X...", C5: "..x...x...x...x." }),
    L("Breakdown", { H2: "X...............", C4: "o.o.o.o.o.o.o.o.", C3: "........X.......", H15: "......x.......x." }),
    L("Laser tag", { D1: "X.....x...x.....", D3: "....X.......X...", H6: "..x...x.....x...", H7: "......x...x...x.", D6: "x.x.x.x.x.x.x.x." }),
    L("Sirens", { C1: "X...X...X...X...", C3: "....X.......X...", H11: "X...............", H16: "........X......." }),
    L("Glitch", { D2: "X.....x...x.....", D3: "....X.......X...", H10: "..............X.", H13: "........X......." }),
    L("Reverse", { C1: "X...X...X...X...", H5: "X...............", H8: "........X.......", C4: "x.x.x.x.x.x.x.x." }),
    L("Vinyl stop", { E1: "X.....x...x.....", E3: "....X.......X...", H12: "..............X.", H9: "X...............", E6: "x.x.x.x.x.x.x.x." }),
  ],
  [ /* I: bass and synths in F minor over the 909 and 808 drums (I1 sub, I2 reese, I3 acid, I4 pluck bass, I6 lead, I8 supersaw, I9 pad, I13 stab) */
    L("Sub line", { D1: "X.....x...x.....", D3: "....X.......X...", D6: "x.x.x.x.x.x.x.x.", I1: "X.....x...x....." }),
    L("Reese", { C1: "X...X...X...X...", C3: "....X.......X...", C5: "..x...x...x...x.", I2: "X.......x......." }),
    L("Acid", { C1: "X...X...X...X...", C3: "....X.......X...", C4: "x.x.x.x.x.x.x.x.", I3: "x.xx.xx.x.xx.xx." }),
    L("Pluck bass", { D2: "X.....x...x.....", D3: "....X.......X...", D6: "x.x.x.x.x.x.x.x.", I4: "X..x..x.X..x..x." }),
    L("Lead hook", { C1: "X...X...X...X...", C3: "....X.......X...", C5: "..x...x...x...x.", I6: "X.....x...x.....", I1: "X.......X......." }),
    L("Chord stabs", { C1: "X...X...X...X...", C3: "....X.......X...", C5: "..x...x...x...x.", I13: "x..x..x...x.x...", I1: "X.......X......." }),
    L("Pad and arp", { C1: "X.......X.......", C3: "........X.......", C4: "o.o.o.o.o.o.o.o.", I9: "X...............", I10: "x.x.xx.x.x.xx.x." }),
    L("Full stack", { C1: "X...X...X...X...", C3: "....X.......X...", C5: "..x...x...x...x.", C4: "x.x.x.x.x.x.x.x.", I1: "X.....x.X.......", I8: "X...............", I11: "......x.......x." }),
  ],
  [ /* J: vocals and textures (J1-J5 vowels a e i o u, J6 choir, J7 breath, J8 hum, J10 hey, J11 ha, J12 yeah, J14/J15 chops) */
    L("Vowels", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", J1: "X...............", J2: "....X...........", J3: "........X.......", J4: "............X..." }),
    L("Choir", { D1: "X.....x...x.....", D3: "....X.......X...", D6: "x.x.x.x.x.x.x.x.", J6: "X...............", J16: "........X......." }),
    L("Hey ha", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", J10: "..........X.....", J11: "............x.x." }),
    L("Chops", { E2: "X..x....X.......", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", J14: "x.x.....x.x.....", J15: "......x.......x." }),
    L("Hum and breath", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "o.o.o.o.o.o.o.o.", J8: "X...............", J7: "........X......." }),
    L("Yeah", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", J12: "X.......x.......", J13: "..............x." }),
    L("Whisper", { D1: "X.......X.......", D3: "........X.......", D6: "o.o.o.o.o.o.o.o.", J9: "X.......x......." }),
    L("Vocal pad", { E1: "X.....x...x.....", E3: "....X.......X...", E6: "x.x.x.x.x.x.x.x.", J16: "X...............", J1: "........X......." }),
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
