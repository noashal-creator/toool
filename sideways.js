/* ─────────────────────────────────────────────────────────────────────
   sideways.js — continuous horizontal scroll that settles on sections

   A toggle button flips the content into a sideways experience that FEELS like
   the site's normal vertical scroll, just horizontal: you scroll and it glides
   with inertia, and when you stop it gently settles on the nearest section (it
   never force-locks one-slide-per-flick).

   JS owns all motion — nothing native-scrolls in this mode. One fixed camera
   (.reel__pin) shows a vertical stage (.reel__vstage) that stacks the logo
   panel (100dvh) above the reel row (100dvh). A single position scalar `pos`
   (px along a virtual track) drives two transforms:
     pos 0..VH            → translateY on .reel__vstage  (logo rises away — you
                            "scroll down" past the logo first)
     pos VH..VH+(N-1)·W   → translateX on .reel__row     (the horizontal slides)
   `target` is where input is pushing; `pos` eases toward it every frame
   (inertia). ~150ms after input goes idle, `target` snaps to the nearest
   section boundary and `pos` glides to rest there — the "settle".

   Each animating frame dispatches a synthetic window `scroll`. hero.js, toys.js
   (pop) and logo.js already branch on window.reelMode.active() and read
   window.reelMode.progress(section) — which is derived from the section's live
   on-screen getBoundingClientRect().left, so it tracks the transform — so those
   set-pieces scrub smoothly with NO changes to their files.

   Desktop only (≥861px); below that the sidebar goes static and the units flip,
   so sideways is disabled. Everything is gated on body.sideways; normal mode is
   byte-identical (the reel wrappers are display:contents there). */

