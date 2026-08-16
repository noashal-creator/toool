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
  if (!win || !big || !strip) return;

  /* the "large" image shown per spectrum step (index 0–4). Step 03 (the
     midpoint) is the default; large-03 is the richer composed render. */
  // whitespace-trimmed so each object fills the frame → renders large + centred
  const LARGE = [
    'assets/mix/big-01.png',
    'assets/mix/big-02.png',
    'assets/mix/big-03.png',
    'assets/mix/big-04.png',
    'assets/mix/big-05.png',
  ];

  const DEFAULT = 2;           // step 03 is the midpoint — the default result
  let selected = DEFAULT;

  function select(i, animate) {
    if (i < 0 || i >= LARGE.length) return;
    selected = i;
    big.src = LARGE[i];
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
  }

  function close() {
    dropCurtain();               // never leave a stale bowl copy over the page
    win.classList.remove('is-open');
    win.hidden = true;
  }

  /* thumbnail click → swap big image + move highlight */
  strip.addEventListener('click', event => {
    const cell = event.target.closest('.mixwin__cell');
    if (cell) select(Number(cell.dataset.i), true);
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

  /* Prepared-grid mode: if assets/mix/grid.png exists, slice it into the five
     pieces automatically and show them already-cut — the user just sees the
     ready window (no button, no upload). To change the result, replace that one
     grid image (made in Figma or ChatGPT). If it's absent, the built-in fixed
     assets above are kept. */
  if (window.loadGridImage) {
    window.loadGridImage('assets/mix/grid.png', LARGE.length)
      .then(setSpectrum)
      .catch(() => { /* no/failed grid → keep the built-in demo assets */ });
  }
})();
