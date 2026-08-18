/* ─────────────────────────────────────────────────────────────────────
   TOOOL — WPA 2026 deck: navigation only.
   One slide carries .is-active at a time; everything else is display:none
   (see deck.css). No library, no build step — same as the rest of the site.
   ───────────────────────────────────────────────────────────────────── */

/* ── drop-in images ────────────────────────────────────────────────────
   Anything with data-src points at a file in assets/deck/ that may not exist
   yet: the memes, and the six inspiration frames. Try to load each one.

   A meme that isn't there is marked .is-empty: while you are working it shows
   as a labelled dashed frame so you can see where it will land, and in
   FULLSCREEN it disappears (see deck.css) — so nothing empty ever reaches the
   projector, but nothing is invisible while you are still filling the deck.
   An inspiration frame that isn't there KEEPS its dashed placeholder, because
   that board is meant to read as six frames waiting to be filled.

   Runs before the deck is built so nothing pops in after the first paint. */
function loadDropIns() {
  const targets = Array.from(document.querySelectorAll('[data-src]'));
  if (!targets.length) return Promise.resolve();

  return Promise.all(targets.map(el => new Promise(done => {
    const img = new Image();
    img.alt = '';
    img.onload = () => {
      el.textContent = '';        /* clear the placeholder label, if any */
      el.appendChild(img);
      done();
    };
    img.onerror = () => {
      el.classList.add('is-empty');   /* each component styles this its own way */
      done();
    };
    img.src = el.dataset.src;
  })));
}

/* A justified moodboard: whatever loaded is packed into rows, every picture at
   its true proportion, each row scaled so it fills the 1848-unit column exactly
   — the layout newspapers and photo galleries use. Nothing is cropped and no
   size is hardcoded: swap the references for any shapes or counts and it
   re-solves itself. Empty cells are dropped before packing. */
function fitBoard() {
  /* there is more than one board now — the welded references and the graphic
     ones live on separate slides, and each packs itself */
  document.querySelectorAll('.board').forEach(layOutBoard);
  registerLiveBoards();
}

/* ── living boards ───────────────────────────────────────────────────────
   A board marked data-live keeps its layout but swaps what is IN each frame,
   each frame on its own beat — so the wall reads like a row of GIFs rather
   than a fixed collage. The pool is the board's own pictures, so dropping more
   cells in grows it with no other change.

   The boxes stay put and the images `cover` them: with the pool holding mixed
   proportions, re-solving the collage on every swap would make the whole wall
   twitch. Fixed frames, moving contents. */
const liveBoards = [];
let boardTimers = [];

function registerLiveBoards() {
  liveBoards.length = 0;
  document.querySelectorAll('.board[data-live]').forEach(board => {
    const cells = Array.from(board.querySelectorAll('.board__cell'));
    const pool = cells
      .map(c => { const i = c.querySelector('img'); return i ? i.getAttribute('src') : null; })
      .filter(Boolean);
    if (pool.length < 2) return;
    cells.forEach(c => { const i = c.querySelector('img'); if (i) i.style.objectFit = 'cover'; });
    liveBoards.push({ cells, pool });
  });
}

function runBoards(slide) {
  boardTimers.forEach(clearInterval);
  boardTimers.forEach(clearTimeout);
  boardTimers = [];

  liveBoards.forEach(b => {
    if (!slide.contains(b.cells[0])) return;

    /* The whole wall rotates by one on each beat, ALL frames at the same instant.
       A rotation is a permutation, so every frame always holds a different
       picture. Staggering the frames was the obvious idea and it is wrong: while
       the cascade is running, one frame sits on rot and its neighbour on rot+1,
       and those two indices collide — the wall briefly shows the same picture
       twice. Measured it happening, so: no stagger. */
    let rot = 0;
    const PERIOD = 1600;
    boardTimers.push(setInterval(() => {
      rot++;
      b.cells.forEach((cell, ci) => {
        const img = cell.querySelector('img');
        if (img) img.src = b.pool[(ci + rot) % b.pool.length];
      });
    }, PERIOD));
  });
}

