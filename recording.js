/* ─────────────────────────────────────────────────────────────────────
   recording.js — a scripted, cursor-less intro for screen capture

   Opened with ?rec, the tool enters a clean "stage" mode: every floating
   control and the OS cursor are hidden. Pressing Space (or R) plays ONLY the
   setup — no hand, no cursor, ever:

     · the troll drops into slot 1 (top box), the tooth into slot 2 (bottom) —
       the sideways reel stays off and frozen through this part, so nothing
       scrolls or jumps while the two images are still landing,
     · the MIX button presses itself — the exact instant it lights up, the
       reel switches on and stays on, so scrolling is available for the whole
       churn, not just once it finishes,
     · the bowl churns and finishes → the spoon lifts and the result window
       opens, wherever the reel happens to be sitting at that moment (never
       touched again once it turned on, so nothing forces it back to start).

   That's it — the script STOPS right there. Touring the reel further (pizza,
   candy, the rest) is done BY HAND from there, not scripted.

   TWO modes, one script so they can never drift apart:
     ?rec    — the original: press Space/R to start, 16s churn.
     ?rec10  — the short capture cut used by rec10.html: starts ITSELF shortly
               after load (no keypress) and is retimed so the result window
               opens at exactly 10.0s. It also rewrites the result card's words,
               which are baked in the markup for a different pair of objects.

   Nothing here changes normal browsing: without ?rec/?rec10 the file is inert,
   and the hooks it uses (window.recFillSlot / recStir / recLift,
   window.reelMode.*) are additive shims exposed by app.js and sideways.js.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  const TEN = params.has('rec10');                 // the 10-second capture cut
  /* ?rec10 now ends on the mix itself — no result window. Add &result to the
     URL to get the designed troll+tooth window back at the end; ?rec is
     unaffected and always shows it. */
  const SHOW_RESULT = !TEN || params.has('result');
  if (!params.has('rec') && !TEN) return;

  /* The -sm copies, not the originals. recFillSlot fetches AND DECODES inside
     the timed run (app.js: fetch → blob → load(), whose promise resolves only
     once the pixels are on screen), so the source size lands directly on the
     schedule: the full-res pair (1294×1724 / 1086×1448, 1.3MB + 2.5MB) cost
     ~8s of decode and pushed the measured run from 10.0s to 18.0s. They are
     only ever seen inside a ~200px slot, so 480×640 is already generous and
     decodes in milliseconds. The originals stay untouched for other uses. */
  const A_URL = 'assets/rec-in-b-sm.png?v=1';   // troll  → slot 1 (top box)
  const B_URL = 'assets/rec-in-a-sm.png?v=1';   // tooth  → slot 2 (bottom box)

  const body = document.body;
  body.classList.add('recording');

  /* live.css turns the result window into the LIVE variant, which collapses
     the spectrum strip; spectrum-window.js disables it as part of building
     the designed card, so the two always travel together. */
  // silence the CTA nudge (it only bobs until a mix has run) and start clean
  document.documentElement.classList.add('has-mixed');
  try { window.recResetSlots?.(); } catch (e) {}

  // sideways.js restores its own on/off state from localStorage the instant it
  // loads (a leftover from earlier normal browsing) — force it off here so
  // nothing scrolls/jumps during the upload stage regardless of that stale
  // state. It's turned deliberately back on the moment MIX is pressed, below.
  try { window.reelMode?.disable?.(); } catch (e) {}

  /* Preload the two objects so the drop-in never shows an empty frame — and so
     the schedule is repeatable: this warms the HTTP cache, which is what keeps
     recFillSlot's own fetch out of the timed run. Exposed as a promise because
     ?rec10 gates its auto-start on it rather than on a blind delay. */
  const warmed = Promise.all([A_URL, B_URL].map(u => new Promise(resolve => {
    const im = new Image();
    im.onload = im.onerror = () => resolve();     // a miss must not hang the demo
    im.src = u;
  })));

  // ── easing + timing primitives ──
  const smootherstep = k => k * k * k * (k * (k * 6 - 15) + 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function tween(ms, onUpdate, ease = smootherstep) {
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        onUpdate(ease(k), k);
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // ── beats ──
  // The image drops into the slot as a clean cut (no fade, no scale morph): it
  // is parked just above the (clipped) slot while the REAL fetch+decode
  // happens — recFillSlot's promise resolves only once the pixels are
  // actually in place — then slides down already-correct. A glow marks the
  // landing.
  async function objectIn(key, slotEl, url) {
    const preview = slotEl.querySelector('.slot__preview');
    if (preview) {
      preview.style.transition = 'none';
      preview.style.transform = 'translateY(-115%)';
      void preview.offsetWidth;
    }
    try { await window.recFillSlot?.(key, url); } catch (err) {}
    if (preview) {
      preview.style.transition = 'transform .42s cubic-bezier(.33, 1.12, .5, 1)';
      preview.style.transform = 'translateY(0)';
    }
    await sleep(300);
    slotEl.classList.remove('rec-land'); void slotEl.offsetWidth;  // glow impact on landing
    slotEl.classList.add('rec-land');
    await sleep(700);
    if (preview) preview.style.transition = '';
  }

  /* ── timing ──────────────────────────────────────────────────────────────
     app.js owns the real choreography; two of its numbers constrain ours:

       STIR_MS    = 640   one full stir cycle. The fill MUST be a whole number
                          of these, or the spoon hands over to rig-lift
                          mid-cycle and visibly snaps (app.js:23-27).
       DESCEND_MS = 800   the bowl-load animation's delay (styles.css), so the
                          bowl is only actually FULL at DESCEND_MS + fill.

     ?rec keeps its original 16s (and its original 800ms-early lift, which is
     invisible at that length). ?rec10 is built backwards from a hard target:
     the result window must open 10,000ms after the demo starts.

       lead-in  = 130 + 1000 + 1000 + 300 + 370  = 2800   (see play() below)
       fill     = 10 * 640                       = 6400
       churn    = DESCEND_MS + fill              = 7200
       result at  2800 + 7200                    = 10,000  ✔ bowl genuinely full */
  const STIR_MS    = 640;
  const DESCEND_MS = 800;
  const FILL_MS = TEN ? 10 * STIR_MS : 16000;   // how long recStir takes to fill the bowl
  const CHURN_MS = TEN ? DESCEND_MS + FILL_MS   // wait for the fill to truly complete
                       : FILL_MS;                // ?rec: unchanged, lifts 800ms early
  const LIFT_MS = 900;    // recLift's own settle (app.js SETTLE_MS)
  /* The tail. ?rec was written when mix-modal.js held on the midpoint for 3s and
     then played the five-step spectrum as a GIF — that markup (#mixwin-strip)
     and that script are both gone from the page, so for the short cut the tail
     is just long enough for mix-live.js's card flight (FLIGHT_MS 1150) to land
     and hold one beat. ?rec keeps its original padding. */
  const HOLD_MS  = 3000;  // mix-modal.js AUTOPLAY_AFTER_MS
  const GIF_MS   = 5 * 700;   // one pass of all five steps at PLAY_MS
  const OUTRO_MS = 900;
  const TAIL_MS  = TEN ? 2500 : (LIFT_MS + HOLD_MS + GIF_MS + OUTRO_MS);

  /* The card's words for this pair travel with the window itself, in
     spectrum-window.js — building it writes them. */

  /* ── the slow pan that plays WHILE it mixes ──────────────────────────────
     Only two stops, deliberately: the cow spectrum sweeping past, then the
     pizza video. It does not need to cover the whole reel — it needs to look
     like the tool is being browsed while it thinks.

     sideways.js exposes the seam: glideTo(pos, ms) drives the reel's own
     position with a smootherstep ease and pings a scroll event every frame, so
     the cow's sweep (hero.js) scrubs from it exactly as it does under a hand.
     sceneEntrance(i)/sceneEnd(i) are the section's arrival and fully-played
     positions — for the cow those bracket its dwell, which IS the sweep.

     The whole tour is budgeted to the churn, so the result still lands on time.
     Each leg is raced against a timeout: glideTo resolves on rAF, which never
     ticks in a hidden tab, and a stalled leg must not strand the demo. */
  const HERO_SLIDE = 0, VIDEO_SLIDE = 1;
  function raceSleep(promise, ms) {
    return Promise.race([promise, sleep(ms)]);
  }
  async function tourWhileMixing(budgetMs) {
    const rm = window.reelMode;
    if (!rm || !rm.active?.() || typeof rm.glideTo !== 'function') {
      await sleep(budgetMs);                       // no reel (narrow / disabled) — just wait
      return;
    }
    const settle = Math.round(budgetMs * 0.08);    // arrive on the cow
    const sweep  = Math.round(budgetMs * 0.52);    // the cow spectrum pans across
    const toVid  = budgetMs - settle - sweep;      // …and on into the pizza video
    try {
      await raceSleep(rm.glideTo(rm.sceneEntrance(HERO_SLIDE), settle), settle + 1200);
      await raceSleep(rm.glideTo(rm.sceneEnd(HERO_SLIDE), sweep), sweep + 1200);
      await raceSleep(rm.glideTo(rm.sceneEnd(VIDEO_SLIDE), toVid), toVid + 1200);
    } catch (e) {
      await sleep(400);                            // never strand the run on a tour error
    }
  }

  // the MIX button presses itself (a natural button dip), the bowl churns and
  // fills, then the spoon lifts out and the result window pops — the whole
  // thing scripted, ending "ready" with the result already showing.
  async function pressMixAndFinish(runEl) {
    await tween(150, e => { runEl.style.transform = `scale(${(1 - 0.10 * e).toFixed(3)})`; });
    await tween(220, e => { runEl.style.transform = `scale(${(0.90 + 0.10 * e).toFixed(3)})`; });
    runEl.style.transform = '';                    // hand back to the CSS mix animation
    // Both images are in and MIX has just been pressed — turn the sideways
    // reel on right here, at the exact moment the button lights up, and never
    // touch it again. Scrolling is available for the whole churn (not just
    // once it finishes); the earlier upload stage stays untouched/frozen.
    try { window.reelMode?.enable?.(); } catch (e) {}
    try { window.recStir?.(FILL_MS); } catch (e) {}
    // ?rec10 browses the reel while it churns; ?rec just waits as before
    if (TEN) await tourWhileMixing(CHURN_MS);
    else await sleep(CHURN_MS);                     // let it actually finish filling
    try { window.recLift?.(); } catch (e) {}
    // recStir is a shortcut around the real ~30s mix timer, so it never runs
    // the timer callback that normally calls this — trigger it directly. The
    // reel hasn't been touched since it turned on above, so the result opens
    // wherever it currently sits — no forced jump.
    let designed = null;
    if (SHOW_RESULT) {
      if (TEN) { designed = buildDesignedWindow(); }   // before it becomes visible
      try { window.openMixWindow?.(); } catch (e) {}
    }
    /* Self-report, so the 10s target is checkable at a glance instead of taken
       on trust: browsers clamp timers in a hidden/occluded tab, so this only
       reads true for a run you can actually see on screen. */
    window.__recResultMs = Math.round(performance.now() - window.__recStart);
    console.info('[rec' + (TEN ? '10' : '') + '] '
                 + (SHOW_RESULT ? 'result window opened' : 'mix finished')
                 + ' at ' + window.__recResultMs + 'ms (target '
                 + (OPEN_MS + 2670 + CHURN_MS) + 'ms)');
    if (!SHOW_RESULT) {
      await sleep(1200);                 // hold on the finished bowl, then stop
    } else if (TEN) {
      await sleep(1400);                 // the card flies out of the bowl and lands
      await playSpectrum(designed);      // …then the five steps run like a gif
      await sleep(900);
    } else {
      await sleep(TAIL_MS);
    }
  }

  /* ── the designed result window (troll + tooth) ──────────────────────────
     Lives in spectrum-window.js, because ?auto wants the same window and the
     two demos must never drift apart. Inert until one of them asks for it. */
  const buildDesignedWindow = () => window.buildSpectrumWindow?.() || null;
  const playSpectrum = (win) => window.playSpectrum?.(win) ?? Promise.resolve();

  // ── the run ──
  const OPEN_MS = TEN ? 130 : 300;    // ?rec10: shaved so the result lands on 10.0s
  let started = false;
  async function play() {
    if (started) return; started = true;
    window.__recStart = performance.now();          // for verifying the 10s target

    const slotA = document.getElementById('slot-a');
    const slotB = document.getElementById('slot-b');
    const runEl = document.getElementById('run');
    if (!slotA || !slotB || !runEl) return;

    await sleep(OPEN_MS);
    await objectIn('a', slotA, A_URL);              // troll drops into slot 1
    await objectIn('b', slotB, B_URL);              // tooth drops into slot 2
    await sleep(300);                               // both clearly seated…
    await pressMixAndFinish(runEl);                 // …MIX presses itself, churns, lifts. Ready — stop.
  }

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      window.removeEventListener('keydown', onKey);
      play();
    }
  }
  window.addEventListener('keydown', onKey);         // manual start / fallback in both modes

  /* ?rec10 starts itself, but only once the two objects are actually in the
     cache — objectIn awaits a real fetch+decode, so starting the clock while
     they are still cold is what pushes the run past its 10.0s target. A blind
     delay cannot know that; `warmed` does. The extra beat after it is just so
     the frame doesn't begin moving the instant the page appears.
     `started` guards against a stray keypress double-firing this. */
  const BOOT_BEAT_MS = 400;
  if (TEN) warmed.then(() => setTimeout(play, BOOT_BEAT_MS));
})();
