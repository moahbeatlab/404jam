(async()=>{
  const A = (w) => J.at(w);
  document.getElementById('xm-go').click(); A('xy-go'); await J.sleep(5600);
  document.getElementById('xm-go').click(); A('xy-morph-end'); await J.sleep(600);
  J.view('MIX'); await J.sleep(600);
  J.btn('Menu').click(); await J.sleep(700); const ov = J.btn('Overview'); if (ov) ov.click(); await J.sleep(900); A('mix-back');
  J.btn('Menu').click(); await J.sleep(700); J.btn('Snapshots').click(); await J.sleep(1400); A('snaps-open');
  let slots = Array.from(document.querySelectorAll('.snap-slot')); J.tap(slots[0]); await J.sleep(1300); A('snap-saved');
  document.activeElement && document.activeElement.blur && document.activeElement.blur(); await J.sleep(300);
  slots = Array.from(document.querySelectorAll('.snap-slot')); J.tap(slots[2]); await J.sleep(1300); A('snap-saved2');
  J.btn('Close', document.getElementById('snaps')).click(); await J.sleep(700);
  document.getElementById('lib-btn').click(); await J.sleep(1700); A('library');
  document.getElementById('recipes-close').click(); await J.sleep(700); A('segB-end');
  return JSON.stringify(J.log);
})()
