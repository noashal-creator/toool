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

  // Recording mode's letterbox frame is always 16:9 regardless of its actual
  // pixel size, so falling back to the narrow/mobile layout there — which can
  // happen on a smaller real screen even with the frame correctly proportioned
  // — is never right: it silently disables the reel and lets normal vertical
  // page scroll take over instead of the intended sideways one.
  const wideEnough = () => window.innerWidth >= MIN_W || body.classList.contains('recording');
  const isOn  = () => body.classList.contains('sideways');
  const active = () => isOn() && wideEnough();

  /* Sections whose animation is DRIVEN BY SCROLL get a dwell: a held region
     where the slide stays centred and scrolling scrubs the animation from 0 to
     1 before the reel moves on. Everything else is a plain stop.
       · hero — the cow→tomato spectrum sweeps across;
       · toy-pop-converge — the lollipops gather and scatter again.
     Without a dwell the animation only has the slide's own entry/exit to play
     against, so standing on the slide and scrolling did nothing at all. */
  /* 2.0 for the roll bands, not the 1.5 the other two use: those play one
     continuous arc, while each roll band HOLDS on five discrete poses across its
     dwell (STEPS in roll.js). 1.5 screens split five ways is ~280px a pose,
     too tight for a hold to register. */
  const DWELL_VH = {
    'hero': 1.5, 'toy-pop-converge': 1.5,
  };
  /* how much of a dwell one pixel of wheel covers — geared down so a single
     flick advances part of the animation instead of crossing all of it. Was
     0.2, which meant sweeping the ~1.5-screen cow→tomato dwell needed ~6 screens
     of scrolling and getting past it took the same — it read as STUCK. 0.7
     sweeps it in ~1.5 screens (close to normal vertical mode) while a flick
     still only advances ~a quarter, so it moves under your finger, not stuck. */
  const DWELL_GEAR = 0.7;

  // ── layout: a segment track (recomputed on enter + resize) ──
  // segs: ordered {start,end,txFrom,txTo} in pos-px — flat during the logo step
  // and dwells, ramped during transitions. snaps: centred rest points (each
  // slide, plus both dwell endpoints). dwell: id → {start,len} for progress().
  let N = 0, slideW = 0, VH = 0, logoH = 0, maxPos = 0, snaps = [0], segs = [], dwell = {}, sceneSnap = [], sceneEntranceSnap = [];
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
    sceneSnap = [];                                       // section i → snap-index of its fully-played scene
    sceneEntranceSnap = [];                                // section i → snap-index of its FIRST-arrived (unplayed) scene
    let p = logoH;                                        // slide 0 is centred here
    for (let i = 0; i < N; i++) {
      const tx = -i * slideW;
      snaps.push(p);                                      // slide i centred (dwell start if animated)
      sceneEntranceSnap[i] = snaps.length - 1;             // the just-arrived, not-yet-scrubbed snap
      const dv = DWELL_VH[kids[i].id];
      if (dv) {
        const len = dv * VH;
        dwell[kids[i].id] = { start: p, len: len };
        segs.push({ start: p, end: p + len, txFrom: tx, txTo: tx });   // dwell: held centred
        p += len;
        snaps.push(p);                                    // the far end of the sweep
      }
      sceneSnap[i] = snaps.length - 1;                    // scene = dwell-end if it dwells, else centred
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
  const LERP = 0.18;                    // smooth glide between stops

  function nearestSnap(v) {
    let best = snaps[0], bd = Infinity;
    for (const s of snaps) { const d = Math.abs(s - v); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function neighborSnap(from, dir) {
    const idx = snaps.indexOf(nearestSnap(from));
    return snaps[Math.max(0, Math.min(snaps.length - 1, idx + dir))];
  }

  /* A step between slides is TIMED and eased at both ends, not chased with the
     lerp. A lerp covers 18% of the gap in its first frame, so leaving the
     tomato threw a quarter of a slide across the screen in one frame and then
     crawled — front-loaded, which reads as a hard cut into the next frame.
     Smootherstep leaves and arrives at zero speed, so the slide is handed over
     rather than snapped. The lerp still handles the scrub, where following the
     finger closely is the whole point. */
  const STEP_MS = 620;
  let tween = null;
  const smootherstep = k => k * k * k * (k * (k * 6 - 15) + 10);

  function frame(now) {
    now = now || performance.now();
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / STEP_MS);
      pos = tween.from + (tween.to - tween.from) * smootherstep(k);
      applyTransforms(pos); ping();
      if (k >= 1) { tween = null; pos = target; applyTransforms(pos); ping(); raf = 0; return; }
      raf = requestAnimationFrame(frame);
      return;
    }
    const d = target - pos;
    if (Math.abs(d) < 0.5) { pos = target; applyTransforms(pos); ping(); raf = 0; return; }
    pos += d * LERP;
    applyTransforms(pos);
    ping();
    raf = requestAnimationFrame(frame);
  }
  function ping() { window.dispatchEvent(new Event('scroll')); }  // feeds the set-pieces
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /* Every move now lands on a stop by construction (one stop per gesture), so
     the old "settle to the nearest snap shortly after free scrolling stops"
     pass — and the dwell-interior exception it needed — are gone with it. */
  function step(dir) { goToSnap(neighborSnap(target, dir)); }
  function goToSnap(s) {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
    target = clampPos(s);
    tween = { from: pos, to: target, t0: performance.now() };   // eased, both ends
    kick();
  }

  // ── input ──
  function typingElsewhere() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName)) return true;
    if (a && (a.isContentEditable || (a !== body && a.closest('[tabindex]')))) return true;
    if (document.querySelector('.mixwin.is-open')) return true;   // let the result modal own input
    return false;
  }

  /* Two behaviours, and which one you get depends on where you are:

     · ON A DWELL — scrolling SCRUBS the animation. Continuous, geared down, no
       stepping: the whole point is that the spectrum / the lollipops move under
       your finger. (Stepping through it in thirds, which is what this did
       first, read as random: the thing jumped, then sat still.)
     · ANYWHERE ELSE — one stop per gesture. Adding every wheel delta to the
       position meant a single trackpad flick — a long stream of events, inertia
       included — could cross several slides at once. Now the first meaningful
       delta of a gesture moves exactly one stop and the rest of that gesture is
       ignored, a gesture ending after GESTURE_GAP of quiet. That lock is also
       what stops the inertia tail from carrying you straight out of a dwell the
       moment its animation finishes. */
  const GESTURE_GAP = 170;   // ms of no wheel events that ends a gesture
  const STEP_MIN = 12;       // px of delta before a gesture counts as a move
  let wheelLock = false, wheelLast = 0, wheelAcc = 0;
  function dwellAt(v) {
    for (const id in dwell) {
      const d = dwell[id];
      if (v >= d.start - 1 && v <= d.start + d.len + 1) return d;
    }
    return null;
  }
  function onWheel(e) {
    if (!active()) return;
    e.preventDefault();                                            // no native scroll in this mode
    const now = performance.now();
    if (now - wheelLast > GESTURE_GAP) { wheelLock = false; wheelAcc = 0; }   // a new gesture
    wheelLast = now;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 16;                               // lines → px
    else if (e.deltaMode === 2) d *= VH;                          // pages → px

    const dw = dwellAt(target);
    if (dw) {
      /* The lock is checked BEFORE scrubbing, not cleared by it: a gesture that
         has already carried you out of one region must not then pour its
         inertia tail into the next one — which is exactly what let a single
         flick run through the lollipops, across a slide, and halfway into the
         spectrum. */
      if (wheelLock) return;
      const next = target + d * DWELL_GEAR;
      if (next > dw.start && next < dw.start + dw.len) {           // scrub in place
        tween = null;                     // the scrub follows the finger, not a tween
        target = clampPos(next); kick();
        return;
      }
      wheelLock = true; wheelAcc = 0;                              // ran off an end
      goToSnap(next <= dw.start ? neighborSnap(dw.start, -1)
                                : neighborSnap(dw.start + dw.len, +1));
      return;
    }

    if (wheelLock) return;                                         // already stepped for this one
    wheelAcc += d;
    if (Math.abs(wheelAcc) < STEP_MIN) return;                    // ignore jitter
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelLock = true; wheelAcc = 0;
    step(dir);
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
    tween = null;                                                // the hand takes over
    dragging = true; dragMoved = false; dragX0 = e.clientX; dragT0 = target;
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0; }
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragX0;
    if (Math.abs(dx) > 3) dragMoved = true;
    /* held 1:1, but fenced in by the two neighbouring stops — a long drag can
       no longer carry you across several slides in one go */
    const lo = neighborSnap(dragT0, -1), hi = neighborSnap(dragT0, +1);
    target = Math.max(Math.min(clampPos(dragT0 - dx), hi), lo);
    pos = target; applyTransforms(pos); ping();
    if (dragMoved) e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (!dragMoved) return;
    const moved = target - dragT0;                                // one stop, or back
    goToSnap(Math.abs(moved) > 40 ? neighborSnap(dragT0, moved > 0 ? 1 : -1) : nearestSnap(dragT0));
  }

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
  /* recording.js drives a scripted tour through the reel. enable() turns the
     mode on WITHOUT persisting (the demo shouldn't rewrite the user's saved
     preference); go(i)/count() step through the same snaps the input handlers
     use, so the set-piece dwells scrub exactly as they do by hand. */
  // a slow, custom-duration eased glide to an ABSOLUTE pos (the built-in
  // goToSnap is fixed at STEP_MS≈620ms — too quick for a "show reel" pan).
  // Drives pos itself and pings every frame so the set-pieces scrub. Promise.
  function recGlideToPos(posTarget, ms) {
    const to = clampPos(posTarget);
    const from = pos;
    const dur = Math.max(1, ms || STEP_MS);
    tween = null;                                   // take over from any built-in tween
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    return new Promise(resolve => {
      const t0 = performance.now();
      const stepG = now => {
        const k = Math.min(1, (now - t0) / dur);
        pos = from + (to - from) * smootherstep(k);
        applyTransforms(pos); ping();
        if (k < 1) requestAnimationFrame(stepG);
        else { pos = target = to; applyTransforms(pos); ping(); resolve(); }
      };
      requestAnimationFrame(stepG);
    });
  }
  function recGlide(index, ms) {
    return recGlideToPos(snaps[Math.max(0, Math.min(snaps.length - 1, index | 0))], ms);
  }

  window.reelMode = {
    active, progress,
    enable() { wantsOn = true; apply(); },
    disable() { wantsOn = false; apply(); },
    count() { return snaps.length; },
    go(i) {
      const n = snaps.length;
      const idx = Math.max(0, Math.min(n - 1, i | 0));
      goToSnap(snaps[idx]);
    },
    glide(i, ms) { return recGlide(i, ms); },
    // tour by GAME: sceneCount() = number of reel sections; glideScene(i,ms)
    // glides to section i's fully-played state (dwell-end if it dwells), so each
    // game gets one fair, equal time-slice instead of dwelled games hogging snaps.
    sceneCount() { return sceneSnap.length; },
    glideScene(i, ms) {
      const idx = Math.max(0, Math.min(sceneSnap.length - 1, i | 0));
      return recGlide(sceneSnap[idx], ms);
    },
    // raw positions for a section's own first-arrived ("entrance") snap and its
    // fully-played ("end") snap — equal when the section has no dwell (there's
    // only ever its one centred snap). A recorded scrub uses these to visibly
    // PLAY a dwell (entrance → end, slowly) instead of glideScene's one jump
    // straight to the end, and to know how far past a non-dwelled section's own
    // centre counts as "finished" (its animation is driven by on-screen
    // position, not a dwell — see roll.js/toys.js reading reelMode.progress()).
    sceneEntrance(i) {
      const idx = Math.max(0, Math.min(sceneEntranceSnap.length - 1, i | 0));
      return snaps[sceneEntranceSnap[idx]];
    },
    sceneEnd(i) {
      const idx = Math.max(0, Math.min(sceneSnap.length - 1, i | 0));
      return snaps[sceneSnap[idx]];
    },
    slideWidth() { return slideW; },
    glideTo(posTarget, ms) { return recGlideToPos(posTarget, ms); },
    goEnd() { goToSnap(maxPos); },
  };

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
  btn.type = 'button'; btn.className = 'rec-hide'; btn.style.cssText = PILL + ';top:62px';
  // sideways scroll is forced always-on, so its toggle button is hidden on the published site
  // document.body.appendChild(btn);
  const logoBtn = document.createElement('button');  // logo band: short ⇄ long (sideways only)
  logoBtn.type = 'button'; logoBtn.className = 'rec-hide'; logoBtn.style.cssText = PILL + ';top:110px';
  // logo-length toggle hidden on the published site (authoring-only)
  // document.body.appendChild(logoBtn);

  let wantsOn = true, longLogo = false, running = false;   // sideways scroll is always on (button removed)
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
