// index.html-এ </body> এর আগে যোগ করুন: <script src="app-config.js"></script>
(async function () {
  let cfg;
  try { cfg = await (await fetch/https://gmvsave.onrender.com'/api/config)).json(); } catch (e) { return; }
  const b = cfg.brand || {};

  // ---- branding ----
  if (b.name) {
    document.title = b.name;
    const h = document.querySelector('h1.font-brand'); if (h) h.textContent = b.name;
  }
  if (b.font) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + b.font.replace(/ /g, '+') + '&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.textContent = `body,.font-brand,.feat-title,.feat-num,.dev-name{font-family:'${b.font}',serif !important}`;
    document.head.appendChild(s);
  }
  if (b.primary) {
    const s = document.createElement('style');
    s.textContent = `.nav-btn.active{color:${b.primary}} .gradient-text{background:linear-gradient(135deg,${b.primary},#ec4899);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}`;
    document.head.appendChild(s);
  }
  if (b.logo) {
    const c = document.querySelector('.logo-circle');
    if (c) c.innerHTML = '<img src="' + b.logo + '" style="width:100%;height:100%;border-radius:9999px;object-fit:cover">';
    const ic = document.querySelector('link[rel="icon"]'); if (ic) ic.href = b.logo;
  }

  // ---- ad gate: ডাউনলোডের আগে বিজ্ঞাপন ----
  const ads = cfg.ads || {};
  if (!ads.enabled || !ads.links || !ads.links.length) return;
  const orig = window.triggerDownload;
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showAd() {
    return new Promise(resolve => {
      const ad = ads.links[Math.floor(Math.random() * ads.links.length)];
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.85);display:flex;align-items:center;justify-content:center;padding:20px';
      o.innerHTML = `<div style="background:#fff;border-radius:24px;max-width:380px;width:100%;padding:18px;text-align:center">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">বিজ্ঞাপন</div>
        <a href="${esc(ad.url)}" target="_blank" rel="noopener sponsored" style="display:block">
          ${ad.image ? `<img src="${esc(ad.image)}" style="width:100%;border-radius:14px;margin-bottom:10px">` : ''}
          <div style="font-weight:800;color:#4f46e5">${esc(ad.title) || 'বিজ্ঞাপন দেখুন'}</div></a>
        <button id="ad-go" disabled style="margin-top:14px;width:100%;padding:12px;border-radius:14px;color:#fff;font-weight:800;background:#94a3b8"></button></div>`;
      document.body.appendChild(o);
      const btn = o.querySelector('#ad-go'); let n = ads.seconds || 5;
      const tick = () => {
        if (n > 0) { btn.textContent = 'অপেক্ষা করুন… ' + n; n--; setTimeout(tick, 1000); }
        else { btn.disabled = false; btn.style.background = 'linear-gradient(135deg,#6366f1,#ec4899)'; btn.textContent = 'ডাউনলোড শুরু করুন'; }
      };
      tick();
      btn.onclick = () => { o.remove(); resolve(); };
    });
  }
  window.triggerDownload = async function (q) { await showAd(); return orig(q); };
})();
