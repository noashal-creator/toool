/* ─────────────────────────────────────────────────────────────────────
   clip-stage.js — b-roll shots, run inside the real site.

   Inert unless the URL carries ?clip=<id>. With it, the page becomes a stage
   for ONE shot: the cursor and every floating control go away, and that shot's
   motion runs — on a loop where the motion has a natural loop point.

   Nothing here reimplements an animation. Every shot is driven through hooks
   that already exist (window.recStir / recLift / recFillSlot, window.reelMode,
   hero.js's own idle pan), so a redesign of the tool is a redesign of the clip.

   The FRAMING is not done here — clip.html owns the camera. This file only
   makes the right thing move. That split is deliberate: the same shot can be
   re-cropped without touching its choreography.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  const SHOT = params.get('clip');
  if (!SHOT) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);

  /* the two demo inputs, small on purpose: recFillSlot fetches AND decodes
     inside the run, and the full-res pair costs ~8s of decode */
  const IN_A = 'assets/rec-in-b-sm.png?v=1';   // troll  → slot 1
  const IN_B = 'assets/rec-in-a-sm.png?v=1';   // tooth  → slot 2

  // ── stage mode ───────────────────────────────────────────────────────────
  document.body.classList.add('recording');    // cursor: none + the control pills
  document.documentElement.classList.add('has-mixed');   // silence the idle twitch + CTA
  try { window.recResetSlots?.(); } catch (e) {}

  const t0 = performance.now();
  const done = () => console.info('[clip:' + SHOT + '] started at '
                                  + Math.round(performance.now() - t0) + 'ms');

  /* Fill both slots. The bowl's marbled contents are the two uploads, so a stir
     with empty slots churns solid black — every bowl-side shot needs this. */
  async function fillSlots() {
    try {
      await window.recFillSlot?.('a', IN_A);
      await window.recFillSlot?.('b', IN_B);
    } catch (e) { /* the shot still runs, just without the blend */ }
  }

  /* Park the reel on one slide and hand it the whole frame: hide the sidebar and
     zero --sbw. Every slide is flex-basis calc(100vw - var(--sbw)) and the reel's
     camera is left/width: var(--sbw), so the slide reflows to fill.
     The sibling slides are deliberately LEFT IN PLACE — sideways.js indexes
     .reel__row.children positionally to build its snap table, so hiding them
     desyncs the whole reel. They simply sit outside the pin's overflow:hidden. */
  async function soloSlide(i, at) {
    const rm = window.reelMode;
    if (!rm?.active?.()) return null;

    /* The layout is left completely alone — no hiding the sidebar, no zeroing
       --sbw. The clip is a CROP of the site at its natural proportions, and the
       camera simply frames the content column, so there is nothing to widen.
       That also removes the hazard that used to live here: changing --sbw
       resizes every slide, sideways.js rebuilds its snap table on resize, and
       the reel ends up parked between two slides. */
    const target = () => {
      const from = rm.sceneEntrance(i), to = rm.sceneEnd(i);
      return from + (to - from) * (at || 0);
    };
    // glideTo resolves on rAF; race it so a stalled frame clock cannot strand us
    await Promise.race([rm.glideTo(target(), 1), sleep(900)]);
    await sleep(120);
    await Promise.race([rm.glideTo(target(), 1), sleep(600)]);   // settle on the mark

    /* Repaint, and keep repainting for a beat.

       The set-pieces redraw on `scroll`, which the reel pings once per animating
       frame — so the moment the glide stops, so do the pings, and the DOM keeps
       whatever it last painted. Measured here: the reel sat correctly at
       progress 0.5 while the lollipops were still drawn at 0, and a single
       dispatched `scroll` fixed it. A few pings are not enough though — the
       glide can land late (its clock is rAF), after the pings are spent — so
       this keeps nudging for ~2s, by which point the position has settled.
       Note the order matters elsewhere too: a `resize` re-derives the pop's
       tick from scratch and undoes the paint, which is why every resize in this
       function happens BEFORE the parking, never after. */
    for (let i = 0; i < 16; i++) {
      window.dispatchEvent(new Event('scroll'));
      await sleep(120);
    }
    return rm;
  }

  // ── the shots ────────────────────────────────────────────────────────────
  /* Put the bowl back to empty. app.js has no "un-mix", and `.bowl.is-done`
     pins .bowl-fill__level at 100%, so the classes AND the inline height that
     playStir writes both have to go or the next pass starts full. */
  function resetBowl() {
    ['#spoon-rig', '#run', '.bowl'].forEach(sel => {
      const el = $(sel);
      if (el) el.classList.remove('is-mixing', 'is-finishing', 'is-done',
                                  'is-draining', 'is-carrying');
    });
    const lvl = $('.bowl-fill__level');
    if (lvl) { lvl.style.animation = 'none'; void lvl.offsetWidth; lvl.style.animation = ''; }
    const num = $('.bowl-gauge__num');
    if (num) num.textContent = '0%';
    const run = $('#run');
    if (run) run.style.transform = '';         // drop any leftover press scale
  }

  /* Close the result window the way a person would, so the site runs its own
     exit rather than having the class torn off underneath it. */
  function closeResult() {
    const x = document.getElementById('mixwin-x');
    if (x) { x.click(); return; }
    const win = document.getElementById('mixwin');
    if (win) { win.classList.remove('is-open'); win.hidden = true; }
  }

  /* The MIX button pressing itself — the dip/rebound from recording.js's
     pressMixAndFinish. Ends by clearing the inline transform so the CSS
     mixing animation takes the pill back over cleanly. */
  const smoother = k => k * k * k * (k * (k * 6 - 15) + 10);
  function tween(ms, onUpdate) {
    return new Promise(resolve => {
      const t0 = performance.now();
      (function step(now) {
        const k = Math.min(1, (now - t0) / ms);
        onUpdate(smoother(k));
        if (k < 1) requestAnimationFrame(step); else resolve();
      })(performance.now());
    });
  }
  async function pressMix() {
    const run = $('#run');
    if (!run) return;
    await tween(150, e => { run.style.transform = 'scale(' + (1 - 0.10 * e).toFixed(3) + ')'; });
    await tween(220, e => { run.style.transform = 'scale(' + (0.90 + 0.10 * e).toFixed(3) + ')'; });
    run.style.transform = '';
  }

  /* Tell the wrapper a pass is starting, so its push-in eases in step with the
     fill instead of on a clock of its own. */
  function announceCycle() {
    try { parent.postMessage({ type: 'clip:cycle', shot: SHOT }, '*'); } catch (e) {}
  }

  /* ══ THE MASTER CHOREOGRAPHY ══════════════════════════════════════════════
     Multicam. Every angle below runs THIS same performance — only the camera
     differs — so any two angles intercut without a jump, and slot 1 and slot 2
     share a framing that makes a clean match cut.

     One pass, ~18s, then it resets and runs again:

       0.0s  empty stage, a beat to settle on
       0.6s  the troll drops into box 1
       1.6s  the tooth drops into box 2
       3.0s  MIX presses itself
       3.4s  the pill dives in, the bowl starts filling (10 x 640ms stir cycles)
      10.6s  the bowl is full, the spoon lifts out
      11.4s  the result card flies out of the bowl
      13.0s  the 01-05 spectrum plays through
      16.5s  hold, close, reset — and round again

     FILL stays a whole multiple of STIR_MS (640) or the spoon snaps at the
     handover to rig-lift; that is app.js's own constraint, not a preference. */
  const FILL = 6400;

  /* An image dropping into a slot: parked above the (clipped) slot while the
     real fetch+decode happens, then slid down already-correct, with the landing
     glow. Same move recording.js uses — worth matching, because slot 1 and
     slot 2 must land identically for the match cut to work. */
  async function dropInto(key, url) {
    const slot = $('#slot-' + key);
    const pv = slot && slot.querySelector('.slot__preview');
    if (!slot) return;
    /* app.js's load() rewrites the slot's label to the uploaded FILENAME — real
       product behaviour, but on camera it flashes "OBJECT 2.JPG" in plain type
       across the yellow box in the gap between the fill resolving and the
       preview sliding down, replacing the designed glyph. Snapshot the label and
       put it straight back; the preview covers it once landed either way. */
    const label = slot.querySelector('.slot__label');
    const labelHTML = label ? label.innerHTML : null;
    if (pv) {
      pv.style.transition = 'none';
      pv.style.transform = 'translateY(-115%)';
      void pv.offsetWidth;
    }
    try { await window.recFillSlot?.(key, url); } catch (e) {}
    if (label && labelHTML != null) label.innerHTML = labelHTML;   // keep the glyph
    if (pv) {
      pv.style.transition = 'transform .42s cubic-bezier(.33, 1.12, .5, 1)';
      pv.style.transform = 'translateY(0)';
    }
    await sleep(300);
    slot.classList.remove('rec-land'); void slot.offsetWidth;
    slot.classList.add('rec-land');
    await sleep(700);
    if (pv) pv.style.transition = '';
  }

  /* Back to a clean stage for the next pass. resetBowl() alone is not enough —
     the slots hold their images and the result window may still be open. */
  async function resetStage() {
    closeResult();
    resetBowl();
    try { window.recResetSlots?.(); } catch (e) {}
    await sleep(560);          // recResetSlots staggers 130 + fades 420
  }

  async function master() {
    /* the designed troll+tooth card, not the LIVE one-image variant */
    document.querySelectorAll('link[rel="stylesheet"][href*="live.css"]')
      .forEach(l => { l.disabled = true; });
    done();
    for (;;) {
      announceCycle();                 // the cameras start their moves here
      await sleep(600);
      await dropInto('a', IN_A);       // the troll lands in box 1
      await dropInto('b', IN_B);       // the tooth lands in box 2  — same move
      await sleep(400);
      await pressMix();                // the button presses itself
      await sleep(200);
      window.recStir?.(FILL);          // the pill dives in; the bowl fills
      await sleep(800 + FILL);         // bowl-load carries an 800ms delay
      window.recLift?.();              // spoon out, gauge at 100%
      await sleep(600);
      writeCard();
      buildDesignedWindow();
      try { window.openMixWindow?.(); } catch (e) {}
      await sleep(1600);               // the card flies out and lands
      await playSpectrum();            // 01 -> 05
      await sleep(1200);
      await resetStage();
      await sleep(300);
    }
  }

  const SHOTS = {
    /* ── multicam angles: all one performance, different cameras ────────── */
    sail:  master,   // the travelling shot: box 1 -> box 2 -> the bowl
    wide:  master,   // the whole page — establishing
    slots: master,   // both upload boxes
    slot1: master,   // box 1 taking its image
    slot2: master,   // box 2 — identical framing, so it match-cuts to slot1
    mix:   master,   // the button, pressing itself
    card:  master,   // the result flying out of the bowl
    band:  master,   // the content column alone, no sidebar



    /* 1 · the hand stirring, close up.
       Deliberately NOT recStir: that also starts the bowl fill, the gauge and
       the marbling. The stir itself is pure CSS on the rig — is-mixing runs
       rig-descend once (800ms) and then rig-stir forever at 640ms. rig-stir's
       0% and 100% are the same angle, so any 640ms window after the dip is a
       seamless loop; nothing needs restarting. */
    async hand() {
      const rig = $('#spoon-rig'), run = $('#run');
      if (!rig || !run) return;
      [rig, run].forEach(el => {
        el.classList.remove('is-mixing', 'is-finishing', 'is-done');
        void el.offsetWidth;                    // reflow, so the dip replays
        el.classList.add('is-mixing');
      });
      done();
    },

    /* 2 · the bowl filling and the spoon lifting out.
       6400ms = 10 whole stir cycles: app.js hands over to rig-lift at a fixed
       angle, so a fill that is not a multiple of 640 makes the spoon snap.
       The bowl is only full at 800 + fill (bowl-load carries an 800ms delay),
       which is when the lift belongs. */
    async bowl() {
      await fillSlots();
      const FILL = 6400;                       // 10 whole stir cycles
      done();
      /* Repeats for ever. A fill is a one-way 0→100, so unlike the stir it has
         no natural loop point — the cycle is: fill, lift, hold on the full
         bowl, then wipe the three classes and the inline fill height so the
         next pass starts from empty. Without the reset app.js's `.is-done`
         rule pins the level at 100% and every later pass would start full. */
      for (;;) {
        announceCycle();                       // the camera starts its push here
        await pressMix();                      // …and you see the button pressed
        await sleep(200);
        window.recStir?.(FILL);
        await sleep(800 + FILL);               // bowl-load carries an 800ms delay
        window.recLift?.();
        await sleep(1600);                     // hold on the full bowl, camera at its closest
        resetBowl();
        await sleep(500);                      // a beat, then the camera cuts back wide
      }
    },

    /* 3 · the cow strip panning right to left.
       hero.js's own idle loop, which is the only seamless pan in the codebase:
       it appends a clone of the strip and wraps on the strip's full width, so
       the loop point is invisible. It only runs with the reel OFF and with the
       band's top edge below the viewport top — hence the scroll. */
    async cow() {
      try { window.reelMode?.disable?.(); } catch (e) {}
      /* idleKick() only runs while the band's top edge is still below the
         viewport top, so park one pixel into it — any further and hero.js
         switches to its pinned, scroll-scrubbed branch and the loop stops. */
      const banner = $('.logo-banner');
      window.scrollTo(0, Math.max(1, (banner?.offsetHeight || 80) - 1));
      window.dispatchEvent(new Event('resize'));
      await sleep(60);
      window.dispatchEvent(new Event('scroll'));   // → hero.js idleKick()
      done();
    },

    /* 4 · the lollipop ring turning.
       Two motions live here: a scroll-driven converge arc, and an ambient
       carousel on its own 12s clock. The carousel is scaled by how far the ring
       has opened, so it is invisible at the start — park mid-dwell, where the
       ring is fully open, and let the carousel turn on its own. No scrolling. */
    async pops() {
      await soloSlide(2, 0.5);
      done();
    },

    /* 5 · the cut-outs trailing across the pink.
       They read mousemove on their own section, so a synthetic orbit drives
       them with no cursor. It has to keep dispatching: stop, and the chain
       converges on the last point and freezes. */
    async chase() {
      await soloSlide(4, 0);
      const sec = document.getElementById('hero-chase');
      if (!sec) return;
      let r = sec.getBoundingClientRect();
      window.addEventListener('resize', () => { r = sec.getBoundingClientRect(); });
      const T0 = performance.now();
      (function drive(now) {
        const a = (now - T0) / 2600;
        sec.dispatchEvent(new MouseEvent('mousemove', {
          clientX: r.left + r.width  * (0.5 + 0.40 * Math.cos(a)),
          clientY: r.top  + r.height * (0.5 + 0.36 * Math.sin(a * 1.4)),
          bubbles: true,
        }));
        requestAnimationFrame(drive);
      })(performance.now());
      done();
    },

    /* 6 · the result card flying out of the bowl.
       index.html ships the LIVE card (one generated image); the designed
       troll+tooth window is the one with the 01–05 strip. Same two moves ?rec10
       makes: drop live.css (it holds only .mixwin__* rules) and put the strip
       and play button back. */
    async result() {
      await fillSlots();
      document.querySelectorAll('link[rel="stylesheet"][href*="live.css"]')
        .forEach(l => { l.disabled = true; });
      window.recStir?.(1280);
      await sleep(2080);
      window.recLift?.();
      writeCard();
      buildDesignedWindow();
      try { window.openMixWindow?.(); } catch (e) {}
      done();
      await sleep(1600);                       // the card flies out and lands
      await playSpectrum();

      /* …then close it and do the whole thing again, so the tile is never a
         dead still. Closing through the real ✕ keeps app.js's own wind-down
         (is-draining / is-carrying) honest instead of ripping the class off. */
      for (;;) {
        await sleep(1500);                     // hold on the finished card
        closeResult();
        resetBowl();
        /* Keep this gap SHORT. The camera is framed on the card, so while the
           window is shut the tile shows the reel behind it — which reads as a
           completely different shot. Just enough stir for the card to have
           somewhere to fly out of, then straight back in. */
        await sleep(220);
        window.recStir?.(640);
        await sleep(900);
        window.recLift?.();
        try { window.openMixWindow?.(); } catch (e) {}
        await sleep(1600);                     // the flight lands
        await playSpectrum();
      }
    },
  };

  /* The card's words are baked into the markup for a different pair ("Wing
     dryer / Insect accessory"), and they are legible on screen. Same wording
     ?rec10 writes, applied from the script so the live site's own fallback text
     is left alone. */
  const CARD = {
    title:  'Troll tooth',
    kind:   'Dental charm',
    desc:   'A troll tooth is a molar with a face of its own — a back tooth ' +
            'that grew hair and an opinion. Kept for luck, mostly by people ' +
            'who no longer have the tooth it came from.',
    size:   '9 cm × 6 cm',
    weight: '95 g',
  };
  function writeCard() {
    const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
    set('.mixwin__title', CARD.title);
    set('.mixwin__kind .u', CARD.kind);
    set('.mixwin__desc', CARD.desc);
    set('#mixwin-size', CARD.size);
    set('#mixwin-weight', CARD.weight);
  }

  /* the designed result window — the strip + play button that live.css and
     commit 10f0141 took out of the shipped card */
  const SPECTRUM = [1, 2, 3, 4, 5].map(n => 'assets/mix/n-0' + n + '.png');
  const MID = 2, STEP_MS = 700;
  SPECTRUM.forEach(u => { const im = new Image(); im.src = u; });
  let cells = [], big = null;

  function buildDesignedWindow() {
    const card = $('.mixwin__card');
    big = document.getElementById('mixwin-big');
    if (!card || !big || document.getElementById('mixwin-strip')) return;

    const actions = card.querySelector('.mixwin__actions');
    if (actions && !document.getElementById('mixwin-play')) {
      const play = document.createElement('button');
      play.type = 'button'; play.className = 'mixwin__play'; play.id = 'mixwin-play';
      play.setAttribute('aria-label', 'Play');
      play.innerHTML =
        '<svg class="i-play" viewBox="0 0 26 26" aria-hidden="true">' +
          '<path d="M7 4 L21 13 L7 22 Z" fill="currentColor"/></svg>' +
        '<svg class="i-pause" viewBox="0 0 26 26" aria-hidden="true">' +
          '<rect x="6" y="4" width="5.4" height="18" fill="currentColor"/>' +
          '<rect x="14.6" y="4" width="5.4" height="18" fill="currentColor"/></svg>';
      actions.insertBefore(play, actions.querySelector('.mixwin__x'));
    }

    const strip = document.createElement('div');
    strip.className = 'mixwin__strip';
    strip.id = 'mixwin-strip';
    strip.innerHTML = SPECTRUM.map((src, i) =>
      '<button type="button" class="mixwin__cell' + (i === MID ? ' is-selected' : '') +
      '" data-i="' + i + '">' +
        '<span class="mixwin__tick" aria-hidden="true"></span>' +
        '<span class="mixwin__num">0' + (i + 1) + '</span>' +
        '<img src="' + src + '" alt="Spectrum step ' + (i + 1) + '">' +
      '</button>').join('');
    const status = card.querySelector('.mixwin__status');
    if (status) card.insertBefore(strip, status); else card.appendChild(strip);

    cells = [...strip.querySelectorAll('.mixwin__cell')];
    select(MID);
  }
  function select(i) {
    if (!big || !cells.length) return;
    big.src = SPECTRUM[i];
    cells.forEach((c, k) => c.classList.toggle('is-selected', k === i));
  }
  async function playSpectrum() {
    for (let i = 0; i < SPECTRUM.length; i++) { select(i); await sleep(STEP_MS); }
    select(MID);
  }

  // ── run it ───────────────────────────────────────────────────────────────
  const run = SHOTS[SHOT];
  if (!run) { console.warn('[clip] unknown shot:', SHOT, '— try', Object.keys(SHOTS).join(', ')); return; }

  /* Wait for the preloads and one settled layout before starting: the reel
     measures itself on load, and a shot that parks the reel before that lands
     on the wrong slide. */
  function boot() { setTimeout(() => run().catch(e => console.error('[clip]', e)), 500); }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });

  window.__clip = { shot: SHOT, shots: Object.keys(SHOTS) };   // for verification
})();
