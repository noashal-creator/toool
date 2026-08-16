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
      if (el.dataset.onMissing === 'remove') el.classList.add('is-empty');
      done();
    };
    img.src = el.dataset.src;
  })));
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
    if (e.clientX < window.innerWidth / 8) prev(); else next();
  });

  window.addEventListener('hashchange', () => show(fromHash(), false));

  show(i);
}

loadDropIns().then(buildDeck);
