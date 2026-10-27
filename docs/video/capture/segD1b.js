(async()=>{
  const A = (w) => J.at(w);
  const pv = document.getElementById('view-perf');
  const rel = (b) => b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true}));
  const pickBtn = async (t) => { const b = Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim() === t); if (b) { J.tap(b); b.click(); } await J.sleep(700); };
  let slots = Array.from(document.querySelectorAll('#pn-slots > *'));
  J.btn('Morph', pv).click(); await J.sleep(2200); A('punch-morph-mode');
  J.tap(slots[3]); await J.sleep(800);
  const mb = document.getElementById('pn-morph'), mr = mb.getBoundingClientRect();
  await J.drag(mb, mr.x + 8, mr.y + mr.height/2, mr.x + mr.width*0.92, mr.y + mr.height/2, 50, 60); A('punch-morph-up'); await J.sleep(500);
  await J.drag(mb, mr.x + mr.width*0.92, mr.y + mr.height/2, mr.x + mr.width*0.2, mr.y + mr.height/2, 30, 50); await J.sleep(500);
  J.tap(slots[3]); await J.sleep(600);   // tap again: stop
  J.btn('Hold', pv).click(); await J.sleep(500); A('punch-end');
  return 'ok';
})()
