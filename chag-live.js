/* ─────────────────────────────────────────────────────────────────────
   chag-live.js — the holiday variation's result source (chag.html only).

   TWO MODES, chosen by URL:
     chag.html        → PRE-PREPARED: the result for the chosen pair comes
                        from CHAG_RESULTS (chag-data.js), keyed by
                        window.chagPair. No network.
     chag.html?live   → LIVE: the two picked symbol images go through the
                        SAME fal pipeline as the main site (the shared
                        serverless proxy /.netlify/functions/mix-api —
                        untouched; nothing in the main site changes).
                        Falls back to the pair's prepared result (or the
                        demo image) if the generation fails.

   Either way it exposes the exact interface app.js drives:
     window.mixLiveReady()  — app.js keeps the bowl churning until true.
     window.openMixWindow() — called after the stir; fills the window and
                              flies the card out of the bowl.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const win      = document.getElementById('mixwin');
  const big      = document.getElementById('mixwin-big');
  const status   = document.getElementById('mixwin-status');
  const dlBtn    = document.getElementById('mixwin-dl');
  const xBtn     = document.getElementById('mixwin-x');
  const title    = win?.querySelector('.mixwin__title');
  const kind     = win?.querySelector('.mixwin__kind .u');
  const desc     = win?.querySelector('.mixwin__desc');
  const sizeEl   = document.getElementById('mixwin-size');
  const weightEl = document.getElementById('mixwin-weight');
  const qrImg    = document.getElementById('mixwin-qr');
  const runBtn   = document.getElementById('run');
  if (!win || !big || !runBtn) return;

  /* three letters per symbol → the 6-letter code the card's QR encodes and
     /k?p= resolves. Kept STABLE on purpose: a card already sent stays valid
     even if the symbol set is ever reordered, which an index would not. */
  const SYM_CODE = { dvash:'dva', tapuach:'tap', keves:'kev', gezer:'gez',
                     dag:'dag', kara:'kar', tamar:'tam', rimon:'rim' };
  const pairCode = (pair) => {
    const [a, b] = (pair || '').split('+');
    return (SYM_CODE[a] && SYM_CODE[b]) ? SYM_CODE[a] + SYM_CODE[b] : null;
  };

  const LIVE = new URLSearchParams(location.search).has('live');
  const API = '/.netlify/functions/mix-api';
  const POLL_MS = 1200;
  const MAX_POLLS = 125;                   /* ~2.5 min ceiling, then fallback */
  const FALLBACK_IMG = 'assets/mix/n-03.png';

  /* one result per MIX press */
  const res = { running: false, done: false, rec: null, img: null, dl: null, text: null };

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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const loadImg = (src, quiet) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(src);
    im.onerror = () => quiet ? resolve(FALLBACK_IMG) : reject(new Error('image load failed'));
    im.src = src;
  });

  /* downscale a symbol image to ≤800px JPEG data-URI (the same prep the main
     site gives uploads before fal) */
  async function shrink(src) {
    const im = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
    const k = Math.min(1, 800 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k);
    c.height = Math.round(im.naturalHeight * k);
    const ctx = c.getContext('2d');
    /* the symbols are transparent PNGs — fal wants photos, so flatten to white */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  const pairRec = () =>
    (window.CHAG_RESULTS && window.chagPair && window.CHAG_RESULTS[window.chagPair]) || null;

  /* ── PRE-PREPARED mode ── */
  async function preparePremade() {
    const rec = pairRec();
    res.rec = rec; res.text = rec;
    res.img = await loadImg((rec && rec.img) || FALLBACK_IMG, true);
    res.dl = res.img;
    if (rec && rec.stir) document.documentElement.style.setProperty('--chag-stir', rec.stir + 'ms');
  }

  /* ── LIVE mode — the main site's fal pipeline, fed by the two symbols ── */
  async function prepareLive() {
    const grid = window.CHAG_GRID || [];
    const syms = window.CHAG_SYMBOLS || [];
    const byId = (id) => syms.find((s) => s.id === id);
    /* chag-pick keeps the picked pair in the slots; read the symbol images
       from the pair key (order-independent, both ids present) */
    const ids = (window.chagPair || '').split('+');
    const a = byId(ids[0]), b = byId(ids[1]);
    if (!a || !b) throw new Error('no pair picked');

    const [ua, ub] = await Promise.all([shrink(a.img), shrink(b.img)]);
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

    await loadImg(resultUrl, true);
    res.img = resultUrl;
    res.dl = resultUrl;

    /* live text, before the mix counts as done — same as the main site */
    try {
      res.text = await api({ action: 'describe', image_url: resultUrl });
    } catch (e) {
      console.warn('[chag-live] describe failed, keeping premade text:', e.message);
      res.text = pairRec();
    }

    /* archive the mix — fire and forget */
    api({ action: 'archive', a: ua, b: ub, result_url: resultUrl, text: res.text })
      .then((r) => console.log('[chag-live] archived as', r?.id))
      .catch((e) => console.warn('[chag-live] archive failed:', e.message));
  }

  async function prepare() {
    if (res.running) return;
    res.running = true; res.done = false;
    res.rec = null; res.img = null; res.dl = null; res.text = null;

    try {
      if (LIVE) {
        try { await prepareLive(); }
        catch (e) {
          console.error('[chag-live] live generation failed, falling back to premade:', e);
          await preparePremade();
        }
      } else {
        await preparePremade();
      }
    } finally {
      res.done = true;
      res.running = false;
      if (wantOpen) reallyOpen();
      else render();
    }
  }

  runBtn.addEventListener('click', () => {
    /* chag-pick.js blocks this click (capture) until two are picked */
    prepare();
  });

  /* app.js gates the end of the stir on this */
  window.mixLiveReady = () => !res.running || res.done;

  /* ── the window ── */

  function setStatus(msg) {
    if (!status) return;
    if (msg) { status.textContent = msg; status.hidden = false; }
    else status.hidden = true;
  }

  function render() {
    if (!win.classList.contains('is-open')) return;
    big.src = res.img || FALLBACK_IMG;
    /* the card's QR is this pair's own code, pointing at the keep & send page */
    if (qrImg && window.chagPair && pairCode(window.chagPair)) {
      qrImg.src = 'assets/chag/card/qr/' + window.chagPair + '.png';
    }
    big.classList.remove('is-waiting');
    setStatus('');
    const t = res.text;
    if (t) {
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
  }

  /* ── the card flies OUT OF THE BOWL (ported verbatim from mix-live.js) ── */
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

    card.style.animation = 'none';
    void card.offsetWidth;
    const cardBox = card.getBoundingClientRect();
    const fillBox = fillEl.getBoundingClientRect();
    if (!cardBox.width || !fillBox.width) { card.style.animation = ''; return; }

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
    bowlCopy.classList.add('is-carrying');
    curtain.append(bowlCopy, fillEl.cloneNode(true));
    document.body.appendChild(curtain);
    curtainTimer = setTimeout(dropCurtain, FLIGHT_MS);

    card.style.animation = '';
  }

  let wantOpen = false;

  function reallyOpen() {
    wantOpen = false;
    win.hidden = false;
    win.classList.add('is-open');
    render();
    const card = win.querySelector('.mixwin__card');
    if (card) {
      card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      launchFromBowl(card);
      card.focus({ preventScroll: true });
    }
  }
  function open() {
    if (res.running && !res.done) { wantOpen = true; return; }
    reallyOpen();
  }
  function close() {
    dropCurtain();
    win.classList.remove('is-open');
    win.hidden = true;
  }
  window.openMixWindow = open;

  xBtn?.addEventListener('click', close);
  win.addEventListener('click', (e) => { if (e.target === win) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && win.classList.contains('is-open')) close();
  });

  dlBtn?.addEventListener('click', async () => {
    const src = res.dl || big.src;
    try {
      const blob = await (await fetch(src)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'toool-chag.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      window.open(src, '_blank');
    }
  });
})();
