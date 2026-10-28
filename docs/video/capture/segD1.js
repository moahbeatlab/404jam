(async()=>{
  const A = (w) => J.at(w);
  const pv = document.getElementById('view-perf');
  const rel = (b) => b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true}));
  const pickBtn = async (t) => { const b = Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim() === t); if (b) { J.tap(b); b.click(); } await J.sleep(700); };
  J.bus(0); await J.sleep(300);
  // PUNCH: presets fill four slots; hold one and everything goes back when you let go; morph between now and a punch
  J.view('PERF'); await J.sleep(2100); A('perf');
  J.btn('Presets', pv).click(); await J.sleep(2400); A('punch-presets');
  Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim().startsWith('RISER')).click(); await J.sleep(2800); A('punch-loaded');
  let slots = Array.from(document.querySelectorAll('#pn-slots > *'));
  J.tap(slots[3], true); await J.sleep(2200); A('punch-held');
  J.view('MIX'); await J.sleep(3400); A('punch-mix');   // the buses are punched in: other effects, other values
  rel(slots[3]); await J.sleep(2800); A('punch-back');   // let go: everything goes back
  J.view('PERF'); await J.sleep(900);
  return 'ok';
})()
