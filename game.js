/* ─────────────────────────────────────────────────────────────────────
   TOOOL — the game (Figma frame "משחק", node 2444-626)

   A falling-object catcher: the HP DeskJet printer is the paddle and moves
   ONLY horizontally (mouse / arrow keys / touch); ladybugs drop from the
   top and the printer "eats" the ones it's under when they reach the tray.
   Self-contained — shares no globals with app.js.
   ───────────────────────────────────────────────────────────────────── */

(function () {
  const section = document.getElementById('game');
  const field   = document.getElementById('game-field');
  const printer = document.getElementById('game-printer');
  const scoreEl = document.getElementById('game-score');
  if (!section || !field || !printer || !scoreEl) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* the 7 ladybugs of the design, in frame-design coordinates (1288×1083) */
  const START_BUGS = [
    [74, 64], [332, 258], [650, 115], [908, 347],
    [621, 494], [966, 676], [332, 620],
  ];
  const DSGN_W = 1288, BUG_W = 220, BUG_H = 147;

  /* geometry, refreshed on measure() */
  let W = 0, H = 0, scale = 1, printerW = 0, printerH = 0, bugW = 0, bugH = 0;

  /* state */
  let printerX = 0;              // printer left, px
  const bugs = [];              // { el, x, y, vy, caught }
  let score = 0;
  let running = false;          // rAF loop active (section on-screen)
  let started = false;          // the falling game has begun at least once
  let last = 0, sinceSpawn = 0, spawnGap = 950, elapsed = 0;

  /* ── geometry ─────────────────────────────────────────────────────── */

  function measure() {
    const prevW = W, prevH = H;
    const r = field.getBoundingClientRect();
    W = r.width; H = r.height;
    scale = W / DSGN_W;
    printerW = printer.offsetWidth;
    printerH = printer.offsetHeight;
    bugW = BUG_W * scale;
    bugH = BUG_H * scale;

    /* keep everything proportional across a resize */
    if (prevW && prevH && (prevW !== W || prevH !== H)) {
      const rx = W / prevW, ry = H / prevH;
      printerX *= rx;
      for (const b of bugs) { b.x *= rx; b.y *= ry; b.vy *= ry; }
    }
    printerX = clampX(printerX);
    placePrinter();
    for (const b of bugs) placeBug(b);
  }

  const clampX = x => Math.max(0, Math.min(x, W - printerW));
  const placePrinter = () => printer.style.setProperty('--px', printerX + 'px');

  function placeBug(b) {
    b.el.style.setProperty('--lx', b.x + 'px');
    b.el.style.setProperty('--ly', b.y + 'px');
  }

  function makeBug(x, y, vy) {
    const el = document.createElement('img');
    el.className = 'ladybug';
    el.src = 'assets/ladybug.png';
    el.alt = '';
    el.setAttribute('aria-hidden', 'true');
    field.appendChild(el);
    const b = { el, x, y, vy, caught: false };
    placeBug(b);
    bugs.push(b);
    return b;
  }

  function removeBug(b) {
    const i = bugs.indexOf(b);
    if (i !== -1) bugs.splice(i, 1);
    b.el.remove();
  }

  /* ── printer control (horizontal only) ────────────────────────────── */

  function moveTo(clientX) {
    const r = field.getBoundingClientRect();
    printerX = clampX(clientX - r.left - printerW / 2);
    placePrinter();
  }

  section.addEventListener('mousemove', e => moveTo(e.clientX));
  section.addEventListener('touchmove', e => {
    if (e.touches[0]) { moveTo(e.touches[0].clientX); e.preventDefault(); }
  }, { passive: false });
  section.addEventListener('touchstart', e => {
    if (e.touches[0]) moveTo(e.touches[0].clientX);
  }, { passive: true });

  section.addEventListener('keydown', e => {
    const step = W * 0.06;
    if (e.key === 'ArrowLeft')  { printerX = clampX(printerX - step); placePrinter(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { printerX = clampX(printerX + step); placePrinter(); e.preventDefault(); }
  });

  /* ── the loop ─────────────────────────────────────────────────────── */

  function spawn() {
    const x = Math.random() * (W - bugW);
    const vy = (0.26 + Math.random() * 0.14) * H;   // px per second (~2.5–3.8s fall)
    makeBug(x, -bugH, vy);
  }

  /* advance the world by dt seconds — the whole game rule set lives here */
  function step(dt) {
    if (dt > 0.05) dt = 0.05;             // clamp after a tab-switch stall
    elapsed += dt;

    /* spawn, gradually a touch faster */
    sinceSpawn += dt * 1000;
    spawnGap = Math.max(520, 950 - elapsed * 12);
    if (sinceSpawn >= spawnGap) { sinceSpawn = 0; spawn(); }

    /* the tray mouth + horizontal catch span of the printer */
    const catchY = H - printerH * 0.62;
    const margin = printerW * 0.14;
    const left   = printerX + margin;
    const right  = printerX + printerW - margin;

    for (const b of bugs.slice()) {
      if (b.caught) continue;
      b.y += b.vy * dt;

      const cx = b.x + bugW / 2;
      const feet = b.y + bugH;

      if (feet >= catchY && b.y < catchY + printerH && cx >= left && cx <= right) {
        b.caught = true;
        b.el.classList.add('ladybug--caught');
        setTimeout(() => removeBug(b), 200);
        score += 1;
        scoreEl.textContent = String(score);
        continue;
      }
      if (b.y > H) { removeBug(b); continue; }   // missed — off the bottom
      placeBug(b);
    }
  }

  function tick(now) {
    if (!running) return;
    if (!last) last = now;
    const dt = (now - last) / 1000;
    last = now;
    step(dt);
    requestAnimationFrame(tick);
  }

  /* ── start / pause ────────────────────────────────────────────────── */

  function beginFalling() {
    if (started) return;
    started = true;
    /* the resting design ladybugs now start to fall */
    for (const b of bugs) b.vy = (0.24 + Math.random() * 0.14) * H;
  }

  function start() {
    if (reduced || running) return;
    running = true;
    last = 0;
    beginFalling();
    requestAnimationFrame(tick);
  }

  function pause() { running = false; last = 0; }

  /* ── init ─────────────────────────────────────────────────────────── */

  function init() {
    measure();
    printerX = clampX((W - printerW) / 2);
    placePrinter();

    /* lay out the 7 resting ladybugs from the design */
    for (const [dx, dy] of START_BUGS) makeBug(dx * scale, dy * scale, 0);

    window.addEventListener('resize', measure);

    if (reduced) return;   // static scene, but the printer still follows input

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        for (const en of entries) en.isIntersecting ? start() : pause();
      }, { threshold: 0.35 });
      io.observe(section);
    } else {
      start();
    }
  }

  /* wait for the printer image so offsetWidth is real */
  if (printer.complete) init();
  else printer.addEventListener('load', init, { once: true });

  /* deterministic test hook (only with ?test) — drive step() by hand,
     since headless/offscreen surfaces can't be relied on to run rAF */
  if (location.search.indexOf('test') !== -1) {
    window.__game = {
      step, start, beginFalling, measure,
      setPrinterX: x => { printerX = clampX(x); placePrinter(); },
      addBug: (x, y, vy) => makeBug(x, y, vy),
      state: () => ({
        score, running, started, printerX, W, H, printerW, printerH, bugW, bugH,
        bugs: bugs.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), vy: Math.round(b.vy), caught: b.caught })),
      }),
    };
  }
})();
