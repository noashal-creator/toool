/* ─────────────────────────────────────────────────────────────────────
   TOOOL — hero chase

   Five cut-outs (lips → lips-car → ride-on, Figma 3257:2–6) trail the cursor
   across the frame right under the hero, on the baked pink ground (#FF00DD,
   set in styles.css). The chain leads from the LAST cut-out (it chases the
   mouse; the rest trail toward the first).

   The whole chain is CLAMPED to the frame: every cut-out's centre is kept far
   enough from each edge that its full size stays inside, so it can drive right
   up against the border (collide) but never spill past it. On mouse-leave the
   chain freezes where it is (in frame) rather than flying off.

   All the tuning controls (size / speed / background colour) were
   authoring-only; the chosen values are BAKED below and the panel is gone.
   ───────────────────────────────────────────────────────────────────── */

(function () {
  const section = document.getElementById('hero-chase');
  if (!section) return;
  const curs = Array.from(section.querySelectorAll('.hc-cur'));
  const N = curs.length;
  if (!N) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lf  = [0.38, 0.20, 0.15, 0.11, 0.08];
  const pos = curs.map(() => ({ x: 0, y: 0 }));
  let mx = 0, my = 0, seeded = false;

  /* the baked tuning */
  const sizePct = 45;                 // cut-out size, % of the frame's short side
  const followK = 0.26;               // drag speed (low = slow gather, high = snappy)
  const zoom    = 1.6;
  let running = false, visible = false, raf = 0;

  /* frame bounds + half the drawn cut-out size, so a centre clamped to
     [half, W-half] keeps the whole image inside the frame (it sticks to the
     border instead of crossing it). Recomputed whenever layout changes. */
  let W = 0, H = 0, half = 0, curPx = 0;
  function bounds() {
    W = section.clientWidth; H = section.clientHeight;
    half = curPx * zoom / 2;
  }
  const clampX = x => { const lo = Math.min(half, W / 2), hi = Math.max(W - half, W / 2); return Math.max(lo, Math.min(hi, x)); };
  const clampY = y => { const lo = Math.min(half, H / 2), hi = Math.max(H - half, H / 2); return Math.max(lo, Math.min(hi, y)); };

  function applySize() {
    curPx = Math.max(6, Math.round(sizePct / 100 * Math.min(section.clientWidth, section.clientHeight)));
    curs.forEach(c => { c.style.width = curPx + 'px'; c.style.height = curPx + 'px'; });
    bounds();
    seed();
  }

  /* first real layout: gather the chain at the centre so it starts in-frame */
  function seed() {
    if (seeded || !W || !H) return;
    mx = W / 2; my = H / 2;
    pos.forEach(p => { p.x = mx; p.y = my; });
    seeded = true;
  }

  section.addEventListener('mousemove', e => {
    const r = section.getBoundingClientRect();
    mx = clampX(e.clientX - r.left); my = clampY(e.clientY - r.top);
    start();
  });
  /* leaving the frame holds the chain where it is (already inside the border) */

  /* the chain — led by the LAST cut-out, every node clamped into the frame */
  function frame() {
    if (!running) return;
    const L = N - 1;
    pos[L].x += (mx - pos[L].x) * lf[0] * followK;
    pos[L].y += (my - pos[L].y) * lf[0] * followK;
    pos[L].x = clampX(pos[L].x); pos[L].y = clampY(pos[L].y);
    for (let i = L - 1; i >= 0; i--) {
      pos[i].x += (pos[i + 1].x - pos[i].x) * lf[L - i] * followK;
      pos[i].y += (pos[i + 1].y - pos[i].y) * lf[L - i] * followK;
      pos[i].x = clampX(pos[i].x); pos[i].y = clampY(pos[i].y);
    }
    curs.forEach((c, i) => { c.style.left = pos[i].x + 'px'; c.style.top = pos[i].y + 'px'; });
    raf = requestAnimationFrame(frame);
  }
  function start() { if (reduced || running || !visible) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; }

  section.style.setProperty('--hc-zoom', zoom);
  applySize();
  window.addEventListener('resize', applySize);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        visible = en.isIntersecting; visible ? start() : stop();
      }
    }, { threshold: 0.15 });
    io.observe(section);
  } else {
    visible = true; start();
  }
})();
