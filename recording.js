/* ─────────────────────────────────────────────────────────────────────
   recording.js — a scripted, cursor-less product demo for screen capture

   Opened with ?rec, the tool enters a clean "stage" mode: every floating
   control and the OS cursor are hidden, the reel is switched on and seated on
   the first game, and a soft finger waits off-screen. Pressing Space (or R)
   plays a single ~22s choreography that drives the real tool — no fake UI:

     · a finger glides in carrying object A and drags it into slot 1,
     · then object B into slot 2 (the real slots fill, via app.js),
     · taps MIX (the real bowl starts churning + filling),
     · the finger exits and the sideways reel tours every game,
     · the spoon lifts and the result window flies out of the bowl. Hold.

   Nothing here changes normal browsing: without ?rec the file is inert, and the
   hooks it uses (window.recFillSlot / recStir / recLift, window.reelMode.*) are
   additive shims exposed by app.js and sideways.js. Motion is all eased
   (smootherstep) per the site's own "handed over, never snapped" feel.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has('rec')) return;

  const A_URL = 'assets/object-a.jpg';
  const B_URL = 'assets/object-b.jpg';

  const body = document.body;
  body.classList.add('recording');
  // silence the CTA nudge (it only bobs until a mix has run) and start clean
  document.documentElement.classList.add('has-mixed');
  try { window.recResetSlots?.(); } catch (e) {}

  // switch on the sideways reel and seat it on the first game
  try { window.reelMode?.enable?.(); } catch (e) {}
  try { window.reelMode?.go?.(0); } catch (e) {}

  // preload the two objects so the carried thumbnail never flashes empty
  [A_URL, B_URL].forEach(u => { const im = new Image(); im.src = u; });

  // ── the finger + the "held" thumbnail ──
  // wrapper is what we animate; the inner <img> is mirrored (CSS) so the
  // photographic hand points left toward the slots
  const finger = document.createElement('div');
  finger.className = 'rec-finger';
  const fingerImg = document.createElement('img');
  fingerImg.className = 'rec-finger__img';
  fingerImg.src = 'assets/hand-point.png';
  fingerImg.alt = '';
  finger.appendChild(fingerImg);
  const carry = document.createElement('img');
  carry.className = 'rec-carry';
  carry.alt = '';
  body.append(finger, carry);

  // where the fingertip sits inside the (mirrored) hand image — measured once it
  // has a rendered size; the tip is the left edge, ~0.356 of the way down
  let TIP_X = 2, TIP_Y = 22;
  function measureTip() {
    const w = fingerImg.offsetWidth, h = fingerImg.offsetHeight;
    if (w && h) {
      TIP_X = Math.round(w * 0.006); TIP_Y = Math.round(h * 0.356);
      finger.style.transformOrigin = TIP_X + 'px ' + TIP_Y + 'px';  // tap dips from the tip
    }
  }
  if (fingerImg.complete) measureTip(); else fingerImg.addEventListener('load', measureTip);
  // how the carried thumb is "pinched" relative to the fingertip
  const CARRY_DX = 26, CARRY_DY = 30, CARRY_HALF = 48;

  const tip = { x: 0, y: 0 };
  let fScale = 1, carrying = false, cScale = 1;

  function place() {
    finger.style.transform =
      `translate3d(${(tip.x - TIP_X).toFixed(1)}px, ${(tip.y - TIP_Y).toFixed(1)}px, 0) scale(${fScale.toFixed(3)})`;
    if (carrying) {
      carry.style.transform =
        `translate3d(${(tip.x + CARRY_DX - CARRY_HALF).toFixed(1)}px, ${(tip.y + CARRY_DY - CARRY_HALF).toFixed(1)}px, 0) scale(${cScale.toFixed(3)})`;
    }
  }

  // ── easing + timing primitives ──
  const smootherstep = k => k * k * k * (k * (k * 6 - 15) + 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function tween(ms, onUpdate, ease = smootherstep) {
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        onUpdate(ease(k), k);
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  const centerOf = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  };

  // ── beats ──
  async function fingerIn(toX, toY) {
    tip.x = window.innerWidth * 0.86;
    tip.y = window.innerHeight + 160;              // off-screen, bottom-right
    fScale = 1.12; place();
    const sx = tip.x, sy = tip.y;
    await tween(720, e => {
      tip.x = sx + (toX - sx) * e;
      tip.y = sy + (toY - sy) * e;
      fScale = 1.12 - 0.12 * e;
      finger.style.opacity = String(Math.min(1, e * 1.4));
      place();
    });
  }

  async function grab(url) {                       // a thumb appears "pinched" at the tip
    carry.src = url;
    carrying = true; cScale = 0.55; carry.style.opacity = '0'; place();
    await tween(340, e => { carry.style.opacity = String(e); cScale = 0.55 + 0.45 * e; place(); });
  }

  async function glideTo(x, y, ms) {
    const sx = tip.x, sy = tip.y;
    await tween(ms, e => { tip.x = sx + (x - sx) * e; tip.y = sy + (y - sy) * e; place(); });
  }

  async function tap() {                           // a quick press dip on the fingertip
    await tween(150, e => { fScale = 1 - 0.14 * e; place(); });
    await tween(200, e => { fScale = 0.86 + 0.14 * e; place(); });
  }

  async function dropInto(key, slotEl, url) {
    const c = centerOf(slotEl);
    slotEl.classList.add('is-over');               // the tool's own drag-hover glow
    // release the pinched thumb into the slot, filling for real as it lands
    const startX = tip.x + CARRY_DX, startY = tip.y + CARRY_DY;
    let filled = false;
    await tween(440, (e, k) => {
      const x = startX + (c.x - startX) * e;
      const y = startY + (c.y - startY) * e;
      carry.style.transform =
        `translate3d(${(x - CARRY_HALF).toFixed(1)}px, ${(y - CARRY_HALF).toFixed(1)}px, 0) scale(${(1 - 0.4 * e).toFixed(3)})`;
      carry.style.opacity = String(Math.max(0, 1 - e * 1.15));
      if (!filled && k > 0.55) { filled = true; try { window.recFillSlot?.(key, url); } catch (err) {} }
    });
    carrying = false; carry.style.opacity = '0';
    slotEl.classList.remove('is-over');
    await sleep(180);
  }

  // ── the run ──
  let started = false;
  async function play() {
    if (started) return; started = true;

    const slotA = document.getElementById('slot-a');
    const slotB = document.getElementById('slot-b');
    const runEl = document.getElementById('run');
    if (!slotA || !slotB || !runEl) return;

    const cA = centerOf(slotA), cB = centerOf(slotB);

    // 1) finger enters near slot 1, carrying object A
    await fingerIn(cA.x + 150, cA.y + 60);
    await grab(A_URL);
    await sleep(120);

    // 2) drag A → slot 1
    await glideTo(cA.x - CARRY_DX, cA.y - CARRY_DY, 1050);
    await dropInto('a', slotA, A_URL);

    // 3) pick up object B, drag → slot 2
    await grab(B_URL);
    await sleep(100);
    await glideTo(cB.x - CARRY_DX, cB.y - CARRY_DY, 1000);
    await dropInto('b', slotB, B_URL);

    // 4) to MIX, tap → the real bowl churns + fills (short, for a demo)
    const cRun = centerOf(runEl);
    await glideTo(cRun.x, cRun.y, 900);
    await tap();
    try { window.recStir?.(9000); } catch (e) {}
    await sleep(250);

    // 5) finger exits down
    await tween(560, e => {
      tip.y = cRun.y + e * (window.innerHeight + 220 - cRun.y);
      finger.style.opacity = String(1 - e);
      place();
    });
    finger.style.display = 'none';

    // 6) tour every game on the reel, dwelling so the set-pieces scrub
    const n = (window.reelMode?.count?.() | 0) || 1;
    const TOUR_MS = 12500;
    const per = Math.max(780, Math.round(TOUR_MS / n));
    for (let i = 0; i < n; i++) {
      try { window.reelMode?.go?.(i); } catch (e) {}
      await sleep(per);
    }

    // 7) spoon lifts, the result flies out of the bowl. Hold.
    try { window.recLift?.(); } catch (e) {}
    await sleep(520);
    try { window.openMixWindow?.(); } catch (e) {}
  }

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      window.removeEventListener('keydown', onKey);
      play();
    }
  }
  window.addEventListener('keydown', onKey);

  // seat the finger just off-screen so the first frame is a clean, empty stage
  tip.x = window.innerWidth * 0.86; tip.y = window.innerHeight + 160; place();
})();
