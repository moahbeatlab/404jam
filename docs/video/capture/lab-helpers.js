(function(){
  if (window.T) return 'already';
  const T = window.T = {};
  T.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  T.vis = (e) => e && e.offsetParent !== null;
  T.btn = (text, root) => Array.from((root || document.querySelector('.lb-sheet') || document.getElementById('view-lab')).querySelectorAll('button')).filter(T.vis).find(b => b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  T.click = async (text, root) => { const b = T.btn(text, root); if (!b) throw new Error('no button: ' + text); b.click(); await T.sleep(250); return b; };
  T.tab = async (name) => { const b = Array.from(document.querySelectorAll('.labtab')).find(x => x.textContent.trim() === name); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); await T.sleep(600); };
  T.msg = () => document.getElementById('banner').textContent;
  T.wav = (hz, secs, rate = 44100, decay = 3, kind = 'sine') => {
    const n = Math.floor(rate * secs), b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / rate, env = Math.exp(-decay * t / secs);
      let s = kind === 'noise' ? (Math.random() * 2 - 1) : Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(2 * Math.PI * hz * 2 * t);
      v.setInt16(44 + i * 2, Math.round(s * env * 14000), true);
    }
    return b;
  };
  T.file = (name, bytes, type) => new File([bytes], name, { type: type || 'audio/wav' });
  /* file pickers: the next <input type=file>.click() gets these files */
  T.next = null;
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && T.next) {
      const files = T.next; T.next = null;
      const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
      this.files = dt.files;
      setTimeout(() => this.dispatchEvent(new Event('change')), 20);
      return;
    }
    return orig.call(this);
  };
  window.__errs = window.__errs || [];
  addEventListener('error', e => window.__errs.push('E ' + e.message));
  addEventListener('unhandledrejection', e => window.__errs.push('R ' + (e.reason && e.reason.message || e.reason)));
  return 'ok';
})()
