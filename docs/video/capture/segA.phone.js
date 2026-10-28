(async()=>{
  // the phone layout shows one bus at a time (the focus view): pick the bus tab, then its effect, EFX and faders
  const A = (w) => J.at(w);
  J.t0 = performance.now(); J.log = [];
  A('mark'); await J.sleep(300);
  await J.sleep(1400); A('overview-empty');
  await J.demo(); A('demo-on');
  await J.sleep(600);
  const names = ['Tape Echo','JUNO Chorus','Filter+Drive','Reverb','Compressor'];
  for (let i = 0; i < 5; i++) {
    J.bus(i); await J.sleep(500);
    document.getElementById('fx-name').click(); await J.sleep(600);
    const items = Array.from(document.querySelectorAll('#picker-body button.pick-item'));
    const it = items.find(e => e.textContent.replace(/[★\s]+$/,'').trim() === names[i]) || items[3];
    J.tap(it); await J.sleep(700);
    A('fx' + i + ' ' + names[i]); await J.sleep(300);
  }
  A('fx-all');
  for (let i = 0; i < 5; i++) { J.bus(i); await J.sleep(250); J.tap(document.getElementById('efx-pad')); await J.sleep(300); }
  A('efx-on'); await J.sleep(500);
  J.bus(0); await J.sleep(500);
  A('faders-start');
  await J.ffader(0, 0.7, 0.25, 32); A('f-b0a'); await J.sleep(300);
  await J.ffader(1, 0.2, 0.6, 32); await J.sleep(300);
  await J.ffader(2, 0.6, 0.2, 32); A('f-b1'); await J.sleep(300);
  J.bus(1); await J.sleep(500); await J.ffader(2, 0.6, 0.2, 32); A('f-b2'); await J.sleep(300);
  J.bus(0); await J.sleep(500); await J.ffader(4, 0.7, 0.15, 32); A('f-b3'); await J.sleep(300);
  await J.ffader(3, 0.4, 0.8, 32); A('f-b0b'); await J.sleep(800);
  A('segA-end');
  return JSON.stringify(J.log);
})()
