/* ─────────────────────────────────────────────────────────────────────
   hero — pinned horizontal spectrum

   Scrolling into the green band hijacks vertical scroll into a sideways
   sweep: the band is pinned (position:fixed) and fills the screen while the
   cow→tomato row slides across; the page cannot advance until the whole
   spectrum has been swept (~1.2 screens), then normal scrolling resumes.

   Before that engagement, the strip auto-scrolls on its own — one steady
   direction, constant speed, looping — so the band reads as already-moving
   rather than a static image waiting to be scrolled.

   On phones / reduced-motion the band is a plain horizontal swipe instead.
   The left panel and the sections below are untouched.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const hero   = document.getElementById('hero');
  const track  = document.getElementById('hero-track');
  if (!hero || !track) return;

  const sticky = hero.querySelector('.hero__sticky');
  const img    = track.querySelector('img');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 860px)');
  const clamp  = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  let travel = 0, pinLeft = 0, pinW = 0, stripW = 0;

  /* idle auto-scroll — before the user has scrolled the hero into its pin
     range, run the whole cow→tomato strip past on its own, like film
     advancing through a projector: one steady direction, constant speed,
     looping with NO visible cut (no back-and-forth tease, no easing at the
     ends, no jump at the loop point). Handed off the instant real scroll
     engagement begins (onScroll below); resumes automatically if the user
     scrolls back above the hero. Owns track.style.transform only while
     running — onScroll always takes it back over once p > 0.

     The seamless loop trick: a second, identical copy of the strip image is
     appended right after the first (only while idling — removed the moment
     idling stops, so it never appears during a real scroll or on the mobile
     swipe fallback). Translating by one full strip-width lands exactly on
     the clone, which is pixel-identical to the original at that position —
     so wrapping back to 0 is invisible, unlike wrapping over `travel`
     (which stops one viewport short of the strip's own end and would jump). */
  const IDLE_PASS_MS = 16000;              /* reference pace: travel px / this many ms */
  let idleRaf = 0, idleT0 = 0, idleSpeed = 0, idleLoopMs = 0, clone = null;
  function ensureClone() {
    if (clone || !img) return;
    clone = img.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('id');
    track.appendChild(clone);
  }
  function removeClone() {
    if (!clone) return;
    clone.remove();
    clone = null;
  }
  function idleTick(now) {
    if (!idleT0) idleT0 = now;
    const t = (now - idleT0) % idleLoopMs;                 /* 0..idleLoopMs, loops */
    track.style.transform = 'translate3d(' + (-idleSpeed * t) + 'px,0,0)';
    idleRaf = requestAnimationFrame(idleTick);
  }
  function idleKick() {
    if (reduce.matches || mobile.matches || travel <= 0 || stripW <= 0) { idleStop(); return; }
    ensureClone();
    idleSpeed = travel / IDLE_PASS_MS;                     /* px/ms, same pace as before */
    idleLoopMs = stripW / idleSpeed;                       /* time to cross one full strip */
    if (!idleRaf) { idleT0 = 0; idleRaf = requestAnimationFrame(idleTick); }
  }
  function idleStop() {
    removeClone();
    if (!idleRaf) return;
    cancelAnimationFrame(idleRaf);
    idleRaf = 0;
  }

  /* clear everything → static band (mobile / reduced-motion) */
  function reset() {
    travel = 0;
    idleStop();
    track.style.transform = '';
    hero.style.height = '';
    ['position', 'top', 'bottom', 'left', 'width', 'height'].forEach(k => sticky.style[k] = '');
  }

  function onScroll() {
    if (travel <= 0) return;
    /* sideways mode: the reel pins the band and drives its own scroll; we only
       sweep the strip, scrubbed from the section's horizontal progress instead
       of vertical scroll. No self-pin (the reel owns positioning). */
    if (window.reelMode?.active()) {
      idleStop();
      const p = window.reelMode.progress(hero);
      if (p == null) return;
      track.style.transform = 'translate3d(' + (-p * travel) + 'px,0,0)';
      return;
    }
    const viewH = window.innerHeight;
    const rect  = hero.getBoundingClientRect();
    const pinRange = hero.offsetHeight - viewH;        /* = PIN distance */
    const s = sticky.style;
    let p;
    if (rect.top > 0) {                                /* before: park at top */
      s.position = 'absolute'; s.top = '0'; s.bottom = 'auto'; s.left = '0'; s.width = '100%';
      idleKick();                                      /* not engaged yet — keep auto-scrolling */
      return;
    }
    idleStop();                                         /* real scroll engaged — hand off */
    if (-rect.top < pinRange) {                        /* pinned: fixed, fills screen */
      s.position = 'fixed'; s.top = '0'; s.bottom = 'auto';
      s.left = pinLeft + 'px'; s.width = pinW + 'px';
      p = clamp(-rect.top / pinRange, 0, 1);
    } else {                                           /* after: park at bottom */
      s.position = 'absolute'; s.top = 'auto'; s.bottom = '0'; s.left = '0'; s.width = '100%';
      p = 1;
    }
    track.style.transform = 'translate3d(' + (-p * travel) + 'px,0,0)';
  }

  function measure() {
    if (reduce.matches || mobile.matches) { reset(); return; }
    const viewH = window.innerHeight;
    pinLeft = hero.getBoundingClientRect().left;       /* content-column left */
    pinW    = hero.clientWidth;                        /* content-column width */
    sticky.style.height = viewH + 'px';                /* band fills the screen when pinned */
    stripW  = img.getBoundingClientRect().width;       /* single strip's own width (excludes any idle clone) */
    travel  = Math.max(0, stripW - pinW);
    /* sideways mode: no vertical runway and no self-pin — the reel provides the
       scroll distance and the pin. Leave the band as a plain relative box that
       fills its slide; onScroll (reel branch) just sweeps the strip. */
    if (window.reelMode?.active()) {
      idleStop();
      hero.style.height = '';
      ['position', 'top', 'bottom', 'left', 'width'].forEach(k => sticky.style[k] = '');
      onScroll();
      return;
    }
    hero.style.height = (viewH + Math.round(viewH * 1.2)) + 'px';   /* ~1.2 screens of lock */
    onScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  reduce.addEventListener?.('change', measure);
  mobile.addEventListener?.('change', measure);
  if (img && !img.complete) img.addEventListener('load', measure, { once: true });

  measure();
})();
