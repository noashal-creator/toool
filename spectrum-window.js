/* ─────────────────────────────────────────────────────────────────────
   spectrum-window.js — the designed result window (troll + tooth).

   index.html ships the LIVE variant of the card: one real fal-generated
   image, with the play button and the five-step spectrum strip deliberately
   removed (see the comment in the markup). The window Noa designed for this
   pair is the earlier one — hero + article + the 01–05 strip you can click
   through — which was dropped in commit 10f0141 along with mix-modal.js.

   This file puts that window back ON REQUEST, and only on request. It is
   completely inert until something calls window.buildSpectrumWindow(): no
   markup, no listeners, not even the five images are fetched. So the live
   site keeps the single-image variant it is supposed to have, and normal
   browsing is untouched.

   It lives on its own because TWO demos want the same window and they must
   never drift apart:
     index.html?rec10&result   the 10-second capture cut (recording.js)
     index.html?auto           the live-demo flow (auto-mix.js)

   The CSS for all of it is still in styles.css (.mixwin__strip / __cell /
   __tick / __num / __play), so it lands styled.

   window.buildSpectrumWindow()  builds it (or hands back the one already
                                 built), writes the pair's words, and rests
                                 it on the midpoint, 03.
                                 Returns { select, count } — or null if the
                                 card is not in the page.
   window.playSpectrum(win)      one pass, 01 → 05, back to the midpoint.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const SPECTRUM = [1, 2, 3, 4, 5].map(n => 'assets/mix/n-0' + n + '.png');
  const MID = 2;                       // 03 is the midpoint, and what opens first
  const STEP_MS = 700;                 // one step of the play-through
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* not at load: preloading five images on every visit is exactly the kind of
     cost the live site should not pay for a demo it never runs */
  let preloaded = false;
  function preload() {
    if (preloaded) return;
    preloaded = true;
    SPECTRUM.forEach(u => { const im = new Image(); im.src = u; });
  }

  /* The card's words are baked into index.html for a DIFFERENT pair ("Wing
     dryer / Insect accessory / 12 cm x 8 cm / 180 g") and are legible on
     screen. They belong with this window, so they are written here rather
     than in either demo, and the live site's own fallback text is left
     alone. The image already suits: #mixwin-big is assets/mix/n-03.png,
     the troll/tooth midpoint. */
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
    const set = (sel, text) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = text;
    };
    set('.mixwin__title', CARD.title);
    set('.mixwin__kind .u', CARD.kind);
    set('.mixwin__desc', CARD.desc);
    set('#mixwin-size', CARD.size);
    set('#mixwin-weight', CARD.weight);
  }

  let ctl = null;                      // built once, handed back after that

  /* live.css is loaded after styles.css and rewrites the result window into
     the LIVE variant: `.mixwin__hero { flex: 1 1 100% }` gives the hero the
     whole card, which collapses this strip to nothing, and it repaints the
     card white with a full-bleed photo. That is right for the real site and
     wrong for this window, whose whole point is the designed troll+tooth
     card. Disabling the sheet restores styles.css's original exactly, and
     costs nothing else: live.css contains only .mixwin__* rules. */
  function unLive() {
    document.querySelectorAll('link[rel="stylesheet"][href*="live.css"]')
      .forEach(l => { l.disabled = true; });
  }

  function build() {
    unLive();
    writeCard();
    if (ctl) { ctl.select(MID); return ctl; }

    const card = document.querySelector('.mixwin__card');
    const big  = document.getElementById('mixwin-big');
    if (!card || !big) return null;
    if (document.getElementById('mixwin-strip')) return null;

    // the play button sits with download / close, exactly where it used to
    const actions = card.querySelector('.mixwin__actions');
    if (actions && !document.getElementById('mixwin-play')) {
      const play = document.createElement('button');
      play.type = 'button'; play.className = 'mixwin__play';
      play.id = 'mixwin-play'; play.setAttribute('aria-label', 'Play');
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

    // after the hero block, before the status line — where it used to sit
    const status = card.querySelector('.mixwin__status');
    if (status) card.insertBefore(strip, status); else card.appendChild(strip);

    const cells = [...strip.querySelectorAll('.mixwin__cell')];
    const select = i => {
      big.src = SPECTRUM[i];
      cells.forEach((c, k) => c.classList.toggle('is-selected', k === i));
    };
    cells.forEach((c, i) => c.addEventListener('click', () => select(i)));

    /* the play button runs the same pass the camera cut runs */
    const playBtn = document.getElementById('mixwin-play');
    if (playBtn) playBtn.addEventListener('click', () => playSpectrum(ctl));

    select(MID);
    ctl = { select, count: SPECTRUM.length };
    return ctl;
  }

  /* One pass through the spectrum, 01 → 05, then back to rest on the midpoint —
     the "ready to click through" beat from the deck, played for the camera. */
  async function playSpectrum(win) {
    if (!win) return;
    for (let i = 0; i < win.count; i++) { win.select(i); await sleep(STEP_MS); }
    win.select(MID);
  }

  window.buildSpectrumWindow = () => { preload(); return build(); };
  window.playSpectrum = playSpectrum;
})();
