(function(){
  if (window.J) return 'already';
  const J = window.J = {};
  J.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  J.vis = (e) => e && e.offsetParent !== null;
  J.tap = (el, downOnly) => {
    const r = el.getBoundingClientRect(), cx = r.x + r.width/2, cy = r.y + r.height/2;
    const o = {bubbles:true, cancelable:true, clientX:cx, clientY:cy, pointerId:1, pointerType:'mouse', isPrimary:true};
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    if (!downOnly) el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, o, {buttons:0})));
  };
  J.view = (name) => { const t = Array.from(document.querySelectorAll('.viewtab')).find(x => x.textContent.trim() === name); J.tap(t, true); };
  J.bus = (i) => J.tap(document.querySelectorAll('.bustab')[i], true);
  J.btn = (text, root) => Array.from((root || document).querySelectorAll('button')).filter(J.vis).find(b => b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  J.drag = async (el, x0, y0, x1, y1, steps, ms) => {
    const mk = (type, x, y) => new PointerEvent(type, {bubbles:true, cancelable:true, clientX:x, clientY:y, pointerId:1, pointerType:'mouse', isPrimary:true, buttons: type === 'pointerup' ? 0 : 1});
    el.dispatchEvent(mk('pointerdown', x0, y0));
    for (let i = 1; i <= steps; i++) { el.dispatchEvent(mk('pointermove', x0 + (x1-x0)*i/steps, y0 + (y1-y0)*i/steps)); await J.sleep(ms); }
    el.dispatchEvent(mk('pointerup', x1, y1));
  };
  return 'ok';
})()
;(function(){
  const J = window.J;
  J.mark = async () => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:99999'; document.body.appendChild(d); await J.sleep(300); d.remove(); };
  J.t0 = performance.now(); J.log = []; J.at = (what) => { J.log.push([Math.round(performance.now() - J.t0) / 1000, what]); };
  J.demo = async () => { J.btn('Menu').click(); await J.sleep(700); J.btn('Demo unit').click(); await J.sleep(900); J.btn('Turn on').click(); await J.sleep(1400); J.btn('Close', document.getElementById('sim')).click(); await J.sleep(500); };
  J.loadFx = async (bus, name) => {
    const fx = document.querySelectorAll('.strip-fx')[bus]; fx.click(); await J.sleep(600);
    const items = Array.from(document.querySelectorAll('#picker-body button.pick-item'));
    const it = items.find(e => e.textContent.replace(/[★\s]+$/,'').trim() === name) || items[3];
    J.tap(it); await J.sleep(700); return fx.textContent.trim();
  };
  J.fader = async (bus, idx, from, to, ms) => {
    const f = Array.from(document.querySelectorAll('.strip-faders')[bus].querySelectorAll('.fader')).filter(J.vis)[idx]; if (!f) return 'nofader';
    const r = f.getBoundingClientRect(), x = r.x + r.width / 2;
    await J.drag(f, x, r.y + r.height * from, x, r.y + r.height * to, 24, ms || 30); return 'ok';
  };
})();
;(function(){
  const J = window.J;
  J.lastFlash = -9;
  J.at = (what) => {
    const now = performance.now() / 1000; let flash = false;
    if (now - J.lastFlash > 1.1) {
      flash = true; J.lastFlash = now;
      const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;background:#ff00ff;z-index:999999;pointer-events:none';
      document.body.appendChild(d); setTimeout(() => d.remove(), 600);
    }
    J.log.push([Math.round(performance.now() - J.t0) / 1000, what, flash ? 1 : 0]);
  };
})();
