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

  applySize();
  applyZoom();
  window.addEventListener('resize', applySize);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) { visible = en.isIntersecting; visible ? start() : stop(); }
    }, { threshold: 0.15 });
    io.observe(section);
  } else {
    visible = true; start();
  }
})();
