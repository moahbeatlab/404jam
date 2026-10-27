(async()=>{
  const A = (w) => J.at(w);
  // the Demo unit's PLAY gives the app a MIDI clock: Motion and the LFOs follow it
  J.btn('Menu').click(); await J.sleep(700); Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.startsWith('Demo unitsound')).click(); await J.sleep(900);
  document.getElementById('sim-play').click(); await J.sleep(600); J.btn('Close', document.getElementById('sim')).click(); await J.sleep(500);
  A('sim-play');
  return 'ok';
})()
