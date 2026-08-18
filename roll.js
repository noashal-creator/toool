/* ══ ROLL ══════════════════════════════════════════════════════════════════
   Tooth → troll, three ways. Each band is pinned like the cow: the <section>
   is a tall runway, the stage inside holds still and full-screen, and one
   value — p, 0..1 across the pin — drives travel, rotation, scale and which
   of the five cut-outs is showing. Everything comes off that single value, so
   scrubbing back rewinds all of it and nothing accumulates between frames.

   The WORLD travels, not just the figure. Each band lays a strip several
   screens wide inside the stage and slides it sideways under a fixed camera,
   which is what turns vertical scroll into a sideways journey.

   Three to choose between, meant to be cut down to one:
     somersault — tumbles across, a whole turn per hop, landing upright
     trail      — sheds each earlier self, so the finish holds all five
     stomp      — heavy; every landing jolts the world, and is where it changes
   ─────────────────────────────────────────────────────────────────────────── */
(function roll() {
  const sections = [...document.querySelectorAll('[data-roll]')];
  if (!sections.length) return;

  const REEL = [1, 2, 3, 4, 5].map(n => `assets/troll-cut/w${n}.png`);
  for (const src of REEL) { const pre = new Image(); pre.src = src; }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PIN_SCREENS = 2.0;      // scroll spend per band
  const GROUND = 74;            // default horizon, % of stage height

  /* Two different "not the normal pin" cases, and they are NOT the same thing.
     staticNow is the one that really means hold a single frame. Sideways/reel
     mode does NOT: there the reel owns the pinning and the scroll distance, and
     every other band on the page keeps animating by reading its progress —
     hero.js and toys.js · POP both do exactly that. Lumping reel in with
     "off" is what left these three as still images while the cow and the
     lollipops carried on moving around them. */
  const staticNow = () => REDUCED || innerWidth <= 860;
  const reelOn    = () => !!window.reelMode?.active();

  /* Live size tuner. The scale multiplies each move's SIZE at the TOP of the
     move, before anything is derived from it — so the horizon, the soles, the
     hop apex and the centring all follow the new size instead of drifting off
     it. Scaling the painted height afterwards would have left every one of
     those computed for the old size. */
  const SCALE_MIN = 0.6, SCALE_MAX = 1.25, SCALE_STEP = 0.01;

  /* ── stop motion, not a glide ──────────────────────────────────────────
     Five figures IS the transition, so the band has to LAND on each of the
     five and stand there before going on. Feeding the raw scroll progress
     straight into the moves made everything drift continuously and never
     arrive — no pose ever read as a pose.

     Each fifth of the pin is therefore split: it travels for the first part
     and then holds dead still for the rest, however far you keep scrolling.
     The travel is smootherstep, so it eases out of one hold and settles into
     the next instead of starting and stopping abruptly. */
  const STEPS = 5;
  const HOLD  = 0.42;          // share of each step spent standing still
  const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

  function stepped(p) {
    const s = Math.min(Math.floor(p * STEPS), STEPS - 1);
    const within = p * STEPS - s;
    const moved = smoother(clamp(within / (1 - HOLD), 0, 1));
    return (s + moved) / STEPS;
  }

  /* Measured opaque bounds of the five PNGs on their shared 640px canvas.
     The set is registered on the SOLES (all at y 638) with a matched body
     width (296 across all five), so the canvas is mostly empty above the short
     stages — the tooth carries 246px of nothing over its head. Two things
     break if you place by the box instead of by these: the box gets centred
     rather than the figure (the tooth hung 117px low), and rotation pivots
     around a point floating above the figure (a 95px orbit, read as a swing
     rather than a tumble). Everything below positions and spins by these. */
  const CONTENT_H   = [393, 474, 464, 512, 638];   // visible height, canvas px
  const CONTENT_TOP = [246, 165, 175, 127,   1];   // empty canvas above it
  /* the visible middle as a share of the box — used as BOTH anchor and pivot */
  const MID = CONTENT_TOP.map((t, k) => (t + t + CONTENT_H[k] - 1) / 2 / 640);
  const VIS = CONTENT_H.map(h => h / 640);         // visible height, same units

  const COLOURS = ['#E4002B', '#F0D800', '#560476', '#00961C', '#0b0b0b', '#f2f2ef'];

  /* Each move returns the strip width and offset plus a list of figures.
     figure: { i: cut-out, x/sx: % across, y: % down, h: height as % of stage,
               rot: degrees, anchor: translate pair, pivot: transform-origin y,
               sy: vertical squash, onStrip: positioned in world coordinates } */
  const MOVES = {

    /* A whole turn per hop, so it lands upright every time. HOP_H stays small
       on purpose: a figure this size sweeps its half-diagonal as it tumbles,
       and a taller hop puts the head through the top of the frame. */
    somersault(p, sc) {
      const HOPS = 5, SIZE = 58 * sc, HOP_H = 10, DRIFT = 16;
      const phase = (p * HOPS) % 1;
      const air = Math.sin(phase * Math.PI);
      const i = clamp(Math.floor(p * 5), 0, 4);
      const cH = SIZE * VIS[i];
      return { stripW: 320, offset: -(320 - 100) * p, figs: [{
        i,
        x: 50 - DRIFT / 2 + DRIFT * p,
        y: GROUND - cH / 2 - air * HOP_H,        // soles meet the ground on landing
        h: SIZE, rot: (Math.floor(p * HOPS) + phase) * 360,
        anchor: `-50%,-${(MID[i] * 100).toFixed(3)}%`, pivot: MID[i]
      }]};
    },

    /* Walks the world past and leaves each earlier self standing where it
       changed, so the last frame holds the whole lineage at once. */
    trail(p, sc) {
      const stripW = 150, SIZE = 44 * sc;
      /* The pan is deliberately SHORT. Wide, the camera outran its own trail:
         every copy was shed behind you and the finish showed a single figure
         with the other four off the left edge — which is the whole point of
         this one. At 50 the last frame holds all five. */
      const TRAVEL = stripW - 100;
      /* the shared horizon. Dropping it to centre the group only traded 341/215
         of air for 298/108 — the extremes are set by different frames, so it
         does not move linearly — and this is the composition already signed off. */
      const GND = GROUND;
      /* Positioned in STRIP coordinates, the only way a shed copy stays put in
         the world while the camera moves on. The camera sees strip-x
         [TRAVEL*p, TRAVEL*p + 100], so frame centre is always TRAVEL*p + 70 —
         where the live figure walks, and where each copy is left standing. */
      const centre = q => TRAVEL * q + 70;
      const figs = [];
      for (let k = 1; k <= 4; k++) {
        const born = k / 5;
        if (p <= born) continue;                 // not shed yet
        figs.push({ i: k - 1, y: GND, h: SIZE, rot: (k - 2) * 3,
                    anchor: '-50%,-100%', onStrip: true, sx: centre(born) });
      }
      const step = clamp(Math.floor(p * 5), 0, 4);
      const within = (p * 5) % 1;
      figs.push({ i: step, y: GND - Math.abs(Math.sin(within * Math.PI)) * 7,
                  h: SIZE, rot: Math.sin(p * 22) * 7, anchor: '-50%,-100%',
                  onStrip: true, sx: centre(p) });
      return { stripW, offset: -TRAVEL * p, ground: GND, figs };
    },

    /* Heavy. The landing jolts the whole WORLD — the shake goes on the strip,
       not the figure, so it reads as impact rather than wobble — and each
       landing is also where it changes. */
    stomp(p, sc) {
      const STEPS = 5, SIZE = 79 * sc, LIFT = 7;
      const phase = (p * STEPS) % 1;
      const idx = clamp(Math.floor(p * STEPS), 0, 4);
      const air = Math.sin(phase * Math.PI);
      const since = phase < 0.12 ? phase / 0.12 : 1;               // decaying jolt
      const jolt = (1 - since) * Math.sin(since * Math.PI * 5) * 2.4;
      const squash = phase < 0.1 ? 1 - (1 - phase / 0.1) * 0.18 : 1;

      /* This one is BIG, and a figure standing on the horizon can never be
         taller than the horizon is low — so the ground is not fixed here. Each
         stage is placed by its own visible middle and the horizon steps down to
         meet its soles. The step lands on the same frame as the image swap and
         the impact jolt, which is exactly where it cannot be seen. Scaling the
         stages to a common height instead is not an option: the content width
         is a matched 296 across all five, so it would swell the tooth to 481. */
      const cH   = SIZE * VIS[idx];
      const feet = 50 + cH / 2;                  // soles, once the content is centred

      return { stripW: 260, offset: -(260 - 100) * p + jolt, joltY: jolt * 0.6,
        ground: feet, figs: [{
          i: idx,
          x: 24 + p * 52,
          y: feet + SIZE * 2 / 640 - air * LIFT,  // box bottom is 2 canvas px under the soles
          h: SIZE, rot: Math.sin(phase * Math.PI * 2) * 5, anchor: '-50%,-100%',
          sy: squash
        }]};
    },
  };

  function setup(sec) {
    const name    = sec.dataset.roll;
    const stage   = sec.querySelector('.roll-stage');
    const strip   = sec.querySelector('.roll-strip');
    const actors  = sec.querySelector('.roll-actors');
    if (!MOVES[name] || !stage || !strip || !actors) return null;

    const pool = [];
    let pinLeft = 0, pinW = 0, stageH = 0, pinRange = 0;
    let scale = 1;                       // live, driven by the size tuner
    let sizeSlider = null;
    let branch = 'none', lastP = null;   // pin state, surfaced via .state

    function paint(p) {
      // every band steps and holds; nothing here glides straight through
      const out = MOVES[name](stepped(p), scale);
      strip.style.width = out.stripW + '%';
      // the horizon is per-move, and in stomp it steps with the figure
      stage.style.setProperty('--roll-ground', (out.ground ?? GROUND) + '%');
      strip.style.transform =
        `translate3d(${out.offset}cqw, ${out.joltY || 0}cqh, 0)`;

      while (pool.length < out.figs.length) {
        const img = document.createElement('img');
        img.className = 'roll-fig'; img.alt = '';
        actors.appendChild(img); pool.push(img);
      }
      pool.forEach((img, k) => {
        const f = out.figs[k];
        if (!f) { img.style.display = 'none'; return; }
        img.style.display = '';
        if (img._i !== f.i) { img.src = REEL[f.i]; img._i = f.i; }
        img.style.height = f.h + '%';
        /* world figures keep their strip coordinate so they stay put as the
           camera moves; the rest are un-panned so they hold their place on screen */
        const x = f.onStrip ? f.sx : (f.x - out.offset);

        /* Pivot and anchor must name the SAME point. With transform-origin O
           the matrix is T(O)·M·T(-O), so O maps to O + M(0) — and M(0) is just
           the translate pair. Give the anchor the origin's own fraction and the
           two cancel, leaving the figure's visible middle exactly on (x,y) at
           every angle. 0.5 is the plain box centre. */
        const pivot = f.pivot ?? 0.5;
        img.style.transformOrigin = `50% ${(pivot * 100).toFixed(3)}%`;
        /* Keep a squash planted. scaleY about a pivot at fraction c lifts the
           soles by (1-c)(1-s) of the height — half of it at the centre, which
           measured as a 40px hover at every landing. Put exactly that back. It
           sits LEFT of the scale, so it applies after it, in unscaled per cent. */
        const squash = f.sy
          ? ` translateY(${((1 - pivot) * (1 - f.sy) * 100).toFixed(3)}%) scaleY(${f.sy})`
          : '';
        img.style.transform =
          `translate(${x}cqw, ${f.y}cqh) translate(${f.anchor}) `
          + `rotate(${f.rot}deg)` + squash;
      });
    }

    /* Pinning copies toys.js · POP exactly, including the centring gap: the
       stage is the same 1080 band as every other section, so when the window is
       taller it is held in the middle of the screen rather than at the top.

       position:fixed and not position:sticky, and not by preference — body
       carries overflow-x:hidden, which makes body a scroll container and stops
       sticky ever sticking. hero.js pins the cow the same way for the same
       reason. */
    function measure() {
      if (reelOn()) {                  // the reel owns pinning and scroll distance
        sec.style.height = '';         // no runway of our own
        stage.style.cssText = '';      // drop any fixed-pin inline; CSS lays it in-slide
        pinRange = 0;
        place();                       // paint at the reel's current progress
        return;
      }
      if (staticNow()) {               // no runway, no pin: a plain single frame
        sec.style.height = '';
        stage.style.cssText = '';
        paint(0);
        pinRange = 0;
        return;
      }
      const r = sec.getBoundingClientRect();
      pinLeft = r.left;
      pinW    = sec.clientWidth;
      /* Read the stage directly. It is absolutely positioned and carries its own
         CSS height, so it does NOT depend on the section's height — which means
         the old trick of blanking sec.style.height first to "read the CSS band
         height" was never needed here, and it was actively harmful: it shortened
         the document by ~1600px per band, and when you are scrolled below that
         the browser clamps the scroll position and does NOT put it back once the
         height returns. Every re-measure nudged the page downward on its own. */
      stageH   = stage.offsetHeight;
      pinRange = Math.round(innerHeight * PIN_SCREENS);
      /* Write only on a real change. measure() resizes the section, so anything
         watching for size changes would call straight back into here. */
      const want = (stageH + pinRange) + 'px';
      if (sec.style.height !== want) sec.style.height = want;
      place();
    }

    function place() {
      /* Self-heal. pinRange is 0 whenever the last measure() bailed out — which
         includes measuring before the page had its final layout, when the
         viewport can still read 0 wide and the band looks "narrow". Left alone
         it would sit there as a still image forever, waiting for a resize that
         never comes. If the band is eligible NOW, measure before placing.
         No recursion risk: measure() sets pinRange before it calls back here,
         and its bail-out path returns without calling place() at all. */
      if (reelOn()) {                               // driven by the slide's scrub
        const p = window.reelMode.progress(sec);
        if (p == null) return;
        branch = 'reel'; lastP = clamp(p, 0, 1); paint(lastP);
        return;
      }
      if (!pinRange) { if (!staticNow()) measure(); return; }
      const top = sec.getBoundingClientRect().top;
      const gap = (innerHeight - stageH) / 2;
      const s = stage.style;
      if (top > gap) {                              // before — parked at the top
        s.position = 'absolute'; s.top = '0'; s.bottom = 'auto';
        s.left = '0'; s.width = '100%';
        branch = 'before'; lastP = 0; paint(0);
      } else if (gap - top < pinRange) {            // pinned
        s.position = 'fixed'; s.top = gap + 'px'; s.bottom = 'auto';
        s.left = pinLeft + 'px'; s.width = pinW + 'px';
        branch = 'pinned'; lastP = clamp((gap - top) / pinRange, 0, 1); paint(lastP);
      } else {                                      // after — parked at the bottom
        s.position = 'absolute'; s.top = 'auto'; s.bottom = '0';
        s.left = '0'; s.width = '100%';
        branch = 'after'; lastP = 1; paint(1);
      }
    }

    /* How far the size tuner can go before the composition stops fitting.
       It differs a lot per band — measured 1.05 for the somersault against 1.48
       for the trail — because two of them are already tuned to fill the frame
       and one is a small lineup. A single shared maximum would either crop the
       big ones or hold the small one back, so each slider gets its own.

       Every vertical term in these moves is either proportional to SIZE or a
       constant share of the stage, so the worst content edge is LINEAR in the
       scale: two probes fit the line exactly and it solves in closed form. The
       result is then verified and walked down if the fit was off, because a
       silently cropped head is the one outcome worth spending a check on. */
    function worstMargin(sc) {           // smallest gap to any edge, in px
      const S = stage.getBoundingClientRect(), W = S.width, H = S.height;
      if (!W || !H) return null;
      const keep = scale; scale = sc;
      for (let k = 0; k <= 24; k++) paint(k / 24);           // warm the pool
      let worst = Infinity;
      for (let k = 0; k <= 24; k++) {
        paint(k / 24);
        for (const im of actors.querySelectorAll('.roll-fig')) {
          if (im.style.display === 'none' || !im.naturalWidth) continue;
          const i = im._i, r = im.getBoundingClientRect();
          const cT = r.top - S.top + r.height * CONTENT_TOP[i] / 640;
          const cB = r.top - S.top + r.height * (CONTENT_TOP[i] + CONTENT_H[i]) / 640;
          worst = Math.min(worst, cT, H - cB, r.left - S.left, W - (r.right - S.left));
        }
      }
      scale = keep;
      return worst === Infinity ? null : worst;
    }

    function safeCeiling() {
      const a = 0.8, bq = 1.2;
      const ma = worstMargin(a), mb = worstMargin(bq);
      if (ma == null || mb == null || ma === mb) return SCALE_MAX;
      // margin(s) = ma + (mb-ma)*(s-a)/(bq-a); solve margin(s) = 2px
      let s = a + (2 - ma) * (bq - a) / (mb - ma);
      s = clamp(s, SCALE_MIN, 2.0);
      for (let i = 0; i < 40 && s > SCALE_MIN; i++) {        // verify, then back off
        const m = worstMargin(s);
        if (m != null && m >= 1) break;
        s -= 0.02;
      }
      return Math.max(SCALE_MIN, Math.floor(s * 100) / 100);
    }

    /* Controls per band, not one shared set: each band is a candidate to be
       kept on its own, so whichever one survives takes its picker and its size
       tuner with it. */
    const controls = sec.querySelector('.roll-controls');
    if (controls) {
      COLOURS.forEach((c, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'roll-sw' + (k === 0 ? ' is-on' : '');
        b.style.background = c;
        b.setAttribute('aria-label', 'background ' + c);
        b.addEventListener('click', () => {
          sec.style.setProperty('--roll-bg', c);
          controls.querySelectorAll('.roll-sw').forEach(x => x.classList.remove('is-on'));
          b.classList.add('is-on');
        });
        controls.appendChild(b);
      });

      const size = document.createElement('label');
      size.className = 'roll-size';
      size.innerHTML =
        `<span class="roll-size__cap">size</span>`
        + `<input type="range" min="${SCALE_MIN}" max="${SCALE_MAX}" step="${SCALE_STEP}" value="1">`
        + `<output>100%</output>`;
      sizeSlider = size.querySelector('input');
      const read = size.querySelector('output');
      sizeSlider.addEventListener('input', () => {
        scale = +sizeSlider.value;
        read.textContent = Math.round(scale * 100) + '%';
        /* repaint at the CURRENT scroll position, not at 0 — otherwise dragging
           the slider snaps the composition back to its first frame */
        place();
        if (!pinRange) paint(0);      // unpinned bands hold a single frame
      });
      controls.appendChild(size);
    }

    /* the ceiling depends on the stage box, so it is fixed once the cut-outs
       have decoded and refreshed whenever the stage is re-measured */
    function capSlider() {
      if (!sizeSlider || !stage.offsetHeight) return;
      const top = safeCeiling();
      sizeSlider.max = top;
      if (+sizeSlider.value > top) {
        sizeSlider.value = top; scale = top;
        sizeSlider.dispatchEvent(new Event('input'));
      }
      return top;
    }

    return { name, sec, measure, place, paint, capSlider,
             get scale() { return scale; }, set scale(v) { scale = v; },
             get safeMax() { return sizeSlider ? +sizeSlider.max : null },
             // read-only view of the pin state, for tuning from the console
             get state() { return { pinRange, stageH, pinLeft, pinW, branch, lastP }; } };
  }

  const bands = sections.map(setup).filter(Boolean);
  if (!bands.length) return;

  /* Synchronous, and the guard is released in the same tick. An earlier version
     coalesced through requestAnimationFrame and kept a `queued` flag until the
     callback ran — but if that frame is ever deferred (a background tab, a busy
     load) the flag latches, every later resize is swallowed by it, and the bands
     are stuck as still images with no way back. measure() is two layout reads;
     it does not need deferring. */
  let measuring = false;
  function remeasure() {
    if (measuring) return;                       // re-entrancy only, never latches
    measuring = true;
    try { for (const b of bands) b.measure(); } finally { measuring = false; }
  }

  addEventListener('scroll', () => { for (const b of bands) b.place(); }, { passive: true });
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  /* A ResizeObserver as well as the resize event: the window fires `resize` only
     when the WINDOW changes, and the case that bites is the page finishing its
     own layout. Watches the <html> box, never the sections this writes to, so it
     cannot feed itself. */
  new ResizeObserver(remeasure).observe(document.documentElement);
  remeasure();

  // the cut-outs decide the geometry, so re-measure once they are decoded
  Promise.all(REEL.map(src => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = res; im.src = src;
  }))).then(() => {
    remeasure();
    // the ceiling needs decoded cut-outs to measure against, so it waits for them
    for (const b of bands) b.capSlider();
  });

  window.rollBands = bands;      // handy for tuning from the console
})();
