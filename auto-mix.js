/* ─────────────────────────────────────────────────────────────────────
   auto-mix.js — the live-demo flow (?auto): click box 1, click box 2, press
   MIX. The two objects are already there — a click on a box drops the demo
   image straight in instead of opening a file picker, so there is nothing to
   find on a laptop in front of an audience. The tool "thinks" for 5 seconds
   (bowl churns), then
   the DESIGNED result window opens on its own — the troll+tooth one with
   the 01-05 spectrum strip along the bottom — looking like it generated
   live, and ready to be clicked through on stage.
   ?auto=<seconds> sets that wait to anything else, so the original 45 is
   still one URL away: index.html?auto=45.

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

  /* the "thinking"/churn time per mix. 5 seconds by default; ?auto=<seconds>
     overrides it, so ?auto=45 is the original wait. */
  const FILL_MS = (() => {
    const sec = parseFloat(params.get('auto'));
    return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 5000;
  })();

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
    /* the window Noa designed for this pair — hero, article, and the 01-05
       strip you can click through from the troll to the tooth. Built before
       the window is shown, so it opens already resting on the midpoint with
       the pair's own words in place. Same builder the ?rec10 cut uses
       (spectrum-window.js), so the two can never drift apart. */
    try { window.buildSpectrumWindow?.(); } catch (e) {}
    try { window.openMixWindow?.(); } catch (e) {}
    running = false;   // ready for the next press (result 2, then 1 again…)
  }

  /* ── one click per box ────────────────────────────────────────────────
     The boxes are <button>s; app.js opens a hidden file input from them. The
     click is caught in the CAPTURING phase on the document, so it is stopped
     before app.js ever sees it and no file dialog opens at all. The two
     images are the capture cut's own: the troll into box 1, the tooth into
     box 2, in the -sm sizes, which decode in milliseconds. */
  const DEMO = {
    'slot-a': 'assets/rec-in-b-sm.png?v=1',   // troll → box 1
    'slot-b': 'assets/rec-in-a-sm.png?v=1',   // tooth → box 2
  };
  Object.values(DEMO).forEach((u) => { const im = new Image(); im.src = u; });

  document.addEventListener('click', (e) => {
    const slot = e.target.closest?.('.slot');
    if (!slot || !DEMO[slot.id]) return;
    e.preventDefault();
    e.stopPropagation();
    try { window.recFillSlot?.(slot.id.slice(-1), DEMO[slot.id]); } catch (err) {}
  }, { capture: true });

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
