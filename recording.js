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

   Nothing here changes normal browsing: without ?rec the file is inert, and the
   hooks it uses (window.recFillSlot / recStir / recLift, window.reelMode.*) are
   additive shims exposed by app.js and sideways.js.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has('rec')) return;

  const A_URL = 'assets/rec-in-b.png?v=2';   // troll  → slot 1 (top box)
  const B_URL = 'assets/rec-in-a.png?v=2';   // tooth  → slot 2 (bottom box)

  const body = document.body;
  body.classList.add('recording');
  // silence the CTA nudge (it only bobs until a mix has run) and start clean
  document.documentElement.classList.add('has-mixed');
  try { window.recResetSlots?.(); } catch (e) {}

  // sideways.js restores its own on/off state from localStorage the instant it
  // loads (a leftover from earlier normal browsing) — force it off here so
  // nothing scrolls/jumps during the upload stage regardless of that stale
  // state. It's turned deliberately back on the moment MIX is pressed, below.
  try { window.reelMode?.disable?.(); } catch (e) {}

  // preload the two objects so the drop-in never shows an empty frame
  [A_URL, B_URL].forEach(u => { const im = new Image(); im.src = u; });

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

  const FILL_MS = 16000;  // how long recStir takes to visually fill the bowl
  const LIFT_MS = 900;    // recLift's own settle (app.js SETTLE_MS)
  /* The result window holds on the midpoint for 3s and only then runs the
     spectrum as a GIF (mix-modal.js: AUTOPLAY_AFTER_MS + PLAY_MS x 5). The take
     used to stop 900ms after the window opened, so the capture ended before any
     of that was on screen. Stay long enough to show the hold AND one full pass,
     plus a beat to land on. */
  const HOLD_MS  = 3000;  // mix-modal.js AUTOPLAY_AFTER_MS
  const GIF_MS   = 5 * 700;   // one pass of all five steps at PLAY_MS
  const OUTRO_MS = 900;

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
    await sleep(FILL_MS);                           // let it actually finish filling
    try { window.recLift?.(); } catch (e) {}
    // recStir is a shortcut around the real ~30s mix timer, so it never runs
    // the timer callback that normally calls this — trigger it directly. The
    // reel hasn't been touched since it turned on above, so the result opens
    // wherever it currently sits — no forced jump.
    try { window.openMixWindow?.(); } catch (e) {}
    await sleep(LIFT_MS + HOLD_MS + GIF_MS + OUTRO_MS);
  }

  // ── the run ──
  let started = false;
  async function play() {
    if (started) return; started = true;

    const slotA = document.getElementById('slot-a');
    const slotB = document.getElementById('slot-b');
    const runEl = document.getElementById('run');
    if (!slotA || !slotB || !runEl) return;

    await sleep(300);
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
  window.addEventListener('keydown', onKey);
})();
