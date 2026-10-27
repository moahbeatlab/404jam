(async()=>{
  const A = (w) => J.at(w);
  J.view('XY'); await J.sleep(900); A('xy');
  document.getElementById('xy-presets-btn').click(); await J.sleep(1400); A('xy-presets');
  Array.from(document.querySelectorAll('#xypreset button')).find(b=>b.textContent.trim().startsWith('Tape Echo')).click(); await J.sleep(1200); A('xy-bus-choice');
  Array.from(document.querySelectorAll('#xypreset button')).find(b=>b.textContent.trim().startsWith('BUS 1')).click(); await J.sleep(1400); A('xy-assigned');
  const pad = document.getElementById('xy-pad'), r = pad.getBoundingClientRect();
  const cx = r.x + r.width/2, cy = r.y + r.height/2, rx = r.width*0.34, ry = r.height*0.33;
  const mk = (t,x,y)=>new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:t==='pointerup'?0:1});
  pad.dispatchEvent(mk('pointerdown',cx+rx,cy)); A('xy-drag-start');
  for (let k = 0; k < 2; k++) for (let d = 0; d <= 360; d += 6) { pad.dispatchEvent(mk('pointermove',cx+rx*Math.cos(d*Math.PI/180)*(1-0.25*k*d/360),cy+ry*Math.sin(d*Math.PI/180)*(1-0.25*k*d/360))); await J.sleep(32); }
  pad.dispatchEvent(mk('pointerup',cx,cy)); A('xy-drag-end'); await J.sleep(700);
  J.view('PERF'); await J.sleep(1200); A('perf');
  const lfo = Array.from(document.querySelectorAll('#view-perf button')).filter(J.vis).find(b=>b.textContent.trim()==='LFO'); if (lfo) { J.tap(lfo, true); lfo.click(); } await J.sleep(1800); A('perf-lfo');
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
