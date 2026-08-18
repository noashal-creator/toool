/* ─────────────────────────────────────────────────────────────────────
   auto-mix.js — the live-demo flow (?auto): upload your own 2 images and
   press MIX yourself. The tool "thinks" for ~45 seconds (bowl churns), then
   the prepared result opens on its own — looking like it generated live.

   Two prepared results, alternating: the FIRST MIX press shows result 1,
   the SECOND press shows result 2, then back to 1, and so on in a loop —
   so a second live request on stage just works.

   Everything else stays completely normal — the real upload boxes, no
   cursor hiding, no reel changes. Clicking MIX is caught before the site's
   own handler runs (only once both slots are actually filled — otherwise
   it's left alone, so the normal "missing slot" shake still happens); the
   site's own slow real-timer flow never starts at all.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has('auto')) return;

  const slotA = document.getElementById('slot-a');
  const slotB = document.getElementById('slot-b');
  const runEl = document.getElementById('run');
  if (!slotA || !slotB || !runEl) return;

  const FILL_MS = 45000;  // the "thinking"/churn time per mix

  /* The two prepared spectrums (5 images each, in strip order 01→05).
     null = keep whatever the mix window already shows (its built-in set).
     Result 2's images are still to come — drop their paths in when ready. */
  const RESULTS = [
    null,   // result 1 — the built-in troll → tooth set
    null,   // result 2 — TODO: waiting for the second set of 5 images
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let running = false;
  let mixCount = 0;
  async function fastMix() {
    if (running) return;
    running = true;
    try { window.recStir?.(FILL_MS); } catch (e) {}
    await sleep(FILL_MS);
    try { window.recLift?.(); } catch (e) {}
    const pieces = RESULTS[mixCount % RESULTS.length];
    mixCount++;
    if (pieces) { try { window.setMixSpectrum?.(pieces); } catch (e) {} }
    try { window.openMixWindow?.(); } catch (e) {}
    running = false;   // ready for the next press (result 2, then 1 again…)
  }

  // A capture listener on #run itself would still fire AFTER app.js's own
  // click handler — at the target, listeners run in registration order
  // regardless of the capture flag, and app.js's script loads first. The
  // capturing phase on an ANCESTOR (document) genuinely runs before the
  // event ever reaches the target, so stopping it there is what actually
  // keeps app.js's slow real-timer flow from starting at all.
  document.addEventListener('click', (e) => {
    if (e.target !== runEl) return;
    if (!slotA.classList.contains('is-filled') || !slotB.classList.contains('is-filled')) return;
    e.preventDefault();
    e.stopPropagation();
    fastMix();
  }, { capture: true });
})();
