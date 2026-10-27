(async()=>{
  const A = (w) => J.at(w);
  const pv = document.getElementById('view-perf');
  const rel = (b) => b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true}));
  const pickBtn = async (t) => { const b = Array.from(document.querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim() === t); if (b) { J.tap(b); b.click(); } await J.sleep(700); };
  // LFO: pick a bus and a knob, start it
  J.btn('LFO', pv).click(); await J.sleep(2200); A('lfo');
  const cells = () => Array.from(document.querySelectorAll('#lf-grid > *'));
  cells()[0].click(); await J.sleep(900); await pickBtn('1BUS 1'); await J.sleep(500); A('lfo-bus');
  cells()[1].click(); await J.sleep(900); await pickBtn('CTRL 2'); await J.sleep(500); A('lfo-knob');
  cells()[2].click(); await J.sleep(900); await pickBtn('TRI'); await J.sleep(600); A('lfo-shape');
  document.getElementById('lf-start').click(); await J.sleep(3600); A('lfo-run');
  const dp = document.getElementById('lf-depth'), dr = dp.getBoundingClientRect();
  await J.drag(dp, dr.x + dr.width*0.5, dr.y + dr.height/2, dr.x + dr.width*0.95, dr.y + dr.height/2, 24, 40); await J.sleep(1800); A('lfo-depth');
  J.bus(0); await J.sleep(300); J.view('MIX'); await J.sleep(4800); A('lfo-mix');   // the LFO moves FEEDBACK of BUS 1, Motion loops TIME
  J.view('PERF'); await J.sleep(900);
  document.getElementById('lf-start').click(); await J.sleep(600);
  A('segD-end');
  return JSON.stringify(J.log);
})()
