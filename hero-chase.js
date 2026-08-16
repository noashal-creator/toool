/* ─────────────────────────────────────────────────────────────────────
   TOOOL — hero chase

   Five cut-outs trail the cursor across the frame right under the hero.
   The chain leads from the LAST cut-out (it chases the mouse; the rest
   trail toward the first). Small live controls (size / zoom / follow)
   stay on the frame for tuning — once locked, they can be removed and the
   chosen values baked in. Sizes are relative to the frame.
   ───────────────────────────────────────────────────────────────────── */

(function () {
  const section = document.getElementById('hero-chase');
  if (!section) return;
  const curs = Array.from(section.querySelectorAll('.hc-cur'));
  const N = curs.length;
  if (!N) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lf  = [0.38, 0.20, 0.15, 0.11, 0.08];
  const pos = curs.map(() => ({ x: -400, y: -400 }));
  let mx = -400, my = -400;

  let sizePct = 45, followK = 0.26, zoom = 1.6;   // baked from the tuning
  let running = false, visible = false, raf = 0;

  function applySize() {
    const px = Math.max(6, Math.round(sizePct / 100 * Math.min(section.clientWidth, section.clientHeight)));
    curs.forEach(c => { c.style.width = px + 'px'; c.style.height = px + 'px'; });
  }
  function applyZoom() { section.style.setProperty('--hc-zoom', zoom); }

  section.addEventListener('mousemove', e => {
    const r = section.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
    start();
  });
  section.addEventListener('mouseleave', () => { mx = my = -400; });

  /* the chain — led by the LAST cut-out */
  function frame() {
    if (!running) return;
    const L = N - 1;
    pos[L].x += (mx - pos[L].x) * lf[0] * followK;
    pos[L].y += (my - pos[L].y) * lf[0] * followK;
    for (let i = L - 1; i >= 0; i--) {
      pos[i].x += (pos[i + 1].x - pos[i].x) * lf[L - i] * followK;
      pos[i].y += (pos[i + 1].y - pos[i].y) * lf[L - i] * followK;
    }
    curs.forEach((c, i) => { c.style.left = pos[i].x + 'px'; c.style.top = pos[i].y + 'px'; });
    raf = requestAnimationFrame(frame);
  }
  function start() { if (reduced || running || !visible) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; }

  /* live controls (temporary — for tuning on the real site) */
  const sz = document.getElementById('hc-size');
  const zm = document.getElementById('hc-zoom');
  const fl = document.getElementById('hc-follow');
  if (sz) sz.addEventListener('input', () => { sizePct = +sz.value; applySize(); });
  if (zm) zm.addEventListener('input', () => { zoom = +zm.value / 100; applyZoom(); });
  if (fl) fl.addEventListener('input', () => { followK = +fl.value / 100; });

  /* upload a new background live */
  const bgBtn = document.getElementById('hc-bg-btn');
  const bgFile = document.getElementById('hc-bg-file');
  if (bgBtn && bgFile) {
    bgBtn.addEventListener('click', () => bgFile.click());
    bgFile.addEventListener('change', () => {
      const f = bgFile.files && bgFile.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = e => { section.style.backgroundImage = 'url(' + e.target.result + ')'; };
      r.readAsDataURL(f);
      bgFile.value = '';
    });
  }

  /* replace any of the 5 moving cut-outs — temporary tuning control, one slot
     per cut-out. Choices are shrunk (transparency kept) and remembered across
     reloads so the tuning survives a refresh; once the set is chosen they get
     baked into the chase-N.png files and these controls come out. */
  const IMG_KEY = 'toool.hc.cutouts';
  const imgFile = document.getElementById('hc-img-file');
  let pendingIdx = -1;
  try {
    const saved = JSON.parse(localStorage.getItem(IMG_KEY) || 'null');
    if (Array.isArray(saved)) saved.forEach((src, i) => { if (src && curs[i]) curs[i].src = src; });
  } catch (e) { /* nothing saved / private mode */ }
  function shrinkCutout(file, cb) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 512 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * s));
      c.height = Math.max(1, Math.round(im.naturalHeight * s));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try { cb(c.toDataURL('image/png')); } catch (e) { cb(null); }   // PNG keeps the alpha
    };
    im.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    im.src = url;
  }
  section.querySelectorAll('.hc-img-btn').forEach(btn => {
    btn.addEventListener('click', () => { pendingIdx = +btn.dataset.hcImg; if (imgFile) imgFile.click(); });
  });
  if (imgFile) imgFile.addEventListener('change', () => {
    const f = imgFile.files && imgFile.files[0];
    imgFile.value = '';
    const idx = pendingIdx; pendingIdx = -1;
    if (!f || idx < 0 || !curs[idx]) return;
    shrinkCutout(f, data => {
      if (!data) return;
      curs[idx].src = data;
      try {
        const saved = JSON.parse(localStorage.getItem(IMG_KEY) || '[]');
        saved[idx] = data;
        localStorage.setItem(IMG_KEY, JSON.stringify(saved));
      } catch (e) { /* quota: shown live but not remembered */ }
    });
  });

  applySize();
  applyZoom();
  window.addEventListener('resize', applySize);

  /* The tuning panel rides the visible part of the band: its `top` is pinned to
     the bottom of whatever slice of the band is currently on screen, clamped so
     it never leaves the band itself. Sitting at the band's own bottom-left put
     it below the fold whenever the band was taller than the viewport, which is
     the normal-scrolling case. */
  const panel = section.querySelector('.hc-controls');
  function parkPanel() {
    if (!panel) return;
    const r = section.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(panel).left) || 16;
    const h = panel.offsetHeight;
    const want = -r.top + window.innerHeight - h - pad;      // bottom of the visible slice
    const max = Math.max(pad, r.height - h - pad);
    panel.style.top = Math.min(Math.max(want, pad), max).toFixed(0) + 'px';
  }
  window.addEventListener('scroll', parkPanel, { passive: true });
  window.addEventListener('resize', parkPanel);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        visible = en.isIntersecting; visible ? start() : stop();
        parkPanel();
      }
    }, { threshold: 0.15 });
    io.observe(section);
  } else {
    visible = true; start();
  }
  parkPanel();
})();
