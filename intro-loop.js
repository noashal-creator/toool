/* ─────────────────────────────────────────────────────────────────────
   intro-loop.js — a seamless loop for the intro clip

   THE PROBLEM, measured rather than guessed. Sampling assets/intro-video.mp4
   (6.04s, 960×720) and comparing frames as a mean per-channel difference:

     0.2s apart ................  7.6
     0.5s apart ................ 13.1
     1.0s apart ................ 18.9
     LAST frame vs FIRST ....... 35.4   ← happens in a single frame

   So at the loop point the picture changes more in one frame than it normally
   changes in a whole second. `loop` has no way to soften that: it is a hard
   cut by construction, and no easing exists to apply to it.

   THE FIX. Two copies of the clip are stacked; the second is started 0.7s
   before the first ends and cross-faded in over exactly that overlap. The 35.4
   jump is then spread across ~0.7s instead of one frame — about 2 per frame,
   which is below even the 0.2s step above, i.e. under the clip's own normal
   rate of change and therefore invisible.

   Fixing it in the file itself (trimming to a natural loop point, or a
   forward-then-reverse ping-pong) would be the other route, but both need a
   re-encode; this works on the asset exactly as it is.

   The markup keeps `loop` on the first copy so that if this file fails to load
   the band degrades to the old cutting loop rather than freezing on one frame.
   The first thing done here is to take that attribute off.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const band = document.getElementById('intro-video');
  if (!band) return;
  const a = band.querySelector('.intro-video__el:not(.intro-video__el--b)');
  const b = band.querySelector('.intro-video__el--b');
  if (!a || !b) return;

  const FADE = 0.7;              // seconds — MUST match the CSS transition
  a.loop = false;                // we drive the alternation from here now

  let front = a, back = b, swapping = false;

  function handoff() {
    if (swapping) return;
    const d = front.duration;
    if (!d || !isFinite(d)) return;
    swapping = true;

    const from = front, to = back;
    to.currentTime = 0;
    to.play().catch(() => { /* autoplay refused — the fade still runs */ });
    b.style.opacity = (to === b) ? '1' : '0';

    // park the outgoing copy only AFTER the dissolve, or it would vanish
    // mid-fade and the cut would come back in a new place
    setTimeout(() => {
      from.pause();
      from.currentTime = 0;
      front = to;
      back = from;
      swapping = false;
    }, FADE * 1000);
  }

  /* Deliberately written to CONVERGE rather than to depend on event order.
     An earlier version was a plain state machine and it drifted the moment the
     events arrived in an unexpected order — the outgoing copy kept playing to
     its own end alongside the incoming one, and the opacity was left pointing
     at the wrong copy. Video events are not something to trust here: `play()`
     resolves asynchronously, `timeupdate` is irregular, and a background tab
     throttles the timers this hangs off.
     So every tick simply re-asserts the two invariants — only the front copy
     runs, and the fade points at the front copy — instead of assuming a past
     transition left things correct. Both are no-ops once they hold (setting
     opacity to the value it already has does not restart the transition). */
  const check = () => {
    const d = front.duration;
    if (!swapping) {
      if (!back.paused) { back.pause(); back.currentTime = 0; }
      b.style.opacity = (front === b) ? '1' : '0';
    }
    // ended already? then the fade window was missed — swap now rather than
    // sit on a frozen last frame
    if (d && (front.ended || front.currentTime >= d - FADE)) handoff();
  };

  /* Two triggers on purpose, and they are not redundant:
     · rAF is frame-accurate, which is what the fade needs to start on time,
       but it stops entirely in a background tab.
     · timeupdate is coarse (~4/sec) but keeps firing when hidden, so the
       loop cannot freeze on a last frame while the user is on another tab.
     handoff() is idempotent while a swap is in flight, so both firing at once
     costs nothing. `ended` is the last-resort net: if the machine stalls badly
     enough to miss the window, restart rather than sit on a frozen frame. */
  const tick = () => { check(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  a.addEventListener('timeupdate', check);
  b.addEventListener('timeupdate', check);
  for (const v of [a, b]) {
    v.addEventListener('ended', () => { if (v === front) handoff(); else check(); });
  }
})();
