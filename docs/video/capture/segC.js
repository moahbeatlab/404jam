(async()=>{
  const A = (w) => J.at(w);
  J.view('PADS'); await J.sleep(1100); A('pads');
  const whites = Array.from(document.querySelectorAll('#view-play .key, #view-play [data-note]')).filter(J.vis);
  for (const i of [0,2,4,5,7]) { if (whites[i]) { J.tap(whites[i]); await J.sleep(380); } } A('keys-played');
  J.tap(document.getElementById('play-scale-btn')); document.getElementById('play-scale-btn').click(); await J.sleep(1500); A('scale');
  document.getElementById('play-pads-btn').click(); await J.sleep(1500); A('pads-grid');
  J.view('PTN'); await J.sleep(1100); A('ptn');
  const cells = Array.from(document.querySelectorAll('#ptn-grid button')).filter(J.vis); J.tap(cells[1]); await J.sleep(1700); A('ptn-tap'); J.tap(cells[3]); await J.sleep(1600); A('ptn-tap2');
  J.view('JAM'); await J.sleep(1000); A('jam');
  J.btn('Presets', document.getElementById('view-jam')).click(); await J.sleep(1300); A('jam-presets');
  Array.from(document.querySelectorAll('#jampreset button')).find(b=>b.textContent.includes('MC-101')).click(); await J.sleep(1600); A('jam-device');
  Array.from(document.querySelectorAll('#jampreset button')).find(b=>b.textContent.trim().startsWith('Default')).click(); await J.sleep(1800); A('jam-added');
  if (document.getElementById('jampreset').classList.contains('open')) { document.getElementById('jampreset-close').click(); await J.sleep(500); }
  A('segC-end');
  return JSON.stringify(J.log);
})()