function layOutBoard(board) {
  board.querySelectorAll('.board__cell.is-empty').forEach(c => c.remove());
  const cells = Array.from(board.querySelectorAll('.board__cell'));
  board.dataset.n = cells.length;
  if (!cells.length) return;

  const COL = 1848, GAP = 24, TOP = 200, BOTTOM = 1000;
  const AVAIL = BOTTOM - TOP;

  const ratios = cells.map(c => {
    const img = c.querySelector('img');
    const r = img && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    c.style.aspectRatio = r.toFixed(4);   // width follows from its row's height
    return r;
  });

  /* A pinned board: the references are laid ON TOP of each other, tilted, the
     way things get stuck to a wall — not a tidy grid. Positions come from a
     fixed lattice with a SEEDED jitter, so the arrangement is deliberate and
     identical on every reload (a fresh Math.random would reshuffle the slide
     mid-talk). Each picture is oversized against its lattice cell, which is
     what produces the overlap. */
  /* 4 columns only pays off past six pictures; with five it leaves a lopsided
     4+1, where three columns give a balanced 3+2 */
  const COLS = cells.length <= 6 ? 3 : 4;
  const ROWS = Math.ceil(cells.length / COLS);
  const cellW = COL / COLS, cellH = AVAIL / ROWS;
  const OVER = 1.34;                       // how far each picture outgrows its cell
  const TILT = [-5.5, 3.5, -2.5, 6, -4, 2, -6.5, 4.5, -3, 5];

  let seed = 20260817;                     // fixed: same board every time
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  board.style.position = 'absolute';
  board.style.top = 'calc(' + TOP + ' * var(--s))';
  board.style.height = 'calc(' + AVAIL + ' * var(--s))';
  board.style.display = 'block';

  cells.forEach((c, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const r = ratios[i];

    /* fit inside an oversized cell, then let it hang over the neighbours */
    const boxW = cellW * OVER, boxH = cellH * OVER;
    let w = boxW, h = w / r;
    if (h > boxH) { h = boxH; w = h * r; }

    const jx = (rand() - 0.5) * cellW * 0.30;
    const jy = (rand() - 0.5) * cellH * 0.26;

    /* Clamped into the board's own area. The boxes are deliberately bigger than
       their cells, which is what makes them overlap each other — but without a
       clamp the top row rides up over the title. Clamping the block's outer
       edges costs nothing: neighbours still overlap, because each box is wider
       than the cell it is centred in. */
    const clamp = (v, max) => Math.max(0, Math.min(v, max));
    const x = clamp(col * cellW + (cellW - w) / 2 + jx, COL - w);
    const y = clamp(row * cellH + (cellH - h) / 2 + jy, AVAIL - h);

    c.style.position = 'absolute';
    c.style.aspectRatio = '';
    c.style.left   = 'calc(' + x.toFixed(1) + ' * var(--s))';
    c.style.top    = 'calc(' + y.toFixed(1) + ' * var(--s))';
    c.style.width  = 'calc(' + w.toFixed(1) + ' * var(--s))';
    c.style.height = 'calc(' + h.toFixed(1) + ' * var(--s))';
    c.style.transform = 'rotate(' + TILT[i % TILT.length] + 'deg)';
    c.style.zIndex = String(i + 1);        // later ones sit on top
  });
}