(() => {
  const content    = document.querySelector('.content');
  const reelPin     = document.querySelector('.reel__pin');
  const reelVstage  = document.querySelector('.reel__vstage');
  const reelRow     = document.querySelector('.reel__row');
  const sidebar     = document.querySelector('.sidebar');
  if (!content || !reelPin || !reelVstage || !reelRow || !sidebar) return;

  const logoBanner = reelVstage.querySelector('.logo-banner');

  const STORE = 'toool-scroll-mode';
  const STORE_LEN = 'toool-logo-len';   // 'short' | 'long' — sideways logo band height
  const body  = document.body;
  const MIN_W = 861;

  const wideEnough = () => window.innerWidth >= MIN_W;
  const isOn  = () => body.classList.contains('sideways');
  const active = () => isOn() && wideEnough();

  // Discrete slides (stick 1-2-3) — EXCEPT the cow→tomato hero band, which keeps
  // a DWELL: a held region where you scroll and the spectrum SWEEPS across
  // inside the slide FIRST, then you move on (as agreed). The pop ring (ambient
  // carousel) and the intro video (plays on arrival) don't need a scrub region,
  // so they stay discrete. Length in screen-heights, keyed by element id.
  const DWELL_VH = { 'hero': 1.5 };

  // ── layout: a segment track (recomputed on enter + resize) ──
  // segs: ordered {start,end,txFrom,txTo} in pos-px — flat during the logo step
  // and dwells, ramped during transitions. snaps: centred rest points (each
  // slide, plus both dwell endpoints). dwell: id → {start,len} for progress().
  let N = 0, slideW = 0, VH = 0, logoH = 0, maxPos = 0, snaps = [0], segs = [], dwell = {};
  function measure() {
    N = reelRow.children.length;
    slideW = reelPin.clientWidth || (window.innerWidth - sidebar.getBoundingClientRect().width);
    VH = window.innerHeight;
    // the logo step is the banner's OWN (short) height — like normal scroll —
    // not a full screen: scroll down a moment, the banner rises away, then reel.
    logoH = (logoBanner && logoBanner.offsetHeight) || VH;
    const kids = reelRow.children;
    segs = [{ start: 0, end: logoH, txFrom: 0, txTo: 0 }]; // logo step (tx held at 0)
    snaps = [0];                                          // 0 = logo
    dwell = {};
    let p = logoH;                                        // slide 0 is centred here
    for (let i = 0; i < N; i++) {
      const tx = -i * slideW;
      snaps.push(p);                                      // slide i centred (dwell start if animated)
      const dv = DWELL_VH[kids[i].id];
      if (dv) {
        const len = dv * VH;
        dwell[kids[i].id] = { start: p, len: len };
        segs.push({ start: p, end: p + len, txFrom: tx, txTo: tx });   // dwell: held centred
        p += len;
        snaps.push(p);                                    // dwell end (still centred, anim = 1)
      }
      if (i < N - 1) {                                    // transition to the next slide
        segs.push({ start: p, end: p + slideW, txFrom: tx, txTo: -(i + 1) * slideW });
        p += slideW;
      }
    }
    maxPos = p;
  }
  const clampPos = v => Math.max(0, Math.min(maxPos, v));

  function txAt(v) {
    if (v <= 0) return 0;
    let s = segs[segs.length - 1];
    for (const seg of segs) { if (v >= seg.start && v <= seg.end) { s = seg; break; } }
    if (s.end === s.start) return s.txFrom;
    const k = Math.max(0, Math.min(1, (v - s.start) / (s.end - s.start)));
    return s.txFrom + (s.txTo - s.txFrom) * k;
  }
  function applyTransforms(p) {
    const vy = -Math.max(0, Math.min(logoH, p));                    // logo step (vertical, banner height)
    reelVstage.style.transform = 'translate3d(0,' + vy.toFixed(2) + 'px,0)';
    reelRow.style.transform    = 'translate3d(' + txAt(p).toFixed(2) + 'px,0,0)';
  }

  // ── motion: inertia toward target, gentle idle-settle ──
  let pos = 0, target = 0, raf = 0, settleTimer = 0;
  const LERP = 0.18, SETTLE_MS = 120;   // LERP: smooth glide between slides; SETTLE_MS: land on a slide promptly

  function nearestSnap(v) {
    let best = snaps[0], bd = Infinity;
    for (const s of snaps) { const d = Math.abs(s - v); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function neighborSnap(from, dir) {
    const idx = snaps.indexOf(nearestSnap(from));
    return snaps[Math.max(0, Math.min(snaps.length - 1, idx + dir))];
  }

  function frame() {
    const d = target - pos;
    if (Math.abs(d) < 0.5) { pos = target; applyTransforms(pos); ping(); raf = 0; return; }
    pos += d * LERP;
    applyTransforms(pos);
    ping();
    raf = requestAnimationFrame(frame);
  }
  function ping() { window.dispatchEvent(new Event('scroll')); }  // feeds the set-pieces
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // true while target sits strictly inside a dwell (endpoints are snaps)
  function inDwellInterior(v) {
    for (const id in dwell) {
      const d = dwell[id];
      if (v > d.start + 1 && v < d.start + d.len - 1) return true;
    }
    return false;
  }
  function armSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (inDwellInterior(target)) return;   // resting inside a dwell → don't yank; watch the animation
      target = nearestSnap(target);          // transition/logo → land cleanly on the nearest centred slide
      kick();
    }, SETTLE_MS);
  }
  function nudge(delta) { target = clampPos(target + delta); kick(); armSettle(); }
  function goToSnap(s)  { if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; } target = clampPos(s); kick(); }

  // ── input ──
  function typingElsewhere() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName)) return true;
    if (a && (a.isContentEditable || (a !== body && a.closest('[tabindex]')))) return true;
    if (document.querySelector('.mixwin.is-open')) return true;   // let the result modal own input
    return false;
  }

  function onWheel(e) {
    if (!active()) return;
    e.preventDefault();                                            // no native scroll in this mode
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 16;                               // lines → px
    else if (e.deltaMode === 2) d *= VH;                          // pages → px
    if (d) nudge(d);
  }

  function onKey(e) {
    if (!active() || typingElsewhere()) return;
    let handled = true;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': goToSnap(neighborSnap(target, +1)); break;
      case 'ArrowLeft':  case 'ArrowUp':   case 'PageUp':   goToSnap(neighborSnap(target, -1)); break;
      case ' ': goToSnap(neighborSnap(target, e.shiftKey ? -1 : +1)); break;
      case 'Home': goToSnap(0); break;
      case 'End':  goToSnap(maxPos); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  // drag = finger-locked (1:1), then settle on release
  let dragging = false, dragX0 = 0, dragT0 = 0, dragMoved = false;
  const INTERACTIVE = 'a,button,input,textarea,select,label,iframe,[role],[draggable="true"]';
  function onDown(e) {
    if (!active() || e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    dragging = true; dragMoved = false; dragX0 = e.clientX; dragT0 = target;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragX0;
    if (Math.abs(dx) > 3) dragMoved = true;
    target = clampPos(dragT0 - dx);
    pos = target; applyTransforms(pos); ping();                   // 1:1 while held
    if (dragMoved) e.preventDefault();
  }
  function onUp() { if (!dragging) return; dragging = false; if (dragMoved) armSettle(); }

  // ── progress fed to the set-pieces (hero.js / toys.js). For a slide with a
  //    dwell, it's the dwell fraction (0→1) computed from the eased pos, so the
  //    animation scrubs IN PLACE while the slide is pinned centred — and clamps
  //    to 1 once past the dwell (frozen fully-played, no rewind on exit). For
  //    any other section it's the on-screen position (0 off-right, .5 centred,
  //    1 off-left), unused today but kept for correctness. ──
  function progress(section) {
    if (!active()) return null;
    const d = section.id && dwell[section.id];
    if (d) return Math.max(0, Math.min(1, (pos - d.start) / d.len));
    const r = section.getBoundingClientRect();
    if (!r.width) return null;
    const pinLeft = reelPin.getBoundingClientRect().left;
    return Math.max(0, Math.min(1, (pinLeft - r.left) / r.width + 0.5));
  }
  window.reelMode = { active, progress };

  // ── enter / leave ──
  // Re-entrancy guard: nudgeOthers() dispatches a synthetic `resize`, and the
  // window `resize` listener below calls refit(), which calls nudgeOthers()
  // again — without this flag that loop dispatches resize forever and blows the
  // stack (RangeError: Maximum call stack size exceeded). The flag lets exactly
  // one level through: the synthetic resize still reaches hero.js/toys.js/
  // logo.js, but the refit it triggers can't re-enter.
  let nudging = false;
  function nudgeOthers() {                                        // let hero/toys re-measure per mode
    if (nudging) return;
    nudging = true;
    try {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
    } finally {
      nudging = false;
    }
  }
  function addListeners() {
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    reelPin.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  function removeListeners() {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    reelPin.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  function enter() {
    measure();
    pos = target = 0;                                             // start on the logo
    applyTransforms(0);
    // the intro video is owned by intro-loop.js now: it starts from the top when
    // its slide is actually reached (IntersectionObserver) and parks paused when
    // it leaves, so it no longer jumps mid-playback the moment you slide onto it.
    addListeners();
    nudgeOthers();
  }
  function leave() {
    removeListeners();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
    dragging = false;
    reelVstage.style.transform = '';
    reelRow.style.transform = '';
    nudgeOthers();
  }

  // ── control pills (match the colour tool) ──
  const PILL =
    'position:fixed;right:14px;z-index:2147483646;padding:11px 16px;border-radius:24px;' +
    'border:2px solid #fff;background:#111;color:#fff;font:600 15px/1 -apple-system,Helvetica,Arial,sans-serif;' +
    'cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.5)';
  const btn = document.createElement('button');      // mode: sideways ⇄ vertical
  btn.type = 'button'; btn.style.cssText = PILL + ';top:62px';
  document.body.appendChild(btn);
  const logoBtn = document.createElement('button');  // logo band: short ⇄ long (sideways only)
  logoBtn.type = 'button'; logoBtn.style.cssText = PILL + ';top:110px';
  document.body.appendChild(logoBtn);

  let wantsOn = false, longLogo = false, running = false;
  try { wantsOn  = (localStorage.getItem(STORE)     || '0')     === '1';    } catch (e) {}
  try { longLogo = (localStorage.getItem(STORE_LEN) || 'short') === 'long'; } catch (e) {}

  function syncBtn() {
    btn.textContent = wantsOn ? '↕ גלילה רגילה' : '↔ גלילה צידה';
    btn.title = wantsOn ? 'חזרה לגלילה רגילה' : 'גלילה צידה';
    btn.style.display = wideEnough() ? '' : 'none';
    logoBtn.textContent = longLogo ? 'לוגו קצר' : 'לוגו ארוך';
    logoBtn.title = longLogo ? 'לוגו קצר' : 'לוגו ארוך';
    logoBtn.style.display = active() ? '' : 'none';   // only while sideways is on
  }

  // re-fit the reel (logo-step height changed) + nudge logo.js to re-fit the wordmark
  function refit() {
    if (!running) return;
    measure();
    target = clampPos(nearestSnap(pos)); pos = target;
    applyTransforms(pos);
    nudgeOthers();
  }

  function apply() {
    const desired = wantsOn && wideEnough();
    body.classList.toggle('sideways', desired);
    body.classList.toggle('logo-long', longLogo);
    if (desired && !running) { running = true; enter(); }
    else if (!desired && running) { running = false; leave(); }
    syncBtn();
  }
  function setMode(on) {
    wantsOn = on;
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch (e) { /* non-fatal */ }
    apply();
  }
  function setLogoLen(long) {
    longLogo = long;
    try { localStorage.setItem(STORE_LEN, long ? 'long' : 'short'); } catch (e) { /* non-fatal */ }
    body.classList.toggle('logo-long', longLogo);
    refit();          // banner height changed → reel logo-step + wordmark re-fit
    syncBtn();
  }
  btn.addEventListener('click', () => setMode(!wantsOn));
  logoBtn.addEventListener('click', () => setLogoLen(!longLogo));

  window.addEventListener('resize', () => {
    apply();          // engage/disengage across the breakpoint
    refit();
  });

  apply();            // restore saved mode + logo length on load
})();
