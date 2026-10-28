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
  // two points on the pad, then a morph between them
  const rel = (b) => b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true}));
  const pts = Array.from(document.querySelectorAll('#xp-btns button'));
  await J.drag(pad, cx, cy, r.x + r.width*0.15, r.y + r.height*0.8, 14, 30); await J.sleep(300);
  J.tap(pts[0], true); await J.sleep(1100); rel(pts[0]); A('xy-point1'); await J.sleep(800);
  await J.drag(pad, cx, cy, r.x + r.width*0.85, r.y + r.height*0.2, 14, 30); await J.sleep(300);
  J.tap(pts[1], true); await J.sleep(1100); rel(pts[1]); A('xy-point2'); await J.sleep(1000);
  return 'ok';
})()
