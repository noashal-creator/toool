/* ─────────────────────────────────────────────────────────────────────
   TOOOL — mix result popup (Figma node 3062:4)

   Pops up after MIX (opened from app.js once the ~10s stir finishes).
   Fixed demo content: the "perforated metal penguin" article + a five-step
   duck→grater spectrum. Clicking a thumbnail swaps the big image and moves
   the yellow highlight; DOWNLOAD saves the currently-shown big image.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const win   = document.getElementById('mixwin');
  const card  = win?.querySelector('.mixwin__card');
  const big   = document.getElementById('mixwin-big');
  const strip = document.getElementById('mixwin-strip');
  const dlBtn = document.getElementById('mixwin-dl');
  const xBtn  = document.getElementById('mixwin-x');
  const playBtn = document.getElementById('mixwin-play');
  if (!win || !big || !strip) return;

  /* The five spectrum steps, exported straight from Figma (node 2949:83) —
     1200x896 transparent PNGs, used as-is. Step 03 (the midpoint) opens first. */
  const LARGE = [
    'assets/mix/n-01.png',
    'assets/mix/n-02.png',
    'assets/mix/n-03.png',
    'assets/mix/n-04.png',
    'assets/mix/n-05.png',
  ];

  /* Size and Weight per step. The spectrum runs tooth -> troll, so the objects
     grow across it, while the WEIGHT peaks in the middle: the hybrid is dense
     flesh-and-bone, and the plastic doll at the end is hollow and light. Step 03
     keeps the Figma's own numbers. */
  const SPECS = [
    { size: '2.5 cm × 1.8 cm', weight: '4 g'   },
    { size: '5 cm × 3 cm',     weight: '18 g'  },
    { size: '12 cm × 8 cm',    weight: '180 g' },   // Figma 3234:272
    { size: '13 cm × 9 cm',    weight: '120 g' },
    { size: '14 cm × 9 cm',    weight: '70 g'  },
  ];
  const sizeEl   = document.getElementById('mixwin-size');
  const weightEl = document.getElementById('mixwin-weight');

  const DEFAULT = 2;           // step 03 is the midpoint — the default result
  let selected = DEFAULT;

  function select(i, animate) {
    if (i < 0 || i >= LARGE.length) return;
    selected = i;
    big.src = LARGE[i];
    if (sizeEl)   sizeEl.textContent   = SPECS[i].size;
    if (weightEl) weightEl.textContent = SPECS[i].weight;
    for (const cell of strip.children) {
      cell.classList.toggle('is-selected', Number(cell.dataset.i) === i);
    }
    if (animate) {               // little pop on the big image when the user picks a step
      big.classList.remove('is-swapping');
      void big.offsetWidth;      // restart the animation
      big.classList.add('is-swapping');
    }
  }

  /* swap the whole spectrum to a new set of images (5 data-URLs / paths),
     e.g. the pieces sliced from a prepared grid. Keeps every interaction. */
  function setSpectrum(pieces) {
    if (!Array.isArray(pieces) || !pieces.length) return;
    const n = Math.min(pieces.length, LARGE.length);
    for (let i = 0; i < n; i++) {
      LARGE[i] = pieces[i];
      const img = strip.children[i]?.querySelector('img');
      if (img) img.src = pieces[i];
    }
    win.classList.add('is-generated');   // pieces sit on white → white hero
    select(DEFAULT);
  }
  window.setMixSpectrum = setSpectrum;

  /* ── the window flies OUT of the bowl ──────────────────────────────
     Two things have to happen before the card's animation is allowed to
     start, and both need the card laid out but NOT yet transformed:
     1. measure where it must start (the bowl's liquid) and where it lands
        (wherever .mixwin's own centring puts it) → --dx / --dy / --sc
     2. raise the curtain: a clone of the real .bowl + .bowl-fill painted
        above the modal layer, so the card is genuinely hidden inside the
        bowl instead of sitting on top of it (see styles.css).
     The clone is cloned from the live nodes rather than written out, so it
     carries the user's own uploaded images and the exact current state and
     cannot drift from the bowl underneath it. */
  const FLIGHT_MS = 1150;                  // must match card-fly-smooth in styles.css
  const narrow = () => window.matchMedia('(max-width: 860px)').matches;
  let curtain = null, curtainTimer = 0;

  function dropCurtain() {
    clearTimeout(curtainTimer);
    curtain?.remove();
    curtain = null;
  }

  function launchFromBowl() {
    const bowlEl = document.querySelector('.bowl');
    const fillEl = document.querySelector('.bowl-fill');
    if (!card || !bowlEl || !fillEl || narrow()) return;

    // measure with the animation suppressed — otherwise we would read the
    // transformed box and the card would aim at the wrong place
    card.style.animation = 'none';
    void card.offsetWidth;
    const cardBox = card.getBoundingClientRect();
    const fillBox = fillEl.getBoundingClientRect();
    if (!cardBox.width || !fillBox.width) { card.style.animation = ''; return; }

    // start from inside the liquid, sized to about half the bowl's width
    const ox = fillBox.left + fillBox.width / 2;
    const oy = fillBox.top + fillBox.height * 0.42;
    card.style.setProperty('--dx', (ox - (cardBox.left + cardBox.width / 2)).toFixed(2) + 'px');
    card.style.setProperty('--dy', (oy - (cardBox.top + cardBox.height / 2)).toFixed(2) + 'px');
    card.style.setProperty('--sc', (fillBox.width * 0.5 / cardBox.width).toFixed(4));

    dropCurtain();
    curtain = document.createElement('div');
    curtain.className = 'mixwin-clone';
    curtain.setAttribute('aria-hidden', 'true');
    const bowlCopy = bowlEl.cloneNode(true);
    bowlCopy.classList.add('is-carrying');   // the copy's level empties in step
    curtain.append(bowlCopy, fillEl.cloneNode(true));
    document.body.appendChild(curtain);
    curtainTimer = setTimeout(dropCurtain, FLIGHT_MS);

    card.style.animation = '';               // now let it fly
  }

  function open() {
    select(DEFAULT);             // every new mix opens on the midpoint (step 03)
    win.hidden = false;
    win.classList.add('is-open');
    if (card) {
      // re-trigger the flight each time (also restarts it if it is mid-run)
      card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      launchFromBowl();
      card.focus({ preventScroll: true });   // focus the dialog, not the ✕ (avoids a focus ring on it)
    }
    clearTimeout(autoplayTimer);
    autoplayTimer = setTimeout(startPlay, AUTOPLAY_AFTER_MS);
  }

  function close() {
    stopPlay();
    dropCurtain();               // never leave a stale bowl copy over the page
    win.classList.remove('is-open');
    win.hidden = true;
  }

  /* ── ▶ Play: cycle the strip like a GIF, looping until Pause ──────── */
  const PLAY_MS = 700;
  /* The result lands on the midpoint and HOLDS there for a beat — that object is
     the answer to the mix, and it needs a moment to be read as one before the
     spectrum starts moving. Only then does the GIF take over, from 01. */
  const AUTOPLAY_AFTER_MS = 3000;
  let playTimer = 0, autoplayTimer = 0;
  function stopPlay() {
    clearInterval(playTimer);
    clearTimeout(autoplayTimer);      // a manual choice cancels the pending start
    playTimer = 0;
    autoplayTimer = 0;
    playBtn?.classList.remove('is-playing');
  }
  function startPlay() {
    stopPlay();
    playBtn?.classList.add('is-playing');
    select(0, true);           // the GIF always begins at 01 and runs left → right
    playTimer = setInterval(() => select((selected + 1) % LARGE.length, true), PLAY_MS);
  }
  playBtn?.addEventListener('click', () => (playTimer ? stopPlay() : startPlay()));

  /* thumbnail click → swap big image + move highlight (and stop autoplay) */
  strip.addEventListener('click', event => {
    const cell = event.target.closest('.mixwin__cell');
    if (cell) { stopPlay(); select(Number(cell.dataset.i), true); }
  });

  /* DOWNLOAD → save the currently-shown big image */
  dlBtn?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = LARGE[selected];   // the selected source (currentSrc can lag while a new one loads)
    a.download = `toool-midpoint-0${selected + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* close via ✕, Esc, or clicking the backdrop (outside the card) */
  xBtn?.addEventListener('click', close);
  win.addEventListener('click', event => { if (event.target === win) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && win.classList.contains('is-open')) close();
  });

  // let app.js reveal the popup when the mix finishes
  window.openMixWindow = open;

  /* The window now shows the Figma exports directly (LARGE above), so the
     grid-slicing pass is OFF: it would re-crop and re-trim images that are
     already exactly as designed. `window.loadGridImage` + `setMixSpectrum`
     remain available for the generated-grid flow (see grid-crop.js). */
})();
