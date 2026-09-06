/* ─────────────────────────────────────────────────────────────────────
   chag-intro.js — the opening: the blue rises like a curtain, carrying the
   chain lockup up with it, and comes to rest as the band. The eight objects
   were underneath the whole time.

   Noa's idea, and it gives the blue band a reason to exist: it reads as what
   is left of the opening rather than as decoration.

   The whole thing is ONE animated property — the curtain's height. The
   lockup is pinned to the curtain's BOTTOM edge (39 below it, which is the
   gap it has inside the band), so it rides up on its own and lands exactly
   where the band's own logo sits. Nothing else has to be kept in sync,
   and the end state IS the band — 374 tall, logo at 40 — so dropping the
   overlay at the end changes nothing on screen.

   The blue has to be an OVERLAY that shrinks from the top. Growing the real
   band inside the flex column instead would shove the grid down and slide
   it back up, which reads as the grid arriving rather than being revealed.

   The flag on <html> is `chag-opening`, NOT `chag-intro`: an <html> carrying
   the element's own class matches its `display: none` base rule and blanks
   the entire document for the duration.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const root     = document.documentElement;
  const original = document.getElementById('chag-intro');
  if (!original) return;
  const main     = original.parentElement;
  /* kept so it can be replayed — it removes itself when it ends */
  const template = original.cloneNode(true);

  const FRAME_H = 1080;                 // the main area, in design units
  const BAND_H  = 374;                  // where the curtain comes to rest
  /* Noa watched it at half speed and kept that: the curtain has weight, and
     rushing it made the landing read as a snap rather than a settle. */
  const HOLD    = 440;                  // a beat, so the blue registers first
  const LIFT    = 1760;
  const EASE    = 'cubic-bezier(.22, 1, .36, 1)';   // the site's own glide

  /* `slow` stretches it for inspection; it changes nothing that ships */
  const URL_SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('slow')) || 1);

  function play(slow) {
    const SLOW  = Math.max(1, Number(slow) || URL_SLOW);
    const hold  = HOLD * SLOW;
    const total = hold + LIFT * SLOW;

    document.getElementById('chag-intro')?.remove();
    const intro = template.cloneNode(true);
    main.prepend(intro);
    root.classList.add('chag-opening');

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      intro.getAnimations({ subtree: true }).forEach((a) => a.finish());
      intro.remove();
      root.classList.remove('chag-opening');
      removeEventListener('pointerdown', finish, true);
      removeEventListener('keydown', finish, true);
    };

    /* one unit in px — the opening is far too short for a resize to matter */
    const u  = main.getBoundingClientRect().height / FRAME_H;
    const px = (n) => (n * u).toFixed(2) + 'px';

    /* Pin the lockup the exact distance above the curtain's edge that the
       band's own lockup sits above the band's, MEASURED rather than derived:
       the two elements' 1px borders stack differently, and computing it put
       the landing 2 units out. Measuring cannot drift if the band changes. */
    const band     = main.querySelector('.chag-logoband');
    const bandLogo = band && band.querySelector('.chag-logo');
    if (bandLogo) {
      const gap = band.getBoundingClientRect().bottom - bandLogo.getBoundingClientRect().bottom;
      intro.querySelector('.chag-intro__logo').style.bottom = gap.toFixed(2) + 'px';
    }

    intro.animate(
      [
        { height: px(FRAME_H), easing: EASE },
        { height: px(FRAME_H), offset: hold / total, easing: EASE },
        { height: px(BAND_H) },
      ],
      { duration: total, fill: 'forwards' }
    ).addEventListener('finish', finish);

    /* nobody should ever be stuck waiting for it */
    addEventListener('pointerdown', finish, true);
    addEventListener('keydown', finish, true);
    return total;
  }

  window.chagIntroPlay = play;

  /* it opens the page — `?intro=off` is only for working on everything else */
  const off = new URLSearchParams(location.search).get('intro') === 'off';
  if (!off && root.classList.contains('chag-opening')) play();
  else { original.remove(); root.classList.remove('chag-opening'); }
})();
