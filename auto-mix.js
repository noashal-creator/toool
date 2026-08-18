/* ─────────────────────────────────────────────────────────────────────
   auto-mix.js — upload your own 2 images and press MIX yourself; the
   churn/result timing is swapped for the fast one we settled on for the
   recording (16s churn, then the result opens on its own), instead of the
   site's real ~30s mix timer.

   Opened with ?auto, everything else stays completely normal — the real
   upload boxes, no cursor hiding, no reel changes. Clicking MIX is caught
   before the site's own handler runs (only once both slots are actually
   filled — otherwise it's left alone, so the normal "missing slot" shake
   still happens); the site's own handler never gets to start its slow
   timeline at all.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has('auto')) return;

  const slotA = document.getElementById('slot-a');
  const slotB = document.getElementById('slot-b');
  const runEl = document.getElementById('run');
  if (!slotA || !slotB || !runEl) return;

  const FILL_MS = 16000;  // matches recording.js's churn duration
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let running = false;
  async function fastMix() {
    if (running) return;
    running = true;
    try { window.recStir?.(FILL_MS); } catch (e) {}
    await sleep(FILL_MS);
    try { window.recLift?.(); } catch (e) {}
    try { window.openMixWindow?.(); } catch (e) {}
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
