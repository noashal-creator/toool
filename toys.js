/* ─────────────────────────────────────────────────────────────────────
   TOOOL — the toys

   Five tiny "digital toys" that live as scroll sections under the game.
   No score, no goal, no win state — just short, intuitive things to do
   with the mouse while a midpoint is (conceptually) being found:

     1. reveal    — scratch away tiles to uncover A meeting B
     2. morph     — a slider that cross-fades A into B
     3. jelly     — a blob you drag and that springs back
     4. particles — an image shattered into dots that scatter and regroup
     5. swap      — click two tiles to trade their place in the composition

   Each toy is a self-contained block, guarded on its own DOM so a missing
   section is simply skipped. Shares no globals with app.js / game.js.
   Loop-driven toys (jelly, particles) run only while on-screen and stop
   entirely under prefers-reduced-motion. Sizes come from the same --sc
   unit system as the rest of the content column.
   ───────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const A = 'assets/object-a.jpg';
  const B = 'assets/object-b.jpg';
  const M = 'assets/midpoint.jpg';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* pointer capture that never throws (synthetic / already-released pointers) */
  function capture(el, id) { try { el.setPointerCapture && el.setPointerCapture(id); } catch (e) {} }

  /* draw an image so it covers a canvas, centre-cropped (device-pixel space) */
  function coverTo(canvas, img) {
    const c = canvas.getContext('2d');
    const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  /* run cb once the section scrolls into view; pause when it leaves.
     falls back to always-on if IntersectionObserver is missing. */
  function whileVisible(section, onEnter, onLeave) {
    if (!('IntersectionObserver' in window)) { onEnter(); return; }
    const io = new IntersectionObserver(entries => {
      for (const en of entries) en.isIntersecting ? onEnter() : (onLeave && onLeave());
    }, { threshold: 0.25 });
    io.observe(section);
  }

  /* ══ 1 · REVEAL ══════════════════════════════════════════════════════
     A grid of opaque tiles over the A|B split. Pointer (hover / press /
     drag) wipes tiles away to uncover the seam between the two objects.
     Once everything is bare, a scatter of tiles quietly grows back — so
     there is never a "finished" dead end. */
  (function reveal() {
    const section = document.getElementById('toy-reveal');
    const grid    = document.getElementById('reveal-tiles');
    if (!section || !grid) return;

    const COLS = 8, ROWS = 6, TOTAL = COLS * ROWS;
    grid.style.setProperty('--cols', COLS);
    grid.style.setProperty('--rows', ROWS);

    const tiles = [];
    for (let i = 0; i < TOTAL; i++) {
      const t = document.createElement('span');
      t.className = 'reveal-tile';
      grid.appendChild(t);
      tiles.push(t);
    }

    let refillTimer = 0;

    function bare() { return tiles.filter(t => t.classList.contains('is-bare')).length; }

    function strip(tile) {
      if (!tile || tile.classList.contains('is-bare')) return;
      tile.classList.add('is-bare');
      if (bare() >= TOTAL) scheduleRefill();
    }

    function scheduleRefill() {
      if (refillTimer) return;
      refillTimer = window.setTimeout(() => {
        refillTimer = 0;
        // grow back a random ~45% so there's always more to uncover
        for (const t of tiles) {
          if (Math.random() < 0.45) t.classList.remove('is-bare');
        }
      }, 650);
    }

    /* pointer down + drag paints tiles bare; a plain move also nibbles */
    let painting = false;
    function tileAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && el.classList && el.classList.contains('reveal-tile') ? el : null;
    }
    grid.addEventListener('pointerdown', e => {
      painting = true;
      capture(grid, e.pointerId);
      strip(tileAt(e.clientX, e.clientY));
    });
    grid.addEventListener('pointermove', e => {
      strip(tileAt(e.clientX, e.clientY));   // hover nibble + drag paint
      void painting;
    });
    grid.addEventListener('pointerup',   () => { painting = false; });
    grid.addEventListener('pointerleave', () => { painting = false; });
  })();

  /* ══ 2 · MORPH ═══════════════════════════════════════════════════════
     A and B stacked; dragging the handle (or anywhere on the stage) sets
     how far along the A→B spectrum you are, cross-fading between them —
     a naive live preview of what the machine does behind the scenes. */
  (function morph() {
    const section = document.getElementById('toy-morph');
    const top     = document.getElementById('morph-b');
    const handle  = document.getElementById('morph-handle');
    if (!section || !top || !handle) return;

    let t = 0.5;
    function apply() {
      top.style.opacity = t;
      handle.style.left = (t * 100) + '%';
      section.setAttribute('aria-valuenow', Math.round(t * 100));
    }
    function setFromX(clientX) {
      const r = section.getBoundingClientRect();
      t = clamp((clientX - r.left) / r.width, 0, 1);
      apply();
    }

    let dragging = false;
    section.addEventListener('pointerdown', e => {
      dragging = true;
      capture(section, e.pointerId);
      setFromX(e.clientX);
    });
    section.addEventListener('pointermove', e => { if (dragging) setFromX(e.clientX); });
    section.addEventListener('pointerup',   () => { dragging = false; });
    section.addEventListener('pointercancel', () => { dragging = false; });

    section.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { t = clamp(t - 0.05, 0, 1); apply(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { t = clamp(t + 0.05, 0, 1); apply(); e.preventDefault(); }
    });

    apply();
  })();

  /* ══ 3 · JELLY ═══════════════════════════════════════════════════════
     A soft blob of the midpoint image. Drag it anywhere; let go and it
     springs back to centre, wobbling and squashing along the way. Pure
     feel — the "pull between two poles" made physical. */
  (function jelly() {
    const section = document.getElementById('toy-jelly');
    const blob    = document.getElementById('jelly-blob');
    if (!section || !blob) return;

    let x = 0, y = 0, vx = 0, vy = 0;   // offset from centre (px) + velocity
    let grabbed = false, grabX = 0, grabY = 0;
    let running = false, visible = false, raf = 0, last = 0;

    const K = 120;     // spring stiffness
    const D = 11;      // damping

    function render() {
      const disp = Math.hypot(x, y);
      // stretch a little toward the direction it's being pulled
      const s = clamp(disp / 260, 0, 0.32);
      const ang = Math.atan2(y, x);
      const sx = 1 + s, sy = 1 - s * 0.7;
      blob.style.transform =
        `translate(-50%,-50%) translate(${x}px, ${y}px) rotate(${ang}rad) scale(${sx}, ${sy}) rotate(${-ang}rad)`;
    }

    function loop(now) {
      if (!running) return;
      if (!last) last = now;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;

      if (!grabbed) {
        // spring toward home (0,0)
        const ax = -K * x - D * vx;
        const ay = -K * y - D * vy;
        vx += ax * dt; vy += ay * dt;
        x  += vx * dt; y  += vy * dt;
        if (Math.hypot(x, y) < 0.4 && Math.hypot(vx, vy) < 0.4) {
          x = y = vx = vy = 0; render(); running = false; return;   // settled
        }
      }
      render();
      raf = requestAnimationFrame(loop);
    }
    function kick() {
      if (REDUCED || running || !visible) return;
      running = true; last = 0; raf = requestAnimationFrame(loop);
    }

    section.addEventListener('pointerdown', e => {
      const r = section.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      grabbed = true; vx = vy = 0;
      grabX = e.clientX - cx - x;
      grabY = e.clientY - cy - y;
      capture(section, e.pointerId);
      if (REDUCED) { render(); }
      kick();
    });
    section.addEventListener('pointermove', e => {
      if (!grabbed) return;
      const r = section.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const nx = clamp(e.clientX - cx - grabX, -r.width / 2, r.width / 2);
      const ny = clamp(e.clientY - cy - grabY, -r.height / 2, r.height / 2);
      vx = (nx - x) * 12; vy = (ny - y) * 12;   // remember throw velocity
      x = nx; y = ny;
      if (REDUCED) render(); else kick();
    });
    function release() {
      if (!grabbed) return;
      grabbed = false;
      if (REDUCED) { x = y = vx = vy = 0; render(); return; }   // snap home, no wobble
      kick();
    }
    section.addEventListener('pointerup', release);
    section.addEventListener('pointercancel', release);

    whileVisible(section,
      () => { visible = true; if (!grabbed && (x || y || vx || vy)) kick(); },
      () => { visible = false; running = false; });

    render();
  })();

  /* ══ 4 · PARTICLES ═══════════════════════════════════════════════════
     The midpoint image sampled into a cloud of dots. The pointer shoves
     the dots aside; springs pull each one home, so the picture keeps
     re-forming out of the scatter. */
  (function particles() {
    const section = document.getElementById('toy-particles');
    const canvas  = document.getElementById('particles-canvas');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    let ready = false;
    let W = 0, H = 0, dpr = 1, dot = 8;
    let pts = [];                       // {hx,hy,x,y,vx,vy,c}
    const mouse = { x: -1e4, y: -1e4, on: false };
    let running = false, visible = false, raf = 0, last = 0;

    const CAP = 2600;                   // hard ceiling on particle count
    const R = 92;                       // pointer influence radius (css px)

    function build() {
      if (!ready || !W || !H) return;
      // choose spacing so the cloud stays under CAP
      let gap = 13;
      if ((W / gap) * (H / gap) > CAP) gap = Math.sqrt((W * H) / CAP);
      dot = gap * 0.9;
      const cols = Math.max(1, Math.floor(W / gap));
      const rows = Math.max(1, Math.floor(H / gap));

      // sample the image's colours at cols×rows via a tiny offscreen canvas
      const off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      const octx = off.getContext('2d');
      const scale = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
      const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
      octx.drawImage(img, (cols - iw) / 2, (rows - ih) / 2, iw, ih);
      const data = octx.getImageData(0, 0, cols, rows).data;

      pts = new Array(cols * rows);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4;
          const hx = i * gap + gap / 2, hy = j * gap + gap / 2;
          pts[j * cols + i] = {
            hx, hy, x: hx, y: hy, vx: 0, vy: 0,
            c: `rgb(${data[k]},${data[k + 1]},${data[k + 2]})`,
          };
        }
      }
    }

    function measure() {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - dot / 2, p.y - dot / 2, dot, dot);
      }
    }

    function step(dt) {
      const k = 26, damp = 6;
      for (const p of pts) {
        if (mouse.on) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 0.001;
            const f = (1 - d / R) * 900;
            p.vx += (dx / d) * f * dt;
            p.vy += (dy / d) * f * dt;
          }
        }
        // spring home + damping
        p.vx += ((p.hx - p.x) * k - p.vx * damp) * dt;
        p.vy += ((p.hy - p.y) * k - p.vy * damp) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    function loop(now) {
      if (!running) return;
      if (!last) last = now;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    function start() { if (REDUCED || running || !visible || !ready) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
    function stop()  { running = false; last = 0; }

    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true;
      start();
    });
    canvas.addEventListener('pointerleave', () => { mouse.on = false; });

    img.onload = () => { ready = true; measure(); if (visible) start(); };
    img.src = M;

    window.addEventListener('resize', measure);
    whileVisible(section,
      () => { visible = true; start(); },
      () => { visible = false; stop(); });
  })();

  /* ══ 5 · SWAP ════════════════════════════════════════════════════════
     The midpoint sliced into a grid. Click one tile, click another, and
     they trade positions — you keep re-composing the picture out of its
     own pieces. */
  (function swap() {
    const section = document.getElementById('toy-swap');
    const grid    = document.getElementById('swap-grid');
    if (!section || !grid) return;

    const COLS = 5, ROWS = 4, TOTAL = COLS * ROWS;
    grid.style.setProperty('--cols', COLS);
    grid.style.setProperty('--rows', ROWS);

    const tiles = [];
    for (let i = 0; i < TOTAL; i++) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'swap-tile';
      // slice = which piece of the picture this tile currently shows
      setSlice(t, i);
      t.dataset.slice = i;
      grid.appendChild(t);
      tiles.push(t);
    }

    function setSlice(tile, idx) {
      const cx = idx % COLS, cy = Math.floor(idx / COLS);
      // background-position as a percentage across the (COLS-1)/(ROWS-1) track
      tile.style.backgroundPosition =
        `${(cx / (COLS - 1)) * 100}% ${(cy / (ROWS - 1)) * 100}%`;
    }

    let picked = null;
    grid.addEventListener('click', e => {
      const tile = e.target.closest('.swap-tile');
      if (!tile) return;
      if (!picked) { picked = tile; tile.classList.add('is-picked'); return; }
      if (picked === tile) { picked.classList.remove('is-picked'); picked = null; return; }

      // trade the two tiles' slices
      const a = picked.dataset.slice, b = tile.dataset.slice;
      setSlice(picked, b); picked.dataset.slice = b;
      setSlice(tile,   a); tile.dataset.slice   = a;

      picked.classList.remove('is-picked');
      tile.classList.add('is-swapped');
      picked.classList.add('is-swapped');
      const p = picked; picked = null;
      window.setTimeout(() => { p.classList.remove('is-swapped'); tile.classList.remove('is-swapped'); }, 260);
    });
  })();

  /* ══ 6 · WIPE ════════════════════════════════════════════════════════
     A spatial transition: B lives on top of A, clipped to the drag
     position, so dragging sweeps a hard seam across — A on one side,
     B on the other, the boundary itself the "in-between". */
  (function wipe() {
    const section = document.getElementById('toy-wipe');
    const b       = document.getElementById('wipe-b');
    const seam    = document.getElementById('wipe-seam');
    if (!section || !b) return;

    let t = 0.5;
    function apply() {
      b.style.clipPath = `inset(0 ${(1 - t) * 100}% 0 0)`;
      if (seam) seam.style.left = (t * 100) + '%';
      section.setAttribute('aria-valuenow', Math.round(t * 100));
    }
    function setX(cx) {
      const r = section.getBoundingClientRect();
      t = clamp((cx - r.left) / r.width, 0, 1);
      apply();
    }

    let drag = false;
    section.addEventListener('pointerdown', e => { drag = true; capture(section, e.pointerId); setX(e.clientX); });
    section.addEventListener('pointermove', e => { if (drag) setX(e.clientX); });
    section.addEventListener('pointerup',   () => { drag = false; });
    section.addEventListener('pointercancel', () => { drag = false; });
    section.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { t = clamp(t - 0.05, 0, 1); apply(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { t = clamp(t + 0.05, 0, 1); apply(); e.preventDefault(); }
    });

    apply();
  })();

  /* ══ 7 · DISSOLVE ════════════════════════════════════════════════════
     A mosaic where each cell shows A until the drag "progress" passes a
     random threshold, then it flips to B — so A melts into B tile by
     scattered tile rather than all at once. */
  (function dissolve() {
    const section = document.getElementById('toy-dissolve');
    const grid    = document.getElementById('dissolve-grid');
    if (!section || !grid) return;

    const COLS = 10, ROWS = 8, TOTAL = COLS * ROWS;
    grid.style.setProperty('--cols', COLS);
    grid.style.setProperty('--rows', ROWS);

    const cells = [];
    for (let i = 0; i < TOTAL; i++) {
      const cx = i % COLS, cy = Math.floor(i / COLS);
      const pos = `${(cx / (COLS - 1)) * 100}% ${(cy / (ROWS - 1)) * 100}%`;
      const cell = document.createElement('span');
      cell.className = 'dissolve-cell';
      cell.style.backgroundPosition = pos;
      const over = document.createElement('span');
      over.className = 'dissolve-over';
      over.style.backgroundPosition = pos;
      cell.appendChild(over);
      grid.appendChild(cell);
      // vary the reveal order by index so it looks scattered but is deterministic
      cells.push({ over, r: ((i * 2654435761) % 1000) / 1000 });
    }

    let p = 0.5;
    function apply() {
      for (const c of cells) c.over.style.opacity = (c.r < p) ? 1 : 0;
      section.setAttribute('aria-valuenow', Math.round(p * 100));
    }
    function setX(cx) {
      const r = section.getBoundingClientRect();
      p = clamp((cx - r.left) / r.width, 0, 1);
      apply();
    }

    let drag = false;
    section.addEventListener('pointerdown', e => { drag = true; capture(section, e.pointerId); setX(e.clientX); });
    section.addEventListener('pointermove', e => { if (drag) setX(e.clientX); });
    section.addEventListener('pointerup',   () => { drag = false; });
    section.addEventListener('pointercancel', () => { drag = false; });
    section.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { p = clamp(p - 0.05, 0, 1); apply(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { p = clamp(p + 0.05, 0, 1); apply(); e.preventDefault(); }
    });

    apply();
  })();

  /* ══ 8 · FLIP ════════════════════════════════════════════════════════
     A 3D card: A on the front, B on the back. Drag to spin it; the thin
     edge-on moment is the transition. On release it settles to whichever
     face is nearer. */
  (function flip() {
    const section = document.getElementById('toy-flip');
    const card    = document.getElementById('flip-card');
    if (!section || !card) return;

    let deg = 0, dragging = false, lastX = 0;
    let running = false, visible = false, snapping = false, target = 0, raf = 0, last = 0;

    function render() { card.style.transform = `rotateY(${deg}deg)`; }

    function loop(now) {
      if (!running) return;
      if (!last) last = now;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      if (snapping) {
        deg += (target - deg) * Math.min(1, dt * 10);
        if (Math.abs(target - deg) < 0.3) { deg = target; snapping = false; render(); running = false; return; }
        render();
        raf = requestAnimationFrame(loop);
      } else { running = false; }
    }
    function kick() { if (REDUCED || running || !visible) return; running = true; last = 0; raf = requestAnimationFrame(loop); }

    section.addEventListener('pointerdown', e => {
      dragging = true; snapping = false; lastX = e.clientX; capture(section, e.pointerId);
    });
    section.addEventListener('pointermove', e => {
      if (!dragging) return;
      deg += (e.clientX - lastX) * 0.6; lastX = e.clientX;
      render();
    });
    function release() {
      if (!dragging) return;
      dragging = false;
      target = Math.round(deg / 180) * 180;      // settle to the nearer face
      if (REDUCED) { deg = target; render(); return; }
      snapping = true; kick();
    }
    section.addEventListener('pointerup', release);
    section.addEventListener('pointercancel', release);

    whileVisible(section,
      () => { visible = true; if (snapping) kick(); },
      () => { visible = false; running = false; });

    render();
  })();

  /* ══ 9 · BRUSH ═══════════════════════════════════════════════════════
     A is the base; wherever you drag, B is smeared in through a soft
     round brush (an accumulating mask). The hybrid is literally painted
     by your own hand. */
  (function brush() {
    const section = document.getElementById('toy-brush');
    const canvas  = document.getElementById('brush-canvas');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');

    const imgA = new Image(), imgB = new Image();
    let loaded = 0, ready = false;
    let BW = 0, BH = 0, dpr = 1, radius = 40;
    let aC, bC, maskC, mixC, maskCtx, mixCtx;
    let painting = false, lastX = 0, lastY = 0;

    const layer = () => { const c = document.createElement('canvas'); c.width = BW; c.height = BH; return c; };

    function build() {
      if (!ready || !BW) return;
      aC = layer(); bC = layer(); maskC = layer(); mixC = layer();
      maskCtx = maskC.getContext('2d'); mixCtx = mixC.getContext('2d');
      coverTo(aC, imgA); coverTo(bC, imgB);
      render();
    }
    function measure() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      BW = Math.max(1, Math.round(r.width * dpr));
      BH = Math.max(1, Math.round(r.height * dpr));
      canvas.width = BW; canvas.height = BH;
      radius = 0.10 * Math.min(BW, BH);
      build();
    }
    function render() {
      if (!aC) return;
      ctx.clearRect(0, 0, BW, BH);
      ctx.drawImage(aC, 0, 0);
      mixCtx.globalCompositeOperation = 'source-over';
      mixCtx.clearRect(0, 0, BW, BH);
      mixCtx.drawImage(bC, 0, 0);
      mixCtx.globalCompositeOperation = 'destination-in';   // keep B only where painted
      mixCtx.drawImage(maskC, 0, 0);
      mixCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(mixC, 0, 0);
    }
    function stamp(x, y) {
      const g = maskCtx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.65, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      maskCtx.fillStyle = g;
      maskCtx.beginPath(); maskCtx.arc(x, y, radius, 0, Math.PI * 2); maskCtx.fill();
    }
    function paintTo(x, y) {
      const dx = x - lastX, dy = y - lastY, dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(dist / (radius * 0.35)));
      for (let i = 1; i <= steps; i++) stamp(lastX + dx * i / steps, lastY + dy * i / steps);
      lastX = x; lastY = y; render();
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };

    canvas.addEventListener('pointerdown', e => {
      if (!ready) return;
      painting = true; capture(canvas, e.pointerId);
      const [x, y] = pos(e); lastX = x; lastY = y; stamp(x, y); render();
    });
    canvas.addEventListener('pointermove', e => { if (painting) { const [x, y] = pos(e); paintTo(x, y); } });
    canvas.addEventListener('pointerup',   () => { painting = false; });
    canvas.addEventListener('pointercancel', () => { painting = false; });

    imgA.onload = imgB.onload = () => { if (++loaded === 2) { ready = true; measure(); } };
    imgA.src = A; imgB.src = B;
    window.addEventListener('resize', measure);
  })();

  /* ══ 10 · TUG OF WAR ═════════════════════════════════════════════════
     A puck on a rope between the two poles. Drag and throw it along the
     spectrum; let go and it springs back to the MIDPOINT — the system
     always pulling the in-between toward the middle. The background
     blend tracks the puck. */
  (function tug() {
    const section = document.getElementById('toy-tug');
    const top     = document.getElementById('tug-b');
    const puck    = document.getElementById('tug-puck');
    if (!section || !top || !puck) return;

    let t = 0.5, v = 0, grabbed = false;
    let running = false, visible = false, raf = 0, last = 0;
    const HOME = 0.5, K = 90, D = 12;

    function apply() { top.style.opacity = t; puck.style.left = (t * 100) + '%'; }

    function loop(now) {
      if (!running) return;
      if (!last) last = now;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      if (!grabbed) {
        const a = -K * (t - HOME) - D * v;
        v += a * dt; t = clamp(t + v * dt, 0, 1);
        if (Math.abs(t - HOME) < 0.002 && Math.abs(v) < 0.002) { t = HOME; v = 0; apply(); running = false; return; }
      }
      apply();
      raf = requestAnimationFrame(loop);
    }
    function kick() { if (REDUCED || running || !visible) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
    function setX(cx) { const r = section.getBoundingClientRect(); const nt = clamp((cx - r.left) / r.width, 0, 1); v = (nt - t) * 12; t = nt; apply(); }

    section.addEventListener('pointerdown', e => { grabbed = true; v = 0; capture(section, e.pointerId); setX(e.clientX); });
    section.addEventListener('pointermove', e => { if (grabbed) setX(e.clientX); });
    function release() { if (!grabbed) return; grabbed = false; if (REDUCED) { t = HOME; v = 0; apply(); return; } kick(); }
    section.addEventListener('pointerup', release);
    section.addEventListener('pointercancel', release);

    whileVisible(section,
      () => { visible = true; if (Math.abs(t - HOME) > 0.002 || Math.abs(v) > 0.002) kick(); },
      () => { visible = false; running = false; });

    apply();
  })();

  /* ══ 11 · MELT ═══════════════════════════════════════════════════════
     B waits underneath. Hold anywhere and the columns of A above your
     finger soften and drip downward under gravity, uncovering B — a
     transition that flows instead of cutting. */
  (function melt() {
    const section = document.getElementById('toy-melt');
    const canvas  = document.getElementById('melt-canvas');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');

    const imgA = new Image(), imgB = new Image();
    let loaded = 0, ready = false;
    let BW = 0, BH = 0, dpr = 1;
    let aC, bC;
    const COLS = 64;
    let off = [], vel = [];
    const mouse = { x: -1e4, y: -1e4, down: false };
    let running = false, visible = false, raf = 0, last = 0;

    const layer = () => { const c = document.createElement('canvas'); c.width = BW; c.height = BH; return c; };

    function build() {
      if (!ready || !BW) return;
      aC = layer(); bC = layer();
      coverTo(aC, imgA); coverTo(bC, imgB);
      off = new Array(COLS).fill(0); vel = new Array(COLS).fill(0);
      render();
    }
    function measure() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      BW = Math.max(1, Math.round(r.width * dpr));
      BH = Math.max(1, Math.round(r.height * dpr));
      canvas.width = BW; canvas.height = BH;
      build();
    }
    function render() {
      if (!aC) return;
      ctx.clearRect(0, 0, BW, BH);
      ctx.drawImage(bC, 0, 0);                    // B underneath
      const colW = BW / COLS;
      for (let i = 0; i < COLS; i++) {
        const o = off[i];
        if (o >= BH) continue;                    // column fully melted away → all B
        const sx = Math.floor(i * colW), w = Math.ceil(colW) + 1;
        ctx.drawImage(aC, sx, 0, w, BH, sx, o, w, BH);   // A column slid down by o
      }
    }
    function step(dt) {
      const colW = BW / COLS, g = BH * 1.1, rad = BW * 0.10;
      let active = false;
      for (let i = 0; i < COLS; i++) {
        if (mouse.down) {
          const d = Math.abs((i + 0.5) * colW - mouse.x);
          if (d < rad) vel[i] += g * dt * (1 - d / rad);
        }
        if (vel[i] > 0) {
          vel[i] += g * 0.6 * dt;                 // gravity keeps the drip going
          off[i] += vel[i] * dt;
          if (off[i] >= BH) { off[i] = BH; vel[i] = 0; }
          else active = true;
        }
      }
      return active || mouse.down;
    }
    function loop(now) {
      if (!running) return;
      if (!last) last = now;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      const active = step(dt);
      render();
      if (active) raf = requestAnimationFrame(loop); else running = false;
    }
    function start() { if (REDUCED || running || !visible || !ready) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
    const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };

    canvas.addEventListener('pointerdown', e => {
      if (!ready) return;
      capture(canvas, e.pointerId);
      const [x, y] = pos(e); mouse.x = x; mouse.y = y; mouse.down = true;
      if (REDUCED) {                              // no loop: reveal nearby columns at once
        const colW = BW / COLS, rad = BW * 0.12;
        for (let i = 0; i < COLS; i++) if (Math.abs((i + 0.5) * colW - x) < rad) off[i] = BH;
        render(); return;
      }
      start();
    });
    canvas.addEventListener('pointermove', e => { const [x, y] = pos(e); mouse.x = x; mouse.y = y; if (mouse.down && !REDUCED) start(); });
    canvas.addEventListener('pointerup',   () => { mouse.down = false; });
    canvas.addEventListener('pointerleave', () => { mouse.down = false; });

    imgA.onload = imgB.onload = () => { if (++loaded === 2) { ready = true; measure(); } };
    imgA.src = A; imgB.src = B;
    window.addEventListener('resize', measure);
    whileVisible(section, () => { visible = true; }, () => { visible = false; running = false; });
  })();

  /* ══ 12 · POP ════════════════════════════════════════════════════════
     Three bands of stop motion, played one after another: orbit, then a
     row with a wave running along it, then one pop hopping across. Five
     cut-outs of the same object part-way through becoming a lollipop.

     Each move is a PURE FUNCTION of the integer tick — tick in, list of
     actors out — holding nothing between frames. That is what makes the
     bands cheap to gate: a band that scrolls out of view simply stops
     being drawn, and when it comes back the same tick reproduces exactly
     the same picture, with no state to have gone stale meanwhile.

     One clock drives all three, so the three bands step together instead
     of drifting apart as separate timers would. The clock only runs while
     at least one band is on screen. */
  (function pop() {
    const sections = [...document.querySelectorAll('[data-pop]')];
    if (!sections.length) return;

    const REEL = [1, 2, 3, 4, 5].map(n => `assets/pop-cut/w${n}.png`);

    /* Declared up here, not down beside wireUpload: wireUpload is a hoisted
       function declaration but a const is not hoisted, so calling it before
       this line executes throws a ReferenceError out of the temporal dead zone.
       That cost a debugging round once already, and again when the remembered
       background was added — hence every constant wireUpload touches lives
       here, above the loop that calls it. */
    const DEFAULT_BG = 'assets/pop-bg-default.jpg';
    const BG_KEY     = 'toool.pop.bg';     // remembered upload, survives reloads
    const BG_MAX_W   = 1920;               // plenty for a full-bleed band
    const BG_QUALITY = 0.82;

    for (const src of REEL) { const pre = new Image(); pre.src = src; }

    /* hash noise in 0..1. Deterministic on purpose: the same tick always
       yields the same wobble, so the loop repeats exactly rather than
       drifting, and a band that pauses resumes without a jump. */
    const N = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    const S = (a, b) => N(a, b) - 0.5;

    /* ── the revolution ─────────────────────────────────────────────────
       The ring turns on its OWN, continuously and slowly, the whole time it is
       open — a gentle carousel, not one quick revolution that stops. (It used
       to fire a single bounded ~3.2s turn the moment the ring opened and then
       sit dead still; the ask was for it to keep playing — turning, rising and
       falling — pleasantly and unhurried.)

       Continuous, not stepped: a slow steady rotation reads as calm, where the
       stop-motion stepping only suited the quick one-shot. Time-driven
       (performance.now) so it stays stateless between frames — the same clock
       always yields the same angle, a band that scrolls away and back resumes
       exactly, nothing accumulates. One turn every SPIN_PERIOD_MS: raise it to
       go gentler, lower it to speed the turn up. */
    const SPIN_PERIOD_MS   = 12000;  // one slow, gentle revolution of the ring
    const SPIN_BOB         = 9;      // % of band each pop rides up / down on its stick
    const CAROUSEL_CYCLES  = 3;      // up/downs each pop makes per full turn (merry-go-round pace)
    const CAROUSEL_WAVE    = 2;      // wave crests travelling around the 8-pop ring at once
    let spin = 0, ambientRaf = 0;

    /* Ticks in one open-and-close of the ring. It lives out here because BOTH
       drivers have to agree on it: the vertical crank counts ticks up to it,
       and the sideways reel maps a slide's scrub straight onto it. They did not
       agree — the reel was cranking to 26 against an arc of 40 — so the ring
       ran out of scroll a fifth of the way into its closing and never gathered
       back up, and each of those 26 steps was a bigger jump than the arc was
       drawn for, which is what made it read as coarse. */
    const CONVERGE_P = 40;

    /* the ambient clock: advance the angle off wall-time and repaint. Runs only
       while a band is on screen (started/stopped in retime), and never under
       reduced motion. Wrapping from ~2*PI back to 0 is seamless because sin/cos
       are periodic, so nothing snaps at the loop point. */
    function ambientLoop(now) {
      spin = ((now % SPIN_PERIOD_MS) / SPIN_PERIOD_MS) * Math.PI * 2;
      paint();
      ambientRaf = requestAnimationFrame(ambientLoop);
    }
    function startAmbient() { if (REDUCED || ambientRaf) return; ambientRaf = requestAnimationFrame(ambientLoop); }
    function stopAmbient()  { if (ambientRaf) { cancelAnimationFrame(ambientRaf); ambientRaf = 0; } }

    /* actor: { i: cut-out, x/y: % of band, h: height as % of band,
                r: degrees, z: paint order } */
    const MOVES = {
      converge: t => {
        /* The arc reads closed -> open -> closed, not the reverse: you meet a
           single lollipop, it blooms into a ring, the ring turns once, and it
           collapses back to one. `pull` scales the ring radius, so 0 is
           gathered and 1 is open.

           The flat middle is the point of the shape. A plain triangle peaks for
           a single tick and starts closing immediately, which leaves the turn
           nowhere to happen — the circle has to actually stand open for a beat.

           Derived from the tick, deliberately, and not from the pin geometry:
           sideways mode feeds this same `t` from the slide's dwell fraction
           (see onScroll), so anything read off the vertical pin would break the
           reel silently. */
        /* 40 steps to the arc, not 26. Slowing the crank alone would have made
           the same big jumps arrive less often, which is slower but no gentler
           — the jerk per step is what reads as harsh. More steps make each
           position change smaller, so the motion softens without giving up the
           stepping, which is the whole look. */
        const P = CONVERGE_P;               // ticks per open-and-close
        /* t may arrive FRACTIONAL (the sideways scrub feeds it straight from
           the slide's progress). The ring's geometry is taken from the exact
           value, so it grows and gathers smoothly under your scroll; the frame
           index and the per-frame wobble below still use the whole tick, so the
           cut-outs keep changing in stop motion. Reading everything off the
           rounded tick is what made the scrub read as coarse: the radius could
           only move in the arc's 1/15 steps however finely you scrolled. */
        const p = (t % P + P) % P / P;
        const tick = Math.round(t);
        const OPEN_AT = 0.38, CLOSE_AT = 0.62;
        const pull = p < OPEN_AT  ? p / OPEN_AT
                   : p < CLOSE_AT ? 1
                   : 1 - (p - CLOSE_AT) / (1 - CLOSE_AT);

        /* Sized and spread to fill the frame without touching it. The x radius
           is much wider than the y: the band is a landscape box, so an even
           ring left dead margins down both sides and read as a cluster adrift
           in the middle rather than a composition made for the page.

           These numbers can be tuned to the edge once and trusted, because the
           stage's height is fixed in the same 1080 units as its width — the
           aspect is content-w/1080 on every screen, so the margins never move.
           Extent works out at roughly x 5-95 / y 15-89. */
        /* h/y are tuned to the cut-outs' 325x800 canvas. The sticks were
           lengthened there (the photos ended before the stick did), which grew
           the canvas by a quarter — so h is up a quarter to hold the head at
           the same 166px, and y is down 4 to put the head back where it was,
           since a taller image floats its head upward off the box centre.
           The y radius came down with it: the objects are taller now, and the
           old spread would have run the stick tips to 97% of the band. */
        /* The ring rotates continuously off the ambient clock (see spin), so
           the pops orbit the ellipse the whole time the ring is open — turning,
           and rising and falling as they travel around it — slowly and on their
           own. pull scales both the orbit radius and the bob, so a gathered ring
           collapses to the centre and the motion simply isn't seen there. */
        /* SIZE morph (no opacity, ever): as the ring opens (pull 0→~0.35) the
           single big "answer" head SHRINKS away while the ring heads GROW in and
           spread — so the big-head → small-heads change is a smooth burst
           instead of the old hard cut at pull 0.22. Pure scale, nothing fades. */
        const xf = Math.max(0, Math.min(1, pull / 0.35));
        const RING_H = 40;   // bumped from 33.7 — the ring pops were a touch small
        const out = Array.from({ length: 8 }, (_, k) => {
          const a = k * (Math.PI * 2 / 8) + spin;
          /* While the ring turns, neighbours ride opposite each other — one up
             while the next goes down — and trade places halfway through, so the
             turn is a MERRY-GO-ROUND: each pop rides up and down on its stick
             like a carousel horse as the ring turns, and the pops are phase-
             offset around the ring so the heights read as a wave travelling
             around it (CAROUSEL_WAVE crests at once), a few rides per turn
             (CAROUSEL_CYCLES). It needs no gate: it is scaled by pull, so a
             gathered ring collapses to the centre and the ride isn't seen. */
          const bob = Math.sin(spin * CAROUSEL_CYCLES - k * (Math.PI * 2 / 8) * CAROUSEL_WAVE)
                      * SPIN_BOB * pull;
          return {
            /* fixed stage per pop — NO stop-motion frame-swap. The 8 pops show
               the 5 transformation stages at once (a spectrum around the ring)
               and just rotate/gather smoothly; swapping between the static PNGs
               would either strobe (stop-motion) or need a fade (ruled out). */
            i: k % 5,
            x: 50 + Math.cos(a) * 37 * pull,
            /* y 54 and a 15 radius, not 56/18: the lengthened sticks reach
               much further below each anchor point, and the old spread put the
               lowest tip at 94% of the frame — right against the edge, so the
               stick ends read as cut. This holds the same head size and lands
               the lowest tip at 89%. */
            y: 50.9 + Math.sin(a) * 15 * pull + bob,
            h: RING_H * xf,                           // grow in from nothing as it opens (no fade)
            r: S(k, 16) * 20,                          // fixed tilt per pop (the tick-based wobble strobed on a continuous tick)
            /* the one further down the ellipse is the one nearer the camera */
            z: Math.round(Math.sin(a) * 8) + 10
          };
        });

        /* At the bottom of the pull all eight sit on the same spot and read as
           mush. One resolved frame on top turns that into the point of the
           loop: the pile arrives at an answer. Alternating 1 and 5 lands it on
           the two ends of the transformation — the photographed face, then the
           finished pop — so consecutive gathers never repeat themselves. */
        if (xf < 1) {
          /* the big "answer" head starts at 52 and SHRINKS to nothing as the
             ring grows in — a size burst, no fade — so it bursts INTO the ring
             instead of cutting to it. Fixed stage (2 = the midpoint), no
             stop-motion alternation. */
          out.push({ i: 2, x: 50, y: 49.9, h: 52 * (1 - xf), r: 0, z: 99 });
        }
        return out;
      }
    };

    for (const sec of sections) {
      sec._move  = MOVES[sec.dataset.pop];
      sec._stage = sec.querySelector('.pop-actors');
      sec._pool  = [];
      sec._live  = false;
      wireUpload(sec);
    }

    /* Each band takes its own background photo, on its own layer over the
       painted ground rather than replacing it — so the actors never know
       anything happened, and there is always something to fall back to.

       Three states, in order of preference: a remembered upload, else the
       DEFAULT_BG file, else the painted svg. That ordering is why "clear"
       returns to the default rather than to a hole, and why a missing
       DEFAULT_BG costs nothing — the band just shows its painted ground.

       The upload is REMEMBERED across reloads. Before this it lived in an
       object URL, which dies with the page: the background had to be
       re-uploaded every single refresh, which is no way to hold a default.
       It is downscaled and re-encoded to a data URL first — localStorage
       holds strings and caps out around 5MB, and a camera-sized photo as
       base64 blows straight past that. */
    function shrinkToDataURL(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
          const scale = Math.min(1, BG_MAX_W / im.naturalWidth);
          const c = document.createElement('canvas');
          c.width  = Math.round(im.naturalWidth  * scale);
          c.height = Math.round(im.naturalHeight * scale);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          try { resolve(c.toDataURL('image/jpeg', BG_QUALITY)); }
          catch (e) { reject(e); }              // tainted canvas, etc.
        };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
        im.src = url;
      });
    }

    function wireUpload(sec) {
      const btn   = sec.querySelector('[data-pop-upload]');
      const clear = sec.querySelector('[data-pop-clear]');
      const file  = sec.querySelector('[data-pop-file]');
      const photo = sec.querySelector('.pop-photo');
      if (!btn || !file || !photo) return;

      function show(src) {
        photo.onload  = () => { photo.hidden = false; };
        photo.onerror = () => { photo.hidden = true; photo.removeAttribute('src'); };
        photo.src = src;
      }

      let saved = null;
      try { saved = localStorage.getItem(BG_KEY); } catch (e) {}   // private mode
      show(saved || DEFAULT_BG);                 // an absent file simply never loads
      if (clear) clear.hidden = !saved;

      btn.addEventListener('click', () => file.click());

      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        file.value = '';                         // so the same file re-triggers
        if (!f) return;
        shrinkToDataURL(f).then(data => {
          show(data);
          if (clear) clear.hidden = false;
          /* Showing it is the job; remembering it is a bonus. A quota failure
             must not cost the user the background they just picked. */
          try { localStorage.setItem(BG_KEY, data); }
          catch (e) { console.warn('[pop] background shown but too large to remember', e); }
        }).catch(() => { /* not a decodable image — leave the ground alone */ });
      });

      if (clear) clear.addEventListener('click', () => {
        clear.hidden = true;
        try { localStorage.removeItem(BG_KEY); } catch (e) {}
        show(DEFAULT_BG);                        // back to the default, not to nothing
      });
    }

    function draw(sec, t) {
      const list = sec._move(t), pool = sec._pool;
      while (pool.length < list.length) {
        const img = document.createElement('img');
        img.className = 'pop-actor';
        img.alt = '';
        sec._stage.appendChild(img);
        pool.push(img);
      }
      pool.forEach((img, k) => {
        const a = list[k];
        if (!a) { img.style.display = 'none'; return; }
        img.style.display = '';
        /* only touch src when the stage actually changes — reassigning it
           every tick makes the browser re-decode and the band flickers */
        if (img._i !== a.i) { img.src = REEL[a.i]; img._i = a.i; }
        img.style.height = a.h + '%';
        img.style.zIndex = a.z ?? 1;
        img.style.transform =
          `translate(${a.x}cqw, ${a.y}cqh) translate(-50%, -50%) rotate(${a.r}deg)`;
      });
    }

    /* ── the crank ──────────────────────────────────────────────────────
       Scrolling advances the film. The tick moves on once per PX_PER_TICK
       pixels travelled rather than once per interval, so the rate of change
       is (pixels-per-second ÷ PX_PER_TICK) — directly proportional to how
       fast the page is moving. Drift and the row changes a stage at a time;
       flick and the whole transformation rips past; stop and it holds on
       whatever frame it landed on, which is the honest stop-motion state:
       the crank is not turning, so the film is not moving.

       Scrolling up runs the tick backwards, so the bands scrub both ways.

       IDLE_FPS is 0 on purpose. A parked band used to keep ticking at 2fps to
       "breathe", but that quietly destroyed the whole point: wave changes
       stage on EVERY tick, so the row morphed continuously whether or not the
       page moved, and there was no way to tell that scrolling was driving
       anything — it read as an animation that ignores you. Dead still when
       parked is what makes the scroll linkage legible. Raise it only if you
       want ambient motion back, knowing it costs that legibility. */
    /* PX_PER_TICK is the whole feel of it: fewer pixels per tick means the
       film cranks faster for the same scroll. MIN_MS has to come down with
       it or it becomes the real limit and simply eats the extra ticks —
       at 35px a tick, a normal scroll asks for well over the 18 ticks a
       second that a 55ms floor allows, so the speed-up would be invisible. */
    const PX_PER_TICK = 28;
    const MIN_MS      = 20;    // ~50 ticks/sec ceiling, so a fling still can't strobe
    const IDLE_FPS    = 0;

    let t = 0, acc = 0, lastY = window.scrollY, lastStep = 0, idle = null;

    function paint() {
      for (const s of sections) if (s._live) draw(s, t);
    }

    function onScroll() {
      /* sideways mode: the reel owns pinning + scroll distance; crank the film
         deterministically from the slide's scrub. The whole arc is mapped onto
         it — 0 = one lollipop, the ring blooms open, stands turning, and
         gathers back to one at CONVERGE_P — so scrolling the slide plays the
         move end to end. Reverses cleanly on scroll-back. */
      if (window.reelMode?.active()) {
        const p = window.reelMode.progress(sections[0]);
        if (p == null) return;
        const nt = p * CONVERGE_P;          // exact, not rounded — see MOVES.converge
        if (Math.abs(nt - t) > 1e-3) { t = nt; paint(); }
        return;
      }
      const y = window.scrollY, dy = y - lastY;
      lastY = y;
      if (!dy) return;

      /* clamped: one fling event can land 600px, and an unbounded debt would
         make the next nudge of the wheel jump several frames at once */
      acc = Math.min(acc + Math.abs(dy), PX_PER_TICK * 2);
      if (acc < PX_PER_TICK) return;

      const now = performance.now();
      if (now - lastStep < MIN_MS) return;
      lastStep = now;

      acc -= PX_PER_TICK;         // keep the remainder: many small scrolls
                                  // should add up the same as one big one
      t += dy > 0 ? 1 : -1;
      paint();
    }

    /* ── the pin ────────────────────────────────────────────────────────
       A gather-and-scatter costs 26 ticks x 20px = 520px of scrolling, so
       against a one-screen band the whole thing flashed past in a moment.
       Slowing the crank would have fixed the duration and undone the speed,
       which are separate things: what the band needed was more scroll to
       spend, not slower motion.

       So the <section> becomes a tall runway and .pop-stage is held still
       inside it — same band height as every other section, centred in the
       window — for PIN_SCREENS worth of scrolling. The crank already counts
       pixels, so pinning simply hands it more of them: ~2.5 gathers instead
       of half of one. It also ends the edge-cropping for good, since the
       frame no longer travels past the top and bottom of the screen.

       position:fixed rather than position:sticky, and not by preference:
       body carries overflow-x:hidden, which makes body a scroll container
       and stops sticky from ever sticking to the viewport. hero.js pins the
       spectrum band the same way for the same reason. */
    const PIN_SCREENS = 1.6;
    const stage = sections[0] && sections[0].querySelector('.pop-stage');
    let pinLeft = 0, pinW = 0, stageH = 0, pinRange = 0;

    function measure() {
      const sec = sections[0];
      if (!stage || !sec) return;
      if (window.reelMode?.active()) {              // reel owns pinning + scroll distance
        sec.style.height = '';                      // no runway
        stage.style.cssText = '';                   // drop any fixed-pin inline; CSS lays it in-slide
        onScroll();                                 // paint at the current reel progress
        return;
      }
      if (REDUCED || window.innerWidth <= 860) {   // no pin: plain band
        sec.style.height = '';
        stage.style.cssText = '';
        return;
      }
      const r = sec.getBoundingClientRect();
      pinLeft = r.left;
      pinW    = sec.clientWidth;
      sec.style.height = '';                       // read the CSS band height
      stageH   = stage.offsetHeight;
      pinRange = Math.round(window.innerHeight * PIN_SCREENS);
      sec.style.height = (stageH + pinRange) + 'px';
      place();
    }

    function place() {
      if (window.reelMode?.active()) return;   // the reel owns pinning in sideways mode
      const sec = sections[0];
      if (!stage || !sec || !pinRange) return;
      const top = sec.getBoundingClientRect().top;
      /* Centred in the window while pinned — and deliberately allowed to go
         NEGATIVE when the band is taller than the screen. Clamping it at 0 hung
         the band from the top edge and dumped all the overflow at the bottom,
         which clipped the stick tips once they were lengthened. Centring splits
         that overflow between the empty margins at top and bottom, where the
         composition never reaches, so nothing of it is ever cut. */
      const gap = (window.innerHeight - stageH) / 2;
      const s = stage.style;
      if (top > gap) {                              // before — parked at the top
        s.position = 'absolute'; s.top = '0'; s.bottom = 'auto'; s.left = '0'; s.width = '100%';
      } else if (gap - top < pinRange) {            // pinned
        s.position = 'fixed'; s.top = gap + 'px'; s.bottom = 'auto';
        s.left = pinLeft + 'px'; s.width = pinW + 'px';
      } else {                                      // after — parked at the bottom
        s.position = 'absolute'; s.top = 'auto'; s.bottom = '0'; s.left = '0'; s.width = '100%';
      }
    }

    function onScrollAll() { place(); onScroll(); }

    function retime() {
      const live = sections.some(s => s._live);
      if (live && !idle) {
        lastY = window.scrollY;   // no phantom jump on re-entry
        acc = 0;
        window.addEventListener('scroll', onScrollAll, { passive: true });
        if (IDLE_FPS > 0) idle = setInterval(() => { t++; paint(); }, 1000 / IDLE_FPS);
        else idle = true;
        startAmbient();           // the ring turns on its own while on screen
      } else if (!live && idle) {
        window.removeEventListener('scroll', onScrollAll);
        if (idle !== true) clearInterval(idle);
        idle = null;
        stopAmbient();
      }
    }

    /* These bands do NOT use whileVisible. That helper arms at a quarter of
       the section's own height, which is the right call for a toy you have to
       be looking at to play with — but a pop band is 1080 units tall against
       a shorter viewport, so it would need ~210px showing before it woke up.
       Stacked three deep, that left a partly-visible band frozen at the top
       or bottom edge of the screen while the middle one cranked along: the
       bands visibly disagreed about whether scrolling did anything.

       Threshold 0 instead — any overlap at all makes a band live — plus a
       margin so it is already running by the time its first pixel shows.
       isIntersecting is unambiguous at threshold 0, which the quarter
       threshold could not promise either. */
    for (const sec of sections) {
      draw(sec, 0);                              // never show an empty band
      if (REDUCED) continue;                     // one held frame, no motion
    }

    if (!REDUCED) {
      measure();
      window.addEventListener('resize', measure);
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
          for (const en of entries) en.target._live = en.isIntersecting;
          retime();
          place();      // park correctly even on the edge where the crank sleeps
        }, { threshold: 0, rootMargin: '200px 0px' });
        for (const sec of sections) io.observe(sec);
      } else {
        for (const sec of sections) sec._live = true;
        retime();
      }
    }
  })();

})();
