(async()=>{
  const A = (w) => J.at(w);
  J.t0 = performance.now(); J.log = [];
  A('mark'); await J.sleep(300);
  await J.sleep(1400); A('overview-empty');
  await J.demo(); A('demo-on');
  await J.sleep(600);
  const names = ['Tape Echo','JUNO Chorus','Filter+Drive','Reverb','Compressor'];
  for (let i = 0; i < 5; i++) { const n = await J.loadFx(i, names[i]); A('fx' + i + ' ' + n); await J.sleep(500); }
  A('fx-all');
  for (const p of Array.from(document.querySelectorAll('.strip-efx'))) { J.tap(p); await J.sleep(280); }
  A('efx-on'); await J.sleep(900);
  A('faders-start');
  await J.fader(0, 0, 0.7, 0.25, 32); A('f-b0a'); await J.sleep(300);
  await J.fader(0, 1, 0.2, 0.6, 32); await J.sleep(300);
  await J.fader(1, 2, 0.6, 0.2, 32); A('f-b1'); await J.sleep(300);
  await J.fader(2, 0, 0.9, 0.35, 32); A('f-b2'); await J.sleep(300);
  await J.fader(3, 4, 0.7, 0.15, 32); A('f-b3'); await J.sleep(300);
  await J.fader(0, 2, 0.4, 0.8, 32); A('f-b0b'); await J.sleep(800);
  A('segA-end');
  return JSON.stringify(J.log);
})()
