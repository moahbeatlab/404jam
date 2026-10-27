(async()=>{
  const A = (w) => J.at(w);
  J.view('LAB'); await J.sleep(1800); A('lab');
  await T.click('NEW EMPTY PROJECT'); const inp = document.querySelector('.lb-text'); inp.value = 'DEMO BEAT'; await T.click('OK'); await J.sleep(900); A('lab-project');
  await T.tab('PROJECT');
  T.next = [ T.file('kick.wav', T.wav(60, 0.35, 44100, 6)), T.file('snare.wav', T.wav(200, 0.25, 44100, 8, 'noise')), T.file('hat.wav', T.wav(8000, 0.08, 44100, 8, 'noise')), T.file('keys middle C.wav', T.wav(261.63, 1.2, 44100, 2.5)),
    T.file('loop 8 hits.wav', (() => { const parts = []; for (let k = 0; k < 8; k++) parts.push(T.wav(120 + 70 * k, 0.25, 44100, 5)); const total = parts.reduce((a, p) => a + (p.length - 44), 0); const b = new Uint8Array(44 + total); b.set(parts[0].subarray(0, 44)); let o = 44; for (const p of parts) { b.set(p.subarray(44), o); o += p.length - 44; } const v = new DataView(b.buffer); v.setUint32(4, 36 + total, true); v.setUint32(40, total, true); return b; })()) ];
  await T.click('ADD AUDIO FILES'); await J.sleep(2800); A('lab-added');
  await T.tab('PADS'); await J.sleep(1600); A('lab-pads');
  const pad = Array.from(document.querySelectorAll('#view-lab .lb-pad')).find(p => p.dataset.pad === '4'); pad.click(); await J.sleep(900); A('lab-pad-selected');
  await T.click('SLICE…'); await J.sleep(1800); A('lab-slice');
  await T.click('FIND ONSETS'); await J.sleep(2200); A('lab-onsets');
  await T.tab('CHORDS'); await J.sleep(1800); A('lab-chords');
  A('segD-end');
  return JSON.stringify(J.log);
})()
