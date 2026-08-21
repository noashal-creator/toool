/* ─────────────────────────────────────────────────────────────────────
   mix-live.js — TOOOL LIVE: the real generation pipeline (live.html only).

   Replaces mix-modal.js in the live variant. On MIX it sends the user's
   two uploads to the server proxy (/.netlify/functions/mix-api), which
   holds the secret keys and forwards to fal (one midpoint image via the
   queue API) and to Claude (the catalogue text, same lengths as the demo
   copy). The existing ~30s stir animation in app.js doubles as the
   loading screen; app.js calls window.openMixWindow() when it finishes,
   exactly as it does for the demo modal.

   States: while fal is still working the window opens with a pulsing
   placeholder + status line; when the result lands it swaps in. If
   anything fails, the demo midpoint (assets/mix/n-03.png) and the fixed
   demo text stand in, with a quiet note — the window is never empty.   */

(() => {
  const API = '/.netlify/functions/mix-api';
  const POLL_MS = 1200;                    /* tight poll — catch the result the moment it lands */
  const MAX_POLLS = 125;                   /* ~2.5 min ceiling, then fallback */

  const win     = document.getElementById('mixwin');
  const big     = document.getElementById('mixwin-big');
  const status  = document.getElementById('mixwin-status');
  const dlBtn   = document.getElementById('mixwin-dl');
  const xBtn    = document.getElementById('mixwin-x');
  const title   = win?.querySelector('.mixwin__title');
  const kind    = win?.querySelector('.mixwin__kind .u');
  const desc    = win?.querySelector('.mixwin__desc');
  const sizeEl  = document.getElementById('mixwin-size');
  const weightEl = document.getElementById('mixwin-weight');
  const runBtn  = document.getElementById('run');
  if (!win || !big || !runBtn) return;

  const FALLBACK_IMG = 'assets/mix/n-03.png';
  /* the article text is generated LIVE per creature: mix-api's `describe`
     action shows the finished image to Claude vision, which writes a name,
     kind, description and specs that fit THIS specimen (same boxes and
     lengths as the demo copy). No pre-written pool — the text always
     matches the image. If describe fails, the demo copy stands in. */

  /* one generation per MIX press */
  const gen = {
    running: false,
    done: false,
    failed: false,
    imgSrc: null,       /* data-URL of the 4:3-cropped result (or fal URL) */
    dlSrc: null,        /* what DOWNLOAD saves */
    text: null,         /* {name, kind, desc, size, weight} */
  };

  /* ── helpers ── */

  const api = async (payload) => {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('api ' + r.status));
    return data;
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const loadImg = (src, cors) => new Promise((res, rej) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image load failed: ' + src.slice(0, 60)));
    im.src = src;
  });

  /* downscale an upload to ≤1024px and return a JPEG data-URL (small enough
     for the function's request-body limit; fal accepts data URIs) */
  async function shrink(src) {
    const im = await loadImg(src);
    const k = Math.min(1, 800 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k);
    c.height = Math.round(im.naturalHeight * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  /* the photo is used EXACTLY as fal returned it — uncut (user decision).
     The display fills the whole card with object-fit: cover (live.css);
     the prompt keeps the specimen centered with wide margins so nothing
     of it is ever trimmed. */

  /* ── the pipeline (starts on MIX, races the ~30s stir animation) ── */

  async function generate() {
    /* getAttribute, not .src — an empty src attribute resolves to the page URL */
    const a = document.querySelector('#slot-a .slot__preview')?.getAttribute('src');
    const b = document.querySelector('#slot-b .slot__preview')?.getAttribute('src');
    if (!a || !b) return;                 /* app.js already scolds the user */
    if (gen.running) return;
    gen.running = true; gen.done = false; gen.failed = false;
    gen.imgSrc = null; gen.dlSrc = null; gen.text = null;

    try {
      const [ua, ub] = await Promise.all([shrink(a), shrink(b)]);
      const sub = await api({ action: 'submit', image_urls: [ua, ub] });
      const id = sub.request_id;
      if (!id) throw new Error('no request_id from fal');

      let resultUrl = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        const st = await api({ action: 'status', request_id: id });
        if (st.status === 'COMPLETED') {
          const out = await api({ action: 'result', request_id: id });
          resultUrl = out?.images?.[0]?.url || out?.response?.images?.[0]?.url;
          break;
        }
        if (st.status === 'FAILED' || st.status === 'CANCELLED')
          throw new Error('generation ' + st.status.toLowerCase());
      }
      if (!resultUrl) throw new Error('generation timed out');

      /* pre-load so the window pops with the image already painted */
      await loadImg(resultUrl).catch(() => {});
      gen.imgSrc = resultUrl;              /* uncut, exactly as fal returned it */
      gen.dlSrc = resultUrl;

      /* the text is written BEFORE the mix counts as done, so the bowl keeps
         stirring until the window can open complete — image AND article.
         Its failure must not kill the image, though. */
      try {
        gen.text = await api({ action: 'describe', image_url: resultUrl });
      } catch (e) {
        console.warn('[mix-live] describe failed, keeping demo text:', e.message);
      }

      gen.done = true;
      if (wantOpen) reallyOpen();          /* the stir already ended — pop now */
      else render();                       /* window may already be open */

      /* archive the whole mix (uploads + result + text) — fire and forget,
         a logging failure must never touch the user's experience */
      api({ action: 'archive', a: ua, b: ub, result_url: resultUrl, text: gen.text })
        .then((r) => console.log('[mix-live] archived as', r?.id))
        .catch((e) => console.warn('[mix-live] archive failed:', e.message));
    } catch (e) {
      console.error('[mix-live] generation failed:', e);
      gen.failed = true;
      if (wantOpen) reallyOpen();          /* a parked open still gets its window */
      else render();
    } finally {
      gen.running = false;
    }
  }

  runBtn.addEventListener('click', generate);

  /* ── the window ── */

  function setStatus(msg) {
    if (!status) return;
    if (msg) { status.textContent = msg; status.hidden = false; }
    else status.hidden = true;
  }

  function render() {
    if (!win.classList.contains('is-open')) return;
    if (gen.done && gen.imgSrc) {
      big.src = gen.imgSrc;
      big.classList.remove('is-waiting');
      setStatus('');
      const t = gen.text;
      if (t) {
        /* the article boxes are absolutely positioned per the Figma, so an
           over-long description physically collides with the Size block —
           clamp to the demo copy's footprint at a sentence boundary */
        let d = t.desc;
        if (d && d.length > 190) {
          const cut = d.slice(0, 190);
          const dot = cut.lastIndexOf('.');
          d = dot > 80 ? cut.slice(0, dot + 1) : cut + '…';
        }
        if (t.name && title) title.textContent = t.name;
        if (t.kind && kind) kind.textContent = t.kind;
        if (d && desc) desc.textContent = d;
        if (t.size && sizeEl) sizeEl.textContent = t.size;
        if (t.weight && weightEl) weightEl.textContent = t.weight;
      }
    } else if (gen.failed) {
      big.src = FALLBACK_IMG;
      big.classList.remove('is-waiting');
      setStatus('The archive could not develop this specimen — showing a reference print.');
    } else if (gen.running) {
      big.src = FALLBACK_IMG;
      big.classList.add('is-waiting');
      setStatus('The specimen is still developing…');
    }
  }

  /* The window NEVER pops mid-generation: if the result isn't in yet, the
     open request is parked and honoured the moment the image lands (or the
     run fails and the fallback is ready). No waiting screen. */
  let wantOpen = false;

  /* ── the card flies OUT OF THE BOWL (ported verbatim from mix-modal.js) ──
     Sets --dx/--dy/--sc so card-fly-smooth (styles.css) starts the card
     inside the bowl's liquid, and raises a cloned bowl "curtain" above the
     modal layer so the card genuinely emerges from it. Narrow viewports
     (and pages with no bowl, like the test bench) skip it — styles.css
     falls back to the plain pop there. */
  const FLIGHT_MS = 1150;                  // must match card-fly-smooth in styles.css
  const narrow = () => window.matchMedia('(max-width: 860px)').matches;
  let curtain = null, curtainTimer = 0;

  function dropCurtain() {
    clearTimeout(curtainTimer);
    curtain?.remove();
    curtain = null;
  }

  function launchFromBowl(card) {
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

  function reallyOpen() {
    wantOpen = false;
    win.hidden = false;
    win.classList.add('is-open');
    render();                                /* content first, then the flight */
    const card = win.querySelector('.mixwin__card');
    if (card) {
      /* re-trigger the animation each time, then aim it at the bowl */
      card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      launchFromBowl(card);
      card.focus({ preventScroll: true });
    }
  }
  function open() {
    if (gen.running && !gen.done && !gen.failed) { wantOpen = true; return; }
    reallyOpen();
  }
  function close() {
    dropCurtain();               /* never leave a stale bowl copy over the page */
    win.classList.remove('is-open');
    win.hidden = true;
  }
  window.openMixWindow = open;            /* app.js calls this after the stir */
  /* app.js gates the end of the stir on this: keep churning while the real
     generation is still cooking; done, failed, or never-started all count as
     "ready" so the choreography can always land. */
  window.mixLiveReady = () => !gen.running || gen.done || gen.failed;

  xBtn?.addEventListener('click', close);
  win.addEventListener('click', (e) => { if (e.target === win) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && win.classList.contains('is-open')) close();
  });

  dlBtn?.addEventListener('click', async () => {
    const src = gen.dlSrc || big.src;
    try {
      /* cross-origin URLs ignore the download attribute — pull the bytes
         first so the browser saves a file instead of navigating */
      const blob = await (await fetch(src)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'toool-midpoint.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      window.open(src, '_blank');          /* last resort: open the image */
    }
  });
})();
