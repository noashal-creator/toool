/* ─────────────────────────────────────────────────────────────────────
   troll-band — a playful cousin of the cow band.

   Five figures (troll → tooth, the mixwin result spectrum reversed) sit in a
   row on the red ground. Scrolling pans the row across exactly like the
   cow→tomato sweep — but this one is alive and interactive:

     · every figure BOBS on its own, gently, out of phase with the others;
     · the cursor is a magnet — figures near it LIFT and GROW (from the feet),
       so moving the mouse across the band pokes each one as you pass.

   The pan is scroll-driven (reel progress in sideways mode, a slow looping
   drift otherwise); the bob + cursor reaction run every frame on top. Distinct
   from #hero / [data-pan-band] (the plain cow) — this band is bespoke.

   Reduced-motion → a static, evenly-panned row, no bob, no reaction.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const section = document.getElementById('troll-band');
  if (!section) return;
  const sticky = section.querySelector('.tband__sticky');
  const track  = document.getElementById('troll-track');
  if (!sticky || !track) return;
  const figs = Array.from(track.querySelectorAll('.tband__fig'));
  if (!figs.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 860px)');

  // ── geometry ──
  let trackW = 0, viewW = 0, travel = 0, bandH = 0;
  function measure() {
    viewW  = sticky.clientWidth;
    bandH  = sticky.clientHeight;
    trackW = track.scrollWidth;                 // full row width (figures + gaps + pad)
    travel = Math.max(0, trackW - viewW);       // how far it can pan
  }

  // ── cursor magnet (client coords, hot while the pointer is over the band) ──
  let cx = 0, cy = 0, hot = false;
  sticky.addEventListener('pointermove', e => { cx = e.clientX; cy = e.clientY; hot = true; });
  sticky.addEventListener('pointerleave', () => { hot = false; });

  // ── tuning ──
  const DRIFT_MS   = 26000;   // one full self-drift sweep (non-sideways fallback)
  const BOB_AMP    = 0.015;   // bob height as a share of the band height (small: figures are big)
  const BOB_MS     = 2500;    // bob period
  const BOB_PHASE  = 0.95;    // phase step between figures (radians)
  const REACT_R    = 300;     // cursor influence radius, px
  const REACT_LIFT = 18;      // px a figure lifts right under the cursor
  const REACT_GROW = 0.07;    // extra scale right under the cursor (kept small so 84%-tall figures never clip)

  let raf = 0, visible = false, t0 = 0;

  function paintStatic() {
    // reduced-motion: an even, mid-pan row, no motion
    track.style.transform = 'translate3d(' + (-0.5 * travel) + 'px,0,0)';
    figs.forEach(f => { f.style.transform = ''; });
  }

  function tick(now) {
    if (!t0) t0 = now;

    // pan offset — scroll drives it (reel dwell), else a slow looping drift
    let offset = 0;
    if (window.reelMode && window.reelMode.active() && travel > 0) {
      const p = window.reelMode.progress(section);
      offset = (p == null ? 0 : p) * travel;
    } else if (!mobile.matches && travel > 0) {
      offset = (((now - t0) % DRIFT_MS) / DRIFT_MS) * travel;
    }
    track.style.transform = 'translate3d(' + (-offset).toFixed(2) + 'px,0,0)';

    // per-figure bob + cursor reaction
    const amp = bandH * BOB_AMP;
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      let ty = Math.sin(now / BOB_MS * Math.PI * 2 + i * BOB_PHASE) * amp;
      let scale = 1;
      if (hot) {
        const r = f.getBoundingClientRect();
        const d = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
        const k = Math.max(0, 1 - d / REACT_R);
        const e = k * k * (3 - 2 * k);            // smoothstep falloff
        ty -= e * REACT_LIFT;
        scale += e * REACT_GROW;
      }
      f.style.transform = 'translateY(' + ty.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (reduce.matches) { paintStatic(); return; }
    if (raf || !visible) return;
    t0 = 0; raf = requestAnimationFrame(tick);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  measure();
  window.addEventListener('resize', measure);
  reduce.addEventListener?.('change', () => { stop(); start(); });
  // the figures' widths set the row width, so re-measure once they decode
  Promise.all(figs.map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })))
    .then(measure);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      for (const e of es) { visible = e.isIntersecting; visible ? start() : stop(); }
    }, { threshold: 0.05 });
    io.observe(section);
  } else { visible = true; start(); }
})();
