(async()=>{
  const A = (w) => J.at(w);
  const pv = document.getElementById('view-perf');
  const rel = (b) => b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true}));
  const pickBtn = async (t) => { const b = Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim() === t); if (b) { J.tap(b); b.click(); } await J.sleep(700); };
  // MOTION: record the knobs of the bus for two bars, then it loops them back
  J.btn('Motion', pv).click(); await J.sleep(2200); A('motion');
  const slots = Array.from(document.querySelectorAll('#mo-slots > *'));
  J.tap(slots[0]); await J.sleep(900); A('motion-armed');
  J.view('MIX'); await J.sleep(2900);   // it records from the next bar
  for (const [f, t] of [[0.8, 0.25], [0.25, 0.8], [0.8, 0.3], [0.3, 0.75], [0.75, 0.2]]) await J.ffader(0, f, t, 60);   // fills the two bars
  await J.sleep(400);
  J.view('PERF'); await J.sleep(2600); A('motion-playing');
  J.view('MIX'); await J.sleep(6200); A('motion-mix'); J.view('PERF'); await J.sleep(900);
  document.getElementById('mo-speed').click(); await J.sleep(2400); A('motion-speed');
  document.getElementById('mo-rev').click(); await J.sleep(2600); A('motion-rev');
  return 'ok';
})()
