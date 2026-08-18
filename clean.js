/* ─────────────────────────────────────────────────────────────────────
   clean.js — press SPACE for a clean screenshot.

   Toggles body.clean, which hides every dev/nav control (the colour + sideways
   + logo pills, and the in-scene tuning panels) via a CSS rule in styles.css —
   so you can grab the frame with no buttons in it. Press Space again to bring
   them back.

   Registered in the CAPTURE phase and stops the event, so Space no longer
   scrolls the page or steps the sideways reel while you're framing a shot. It
   stays out of the way of text fields and the embedded game, and is disabled
   entirely under the ?rec recording demo, which owns Space itself. */
(() => {
  if (/[?&]rec\b/.test(location.search)) return;      // recording.js owns Space there
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(a.tagName) || a.isContentEditable)) return;
    e.preventDefault();
    e.stopImmediatePropagation();                     // beat page-scroll + the reel's Space handler
    document.body.classList.toggle('clean');
  }, true);
})();
