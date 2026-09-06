/* ─────────────────────────────────────────────────────────────────────
   chag-pick.js — the opening picker of the holiday variation.

   Renders the 8 symbol squares from CHAG_SYMBOLS into #chag-picker, lets
   the user pick exactly TWO ("match"), and then feeds those two images
   into the site's hidden upload slots via window.recFillSlot(key, url) —
   the very hook recording mode uses, which loads an image into a slot
   exactly like a real upload and resolves once it has decoded.

   From that point the site is untouched: the bowl churns the two symbol
   images and app.js runs its normal ~30s stir. The chosen pair is written
   to window.chagPair (canonical sorted key) so chag-live.js can look up
   the pre-prepared result.

   Picking rules: click to select, click again to deselect; when two are
   already chosen, a third pick replaces the OLDEST so it always reads as
   "these two". MIX stays inert until two are chosen.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const host   = document.getElementById('chag-picker');
  const runBtn = document.getElementById('run');
  const syms   = window.CHAG_SYMBOLS || [];
  if (!host || !syms.length) return;

  const keyOf = (a, b) => [a, b].sort().join('+');
  const byId  = (id) => syms.find((s) => s.id === id);

  /* The grid is CHAG_GRID — an ordered list of symbol ids where a symbol may
     appear MORE THAN ONCE (the Figma frame repeats the fish). So selection is
     tracked by TILE INDEX, not by symbol id; the symbol is looked up per tile. */
  const grid = (window.CHAG_GRID && window.CHAG_GRID.length)
    ? window.CHAG_GRID
    : syms.map((s) => s.id);

  let picked = [];                 // TILE indices, in the order chosen (max 2)
  const tiles = [];                // tile index → button element
  const slotOf = ['a', 'b'];       // pick #0 → yellow window a, pick #1 → window b
  const inSlot = { a: null, b: null };   // which TILE index currently fills each window
  const slotToken = { a: 0, b: 0 };      // bumped on each change, to drop stale async fills

  /* the sidebar labels are STATIC design text (Figma 3344:710) — snapshot them
     at startup so they can be put back whenever app.js overwrites them */
  const labelHTML = {
    a: document.querySelector('#slot-a .slot__label')?.innerHTML,
    b: document.querySelector('#slot-b .slot__label')?.innerHTML,
  };
  const restoreLabel = (slot) => {
    const el = document.querySelector('#slot-' + slot + ' .slot__label');
    if (el && labelHTML[slot]) el.innerHTML = labelHTML[slot];
  };

  /* ── build the tiles, exactly in the grid's order ── */
  grid.forEach((id, i) => {
    const s = byId(id);
    if (!s) return;
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'chag-tile';
    t.dataset.id = s.id;
    t.dataset.tile = i;
    t.setAttribute('aria-pressed', 'false');
    t.setAttribute('aria-label', s.label);
    t.innerHTML =
      '<span class="chag-tile__pick" aria-hidden="true"></span>' +
      '<img class="chag-tile__img" src="' + s.img + '" alt="">' +
      '<span class="chag-tile__label">' + s.label + '</span>';
    t.addEventListener('click', () => toggle(i));
    host.appendChild(t);
    tiles[i] = t;
  });

  /* ── selection (by tile index) ── */
  function toggle(i) {
    const at = picked.indexOf(i);
    if (at !== -1) {
      picked.splice(at, 1);              // deselect
    } else if (picked.length < 2) {
      picked.push(i);
    } else {
      picked.shift();                    // drop the oldest, keep it to two
      picked.push(i);
    }
    reflect();
  }

  function reflect() {
    // grid tiles: light selection mark (the real feedback is the symbol landing
    // in the yellow window), plus the pick number
    tiles.forEach((el, i) => {
      if (!el) return;
      const at = picked.indexOf(i);
      const on = at !== -1;
      el.classList.toggle('is-picked', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.querySelector('.chag-tile__pick').textContent = on ? String(at + 1) : '';
    });

    // the two yellow windows mirror the picks, IN ORDER: pick #0 → window a,
    // pick #1 → window b. Fill/clear each only when its occupant changes, so a
    // symbol that stays put is never reloaded.
    //
    // recFillSlot is ASYNC (it fetches + decodes), so a rapid change to the same
    // window can let a stale fill resolve AFTER a newer clear and leave the wrong
    // symbol stuck. A per-window token guards that: when a fill resolves, if the
    // token moved on, reconcile the window to its CURRENT desired tile.
    slotOf.forEach((slot, i) => {
      const want = picked.length > i ? picked[i] : null;   // tile index (0 is valid!)
      if (want === inSlot[slot]) return;
      inSlot[slot] = want;
      const tok = ++slotToken[slot];
      if (want !== null) {
        const img = byId(grid[want]).img;
        Promise.resolve(window.recFillSlot && window.recFillSlot(slot, img))
          .then(() => {
            /* app.js's load() writes the FILENAME into the slot label; in this
               variation the label is the Figma's static "LET'S MAKE SOMETHING"
               text, so put it back after every fill. */
            restoreLabel(slot);
            if (tok === slotToken[slot]) return;      // still current — done
            const desired = picked.length > slotOf.indexOf(slot) ? picked[slotOf.indexOf(slot)] : null;
            if (desired === null) window.recClearSlot && window.recClearSlot(slot);
            else if (desired !== want) { inSlot[slot] = null; reflect(); }
          });
      } else {
        window.recClearSlot && window.recClearSlot(slot);
        restoreLabel(slot);
      }
    });

    /* the visible feedback: the picked symbols appear IN THE BOWL (the sidebar
       shows no preview box — .chag-bowl-picks sits in the bowl's opening) */
    const bowlA = document.querySelector('.chag-bowl-picks__a');
    const bowlB = document.querySelector('.chag-bowl-picks__b');
    [bowlA, bowlB].forEach((im, i) => {
      if (!im) return;
      const tile = picked.length > i ? picked[i] : null;
      if (tile === null) im.removeAttribute('src');
      else im.src = byId(grid[tile]).img;
    });

    const ready = picked.length === 2;
    document.documentElement.classList.toggle('chag-ready', ready);
    if (runBtn) runBtn.classList.toggle('is-disabled', !ready);
    window.chagPair = ready ? keyOf(grid[picked[0]], grid[picked[1]]) : null;

    /* an empty selection ends the round — the next picks may appear again */
    if (!picked.length) document.documentElement.classList.remove('chag-mixing');
  }

  /* MIX is inert until two are chosen. Capture phase so this runs before
     app.js's own click handler and can stop the stir from starting. */
  if (runBtn) {
    runBtn.addEventListener('click', (e) => {
      if (picked.length !== 2) {
        e.stopImmediatePropagation();
        e.preventDefault();
        host.classList.remove('chag-nudge');
        void host.offsetWidth;
        host.classList.add('chag-nudge');
        return;
      }
      /* the round begins: the ingredients dive into the bowl and stay gone
         until the selection resets (chag.css keys their hiding on this) */
      document.documentElement.classList.add('chag-mixing');
    }, true);
  }

  reflect();   // start disabled

  /* The result window drives two different resets.

     On OPEN the picked cells go back to WHITE — the round is over, the answer
     is on screen, and leaving two cells burning red behind the card reads as
     if something is still selected. This is a LOOK-ONLY reset: `picked` and
     window.chagPair stay exactly as they are, because chag-live.js reads
     chagPair at that very moment to choose the card's QR.

     On CLOSE the round really ends — app.js clears the slots and drains the
     bowl, and the selection has to go with them or the old picks pop back
     onto the bowl's rim. */
  const mixwin = document.getElementById('mixwin');
  if (mixwin) {
    new MutationObserver(() => {
      if (mixwin.classList.contains('is-open')) {
        tiles.forEach((el) => {
          if (!el) return;
          el.classList.remove('is-picked');
          el.setAttribute('aria-pressed', 'false');
        });
        return;
      }
      if (!picked.length) return;
      picked = [];
      reflect();
    }).observe(mixwin, { attributes: true, attributeFilter: ['class'] });
  }
})();