function buildDeck() {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const total  = slides.length;
  const pad    = n => String(n).padStart(2, '0');

  /* the hash is the slide number (1-based) so a refresh mid-talk lands you
     back where you were instead of at the cover */
  const fromHash = () => {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isInteger(n) && n >= 1 && n <= total ? n - 1 : 0;
  };

  let i = fromHash();

    /* ── the live wordmark ──────────────────────────────────────────────
     The letters swap typeface on their own beats, exactly as on the site's
     banner. buildMetrics / apply / balance are lifted VERBATIM from logo.js
     — that is where the hard-won part lives: x-height normalisation (mixing
     faces at one size looks ragged without it) and composing each pose as a
     SET so the word never visibly grows or shrinks.

     Deliberately NOT ported: the open choreography, the scroll-scrubbed close
     and the corner flight. All three are driven by scroll position, and the
     deck never scrolls — dragging them in would be dead code with live bugs.

     The typefaces are the locally installed ABC Dinamo trials, same as the
     site: on a machine without them every letter falls back to Helvetica and
     the mark simply stops changing. */
  const LOGO_FONTS = ['"ABC Helveesti Spikes Trial"','"ABC Helveesti Trial"','"ABC Gravity Trial"',
    '"ABC Gravity Wide Trial"','"ABC Gravity Expanded Trial"','"ABC Gravity Compressed Trial"',
    '"ABC Gravity Extra Condensed Trial"','"ABC Ginto Nord Trial"','"ABC Ginto Condensed Trial"',
    '"ABC Ginto Rounded Nord Trial"','"ABC Arizona Serif Trial"','"ABC Arizona Flare Trial"',
    '"ABC Arizona Mix Trial"','"ABC Gramercy Display Trial"','"ABC Gramercy Fine Trial"',
    '"ABC Diatype Extended Trial"','"ABC Diatype Compressed Trial"','"ABC Diatype Rounded Trial"',
    '"ABC Favorit Expanded Trial"','"ABC Favorit Compressed Trial"','"ABC Camera Rounded Trial"',
    '"ABC Ikarus Contrast Trial"','"ABC Ikarus Flair Trial"','"ABC Daily Slab Trial"',
    '"ABC Daily Scotch Trial"','"ABC Estragon Trial"','"ABC Asfalt Expanded Trial"',
    '"ABC Bingo Trial"','"ABC Cowboy Trial"','"ABC Honeymoon Trial"','"ABC Bubblegum Trial"'];
  const LOGO_WEIGHTS = ['200','300','400','500','700','800','900'];
  const XH = 0.52, MAX_H = 0.80, TARGET = 3.15, TOL = 0.12;

  const logoEl = document.getElementById('deck-logo');
  const letters = logoEl ? Array.from(logoEl.children) : [];
  const CAND = {};
  let logoTimers = [];

  const pick = a => a[Math.floor(Math.random() * a.length)];
  const cx = document.createElement('canvas').getContext('2d');

  function buildMetrics() {
    for (const ch of 'tol') {
      const list = [];
      for (const fam of LOGO_FONTS) for (const w of LOGO_WEIGHTS) for (const st of ['normal', 'italic']) {
        cx.font = `${st} ${w} 200px ${fam}`;
        const mo = cx.measureText('o');
        const xh = (mo.actualBoundingBoxAscent + mo.actualBoundingBoxDescent) / 200;
        if (!(xh > 0.05)) continue;
        const sizeEm = XH / xh;
        const m = cx.measureText(ch);
        const ascR = m.actualBoundingBoxAscent / 200, descR = m.actualBoundingBoxDescent / 200;
        if ((ascR + descR) * sizeEm > MAX_H) continue;
        list.push({ fam, w, st, sizeEm, adv: (m.width / 200) * sizeEm });
      }
      CAND[ch] = list;
    }
  }

  function apply(el, p) {
    el.style.fontFamily = p.fam + ', "Helvetica Neue", sans-serif';
    el.style.fontWeight = p.w;
    el.style.fontStyle  = p.st;
    el.style.fontSize   = p.sizeEm.toFixed(3) + 'em';
  }

  /* compose the pose as a SET so the word never grows or shrinks */
  function balance(chars, p) {
    for (let i = 0; i < 24; i++) {
      const t = p.reduce((s, x) => s + x.adv, 0);
      if (Math.abs(t - TARGET) <= TOL) break;
      const wider = t < TARGET;
      const j = p.reduce((m, x, k) => (wider ? x.adv < p[m].adv : x.adv > p[m].adv) ? k : m, 0);
      let best = p[j];
      for (let a = 0; a < 8; a++) { const c = pick(CAND[chars[j]]); if (wider ? c.adv > best.adv : c.adv < best.adv) best = c; }
      p[j] = best;
    }
    return p;
  }

  const CHARS = 'toool'.split('');
  function swapAll() {
    if (!letters.length || !CAND.t || !CAND.t.length) return;
    const pose = balance(CHARS, CHARS.map(ch => pick(CAND[ch])));
    pose.forEach((p, i) => apply(letters[i], p));
  }

  /* one beat per letter, each on its own tempo — that irregularity is what
     makes it read as running rather than blinking in unison */
  function runLogo(slide) {
    logoTimers.forEach(clearInterval);
    logoTimers = [];
    if (!logoEl || !slide.contains(logoEl)) return;
    if (!CAND.t) buildMetrics();
    swapAll();
    letters.forEach((el, i) => {
      const beat = 110 + i * 40 + Math.floor(Math.random() * 90);
      logoTimers.push(setInterval(() => {
        const p = balance(CHARS, CHARS.map(ch => pick(CAND[ch])));
        apply(el, p[i]);
      }, beat));
    });
  }

/* ── frame loops ────────────────────────────────────────────────────
     <div class="gif" data-frames="a.png,b.png" data-fps="6" data-mode="pingpong">
     Frames are stacked in CSS; this flips which one is visible. Only the
     loops on the visible slide tick, so a 12-slide deck never runs eleven
     animations it isn't showing. */
  const gifs = Array.from(document.querySelectorAll('.gif')).map(el => {
    const frames = el.dataset.frames.split(',').map(s => s.trim()).filter(Boolean);
    el.textContent = '';
    frames.forEach((src, n) => {
      const img = new Image();
      img.src = src;
      img.alt = '';
      if (n === 0) img.className = 'is-on';
      el.appendChild(img);
    });
    return {
      el,
      imgs: Array.from(el.children),
      fps:  parseFloat(el.dataset.fps) || 6,
      ping: el.dataset.mode !== 'loop',   /* default: bounce A→B→A */
      at: 0, dir: 1, timer: null
    };
  });

  function step(g) {
    g.imgs[g.at].classList.remove('is-on');
    g.at += g.dir;
    if (g.ping) {
      /* turn around ON the end frame, so A and B each get one beat and the
         middle frames aren't shown twice as often */
      if (g.at >= g.imgs.length - 1) { g.at = g.imgs.length - 1; g.dir = -1; }
      else if (g.at <= 0)            { g.at = 0;                 g.dir =  1; }
    } else if (g.at >= g.imgs.length) {
      g.at = 0;
    }
    g.imgs[g.at].classList.add('is-on');
  }

  function runGifs(slide) {
    gifs.forEach(g => {
      clearInterval(g.timer);
      g.timer = null;
      if (slide.contains(g.el)) {
        g.timer = setInterval(() => step(g), 1000 / g.fps);
      }
    });
  }

  function show(next, pushHash) {
    i = Math.max(0, Math.min(total - 1, next));
    slides.forEach((s, n) => s.classList.toggle('is-active', n === i));
    runGifs(slides[i]);
    runLogo(slides[i]);
    runBoards(slides[i]);

    /* the counter lives in every footer, so update them all */
    document.querySelectorAll('.footer__count')
      .forEach(el => { el.textContent = pad(i + 1) + ' / ' + pad(total); });

    if (pushHash !== false) {
      const want = '#' + (i + 1);
      if (location.hash !== want) history.replaceState(null, '', want);
    }
  }

  const next = () => show(i + 1);
  const prev = () => show(i - 1);

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft':  case 'PageUp':            e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); show(0); break;
      case 'End':  e.preventDefault(); show(total - 1); break;
      case 'f': case 'F':
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
    }
  });

  /* click anywhere advances; click on the left eighth goes back, so the deck
     is drivable with a presenter remote or a trackpad alone */
  document.addEventListener('click', e => {
    if (e.target.closest('a')) return;      /* let the link slide's url be clicked */
    if (e.clientX < window.innerWidth / 8) prev(); else next();
  });

  window.addEventListener('hashchange', () => show(fromHash(), false));

  show(i);
}

loadDropIns().then(fitBoard).then(buildDeck);
