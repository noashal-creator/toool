/* ─────────────────────────────────────────────────────────────────────
   TOOOL — Midpoint Generator

   Two images in, one out: the "object representing the midpoint on the
   spectrum between them" is composited on a canvas (B drawn over A at
   50% opacity) and then cascaded across the purple stage, matching the
   repeated-frame treatment in the design.
   ───────────────────────────────────────────────────────────────────── */

const picker = document.getElementById('picker');
const runBtn = document.getElementById('run');
const stage  = document.getElementById('stage');
const status = document.getElementById('status');
const frames = document.querySelectorAll('.cascade img');
const spoonRig = document.getElementById('spoon-rig');
const bowl     = document.querySelector('.bowl');

/* ── the mix timeline ────────────────────────────────────────────────────
   Every one of these must match a duration in styles.css:
     DESCEND_MS  rig-descend, and bowl-load's animation-delay
     STIR_MS     one rig-stir / bowl-jiggle cycle
     LIFT_MS     rig-lift, and run-border-return
   FILL_MS is a whole number of stir cycles ON PURPOSE: the stir oscillates
   ±9deg around 90.53deg, so switching to the lift at an arbitrary moment would
   snap the spoon by up to 9deg. Landing the switch exactly on a cycle boundary
   means the stir is back at 90.53deg — precisely where rig-lift begins — so the
   handover is seamless.
   MIX_MS is DERIVED, never hand-typed, so the parts can't drift apart. */
const DESCEND_MS = 800;
const STIR_MS    = 640;
const LIFT_MS    = 600;
const READY_BEAT = 500;                  // beat on "ready" before the result opens
const FILL_MS    = 44 * STIR_MS;         // 28160ms — the ~half-minute prep
/* The last 6 stir cycles of the fill are a WIND-DOWN. It has to begin on a
   cycle boundary: rig-stir is back at exactly rotate(90.53deg) and bowl-jiggle
   at translateX(0) there, which is the pose the -calm variants start from, so
   they can take over without the scene jumping. */
const FINISH_CYCLES = 6;
const FINISH_MS  = FINISH_CYCLES * STIR_MS;              // 3840ms
const FINISH_AT  = DESCEND_MS + FILL_MS - FINISH_MS;     // 25120ms, a boundary
const MIX_MS     = DESCEND_MS + FILL_MS + LIFT_MS + READY_BEAT;   // ≈30.1s

const fillLevel = document.querySelector('.bowl-fill__level');
const fillBox   = document.querySelector('.bowl-fill');
const mixA      = document.querySelector('.bowl-mix__a');
const mixB      = document.querySelector('.bowl-mix__b');
const mixVein   = document.querySelector('.bowl-mix__vein');   // image 1 again, in veins
const mixDisp   = document.querySelector('#bowl-marble feDisplacementMap');
const mixPulse  = mixDisp && mixDisp.querySelector('animate');

const MIX_SCALE_MAX  = 110;   // matches the SMIL pulse's peak in index.html
const MIX_SCALE_EASE = 35;    // where the wind-down phase brings it down to
const MIX_SCALE_REST = 4;     // what "finished mixing" looks like
const SETTLE_MS      = 900;
const READY_HOLD_MS  = 3500;  // how long READY stays before it fades on its own
let readyFade = 0;

/* The churn used to run at full strength right up to the instant the result
   appeared, which is a large part of why the ending felt abrupt. Letting the
   displacement ease down to a near-stop reads as the mixture coming to rest,
   so the result arrives after something has visibly finished. The SMIL pulse
   has to be stopped first or it would keep overwriting `scale` underneath. */
let settleRaf = 0;
let settleEnd = 0;
function settleMix(to = MIX_SCALE_REST, dur = SETTLE_MS) {
  if (!mixDisp) return;
  cancelAnimationFrame(settleRaf);
  clearTimeout(settleEnd);
  try { mixPulse && mixPulse.endElement(); } catch (e) { /* SMIL not running yet */ }
  const from = parseFloat(mixDisp.getAttribute('scale')) || MIX_SCALE_MAX;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);            // ease-out: fast drop, soft landing
    mixDisp.setAttribute('scale', (from + (to - from) * eased).toFixed(1));
    if (k < 1) settleRaf = requestAnimationFrame(step);
  };
  settleRaf = requestAnimationFrame(step);
  /* requestAnimationFrame does not run in a backgrounded tab, and the SMIL
     pulse has just been stopped — so without this the displacement would stay
     frozen at full strength if the user switched tabs mid-mix, and come back
     to a permanently churning bowl. Guarantee the end state on a plain timer. */
  settleEnd = setTimeout(() => {
    cancelAnimationFrame(settleRaf);
    mixDisp.setAttribute('scale', String(to));
  }, dur + 60);
}
function restartMixChurn() {
  if (!mixDisp) return;
  cancelAnimationFrame(settleRaf);
  clearTimeout(settleEnd);
  mixDisp.setAttribute('scale', String(MIX_SCALE_MAX));
  try { mixPulse && mixPulse.beginElement(); } catch (e) { /* ignore */ }
}
const gaugeNum  = document.querySelector('.bowl-gauge__num');
const mixWin    = document.getElementById('mixwin');

/* The percentage is read off the DRAWN level every frame rather than from a
   second timer running alongside the CSS animation — two clocks would drift and
   the number would end up disagreeing with the bowl the user is looking at. */
let gaugeRaf = 0;
function startGauge() {
  cancelAnimationFrame(gaugeRaf);
  const step = () => {
    const pct = fillLevel.getBoundingClientRect().height
              / fillBox.getBoundingClientRect().height * 100;
    gaugeNum.textContent = Math.max(0, Math.min(100, Math.round(pct))) + '%';
    gaugeRaf = requestAnimationFrame(step);
  };
  step();
}
function stopGauge() { cancelAnimationFrame(gaugeRaf); gaugeRaf = 0; }

/* The hand's idle twitch and cta.js's badge hops are TEACHING aids — they exist
   to show a first-time visitor what to do. Once someone has actually run a mix
   they know, and from then on the same motion is just the sidebar fidgeting at
   them while they work. So both go quiet for the rest of the session.

   sessionStorage, deliberately, not localStorage: coming back another day the
   invitation should be there again. It only has to survive reloads within the
   visit. Wrapped because storage throws outright in some privacy modes, and a
   nicety like this must never take the mix down with it. */
function markMixed() {
  document.documentElement.classList.add('has-mixed');
  try { sessionStorage.setItem('toool.mixed', '1'); } catch { /* private mode — fine */ }
}
try {
  if (sessionStorage.getItem('toool.mixed')) document.documentElement.classList.add('has-mixed');
} catch { /* ditto */ }

function playStir(fillMs = FILL_MS) {
  markMixed();

  // The bowl's purple loading gauge is timed off MIX_MS so it always finishes
  // exactly when the result appears. It starts only once the spoon has landed
  // (DESCEND_MS, matching rig-descend / the 800ms delay in the CSS), so the
  // remaining window is what the gauge spreads its fill across — a steady,
  // honest rate rather than jumping. Set on :root, not on .bowl — .bowl-fill is
  // .bowl's SIBLING, so a custom property set on .bowl would never inherit to it.
  document.documentElement.style.setProperty('--fill-ms', fillMs + 'ms');

  // the bowl fills with a blend of the user's OWN two uploads — set here
  // rather than in the markup, since these are per-mix object URLs
  if (mixA && mixB) {
    mixA.src = slots.a.url;
    mixB.src = slots.b.url;
    if (mixVein) mixVein.src = slots.a.url;   // same image as mixA — see .bowl-mix__vein
  }
  restartMixChurn();      // a fresh mix churns at full strength again

  // .run animates independently of .spoon-rig (see the CSS comment on .run
  // for why), so both need the class toggled together to stay in sync.
  // .bowl carries the class for its rim/body jiggle (the bowl itself is never
  // transformed — that would break the rim → spoon → body layering).
  for (const el of [spoonRig, runBtn, bowl]) {
    el.classList.remove('is-mixing', 'is-finishing', 'is-done', 'is-draining', 'is-carrying');
    void el.offsetWidth;               // restart the animation
    el.classList.add('is-mixing');
  }
  fillLevel.style.animation = 'none';   // restart the gauge from empty
  void fillLevel.offsetWidth;
  fillLevel.style.animation = '';
  startGauge();
}

/* Everything winds back BEHIND the result window, not when it is dismissed.
   Doing it on close meant the user watched the photos vanish and the bowl empty
   immediately after they closed it — a change they did not ask for, at the exact
   moment they were done. Doing it while the window is up hides all of that, so
   closing simply reveals a clean tool with nothing moving.
   The short delay lets the window settle first, so the drain does not pull the
   eye away from the result the instant it appears.
   mix-modal.js owns the window and emits no event, so its `is-open` class is
   observed rather than reaching into that file. */
/* 1400, not 450: the window now spends 1150ms flying OUT of the bowl (see
   card-fly-smooth in styles.css). At 450 the bowl would have started clearing
   up while the window was still visibly leaving it — the reset would have
   trodden on the very motion it is meant to happen behind. */
const RESET_BEHIND_MS = 1400;
let windUp = 0;
function windDownAfterResult() {
  if (!bowl.classList.contains('is-done')) return;
  /* If the window flew out, level-carry has ALREADY taken the bowl's contents
     out with it and the bowl is empty — adding is-draining here would animate
     the liquid back up to full and drain it a second time. Only the path where
     the window was never opened still needs a drain of its own. */
  const alreadyEmpty = bowl.classList.contains('is-carrying');
  if (!alreadyEmpty) bowl.classList.add('is-draining');
  setTimeout(() => {
    // dropping is-done also fades READY out, via the same cross-fade
    for (const el of [spoonRig, runBtn, bowl]) el.classList.remove('is-finishing', 'is-done', 'is-draining', 'is-carrying');
    resetSlots();                     // back to a clean pair of upload squares
  }, alreadyEmpty ? 0 : 520);         // 520 matches bowl-drain in styles.css
}
if (mixWin) {
  new MutationObserver(() => {
    if (!mixWin.classList.contains('is-open')) return;   // only on OPEN now
    // the bowl's contents leave WITH the window, in the same motion
    bowl.classList.add('is-carrying');
    clearTimeout(windUp);
    windUp = setTimeout(windDownAfterResult, RESET_BEHIND_MS);
  }).observe(mixWin, { attributes: true, attributeFilter: ['class'] });
}

/* aspect ratio of a cascade frame, taken from the design */
const OUT_W = 412;
const OUT_H = 497;

const slots = {
  a: { el: document.getElementById('slot-a'), out: document.getElementById('out-a'), fallback: 'upload object 1', image: null, url: null },
  b: { el: document.getElementById('slot-b'), out: document.getElementById('out-b'), fallback: 'upload object 2', image: null, url: null },
};

let activeKey = null;
let resultUrl = null;

/* load() sets .slot__label's textContent to the filename, which REPLACES the
   flattened Figma glyph <img> inside it. Resetting a slot therefore has to put
   that markup back, not just blank the text — so keep a copy from startup. */
const slotLabelHTML = {
  a: slots.a.el.querySelector('.slot__label').innerHTML,
  b: slots.b.el.querySelector('.slot__label').innerHTML,
};

/* Once the result has been seen, the tool goes back to being ready for the next
   mix.

   This USED to snap. `.slot__preview` has always had a fade on it, but the old
   version removed `is-filled` and called `removeAttribute('src')` in the SAME
   frame — blanking the image outright, so the fade had nothing left to fade and
   the photo simply vanished into a yellow square. Revoking the object URL in
   that frame did the same thing for the same reason. The label's glyph was also
   restored in that frame, so the "UPLOAD THE FIRST IMAGE" text popped in under
   a picture that was already gone.

   And it is not hidden: `.mixwin` centres the card in the RIGHT half of the
   screen (padding-left: var(--sbw)), so the sidebar is fully visible the whole
   time the result is up. "Behind the window" was never true for the slots.

   So the photo is now CROSS-FADED out against the label underneath it (the
   label sits below .slot__preview's z-index 4, so restoring it first and then
   fading the photo is a real cross-fade, not a swap), and the src/URL are only
   released once that fade has finished. The two slots are staggered so it reads
   as the tool clearing itself, not as two things blinking at once. */
const SLOT_FADE_MS = 420;      // must match .slot:not(.is-filled) .slot__preview
const SLOT_STAGGER_MS = 130;

function resetSlots() {
  let i = 0;
  for (const [key, slot] of Object.entries(slots)) {
    const url = slot.url;        // released only after the fade, not now
    slot.url = null;
    slot.image = null;
    slot.el.classList.remove('is-missing');

    setTimeout(() => {
      // a new file was chosen while this fade was pending — leave it alone, but
      // still release the old URL below so it does not leak
      if (slot.url) { if (url) URL.revokeObjectURL(url); return; }
      // put the glyph back FIRST, so there is something to cross-fade to
      slot.el.querySelector('.slot__label').innerHTML = slotLabelHTML[key];
      slot.el.classList.remove('is-filled');
      setTimeout(() => {
        if (url) URL.revokeObjectURL(url);
        if (slot.url) return;                  // refilled mid-fade
        slot.el.querySelector('.slot__preview').removeAttribute('src');
      }, SLOT_FADE_MS);
    }, i++ * SLOT_STAGGER_MS);
  }
  say('Ready for another mix.');
}

/* ── picking a file ─────────────────────────────────────────────────── */

for (const [key, slot] of Object.entries(slots)) {
  slot.el.addEventListener('click', () => {
    activeKey = key;
    picker.value = '';          // so re-picking the same file still fires
    picker.click();
  });

  /* dragging a file straight onto a slot */
  slot.el.addEventListener('dragover', event => {
    event.preventDefault();
    slot.el.classList.add('is-over');
  });
  slot.el.addEventListener('dragleave', () => slot.el.classList.remove('is-over'));
  slot.el.addEventListener('drop', event => {
    event.preventDefault();
    slot.el.classList.remove('is-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) load(key, file);
  });
}

picker.addEventListener('change', () => {
  const file = picker.files?.[0];
  if (file && activeKey) load(activeKey, file);
});

function load(key, file, onDone) {
  if (!file.type.startsWith('image/')) {
    say(`"${file.name}" is not an image.`);
    if (onDone) onDone();
    return;
  }

  const slot = slots[key];
  if (slot.url) URL.revokeObjectURL(slot.url);
  slot.url = URL.createObjectURL(file);

  const image = new Image();
  image.onload = () => {
    slot.image = image;
    slot.el.classList.add('is-filled');
    slot.el.classList.remove('is-missing');
    slot.el.querySelector('.slot__preview').src = slot.url;
    slot.el.querySelector('.slot__label').textContent = file.name;
    say(`Object ${key.toUpperCase()} loaded: ${file.name}`);
    if (onDone) onDone();
  };
  image.onerror = () => {
    say(`Could not read "${file.name}".`);
    URL.revokeObjectURL(slot.url);
    slot.url = null;
    if (onDone) onDone();
  };
  image.src = slot.url;
}

/* ── generating the midpoint ────────────────────────────────────────── */

runBtn.addEventListener('click', () => {
  const missing = Object.values(slots).filter(slot => !slot.image);

  if (missing.length) {
    for (const slot of missing) {
      slot.el.classList.remove('is-missing');
      void slot.el.offsetWidth;               // restart the animation
      slot.el.classList.add('is-missing');
    }
    say('Two objects are needed before the system can find a midpoint.');
    return;
  }

  /* the cascade stage section is optional (it was cut from the reel);
     the mix must run fine without it */
  stage?.classList.add('is-working');
  say('Generating midpoint…');
  playStir();

  /* The ending used to happen in a single frame — dropping .is-mixing teleported
     the hand 90deg out of the bowl, emptied the full bowl, and threw the window
     up, all at once. It now lands in two beats: first the gauge completes and
     the spoon LIFTS out of the bowl, then a moment later the result arrives, so
     it reads as a consequence rather than a jump cut. */
  /* The choreography no longer races the real generation: at FINISH_AT the
     scene asks mix-live whether the result is actually in (window.mixLiveReady)
     and simply KEEPS STIRRING until it is — the bowl never finishes cooking
     before the dish. Only then the ending plays, with the original beats at
     their original distances. Without the live pipeline the gate is always
     open, so the timing is byte-identical to before. */
  const resultIsIn = () => (window.mixLiveReady ? window.mixLiveReady() : true);
  const whenResultIsIn = (cb) => {
    if (resultIsIn()) return cb();
    const poll = setInterval(() => {
      if (resultIsIn()) { clearInterval(poll); cb(); }
    }, 400);
  };

  setTimeout(() => whenResultIsIn(() => {
    /* the scene starts slowing BEFORE it finishes — added ON TOP of is-mixing so
       the fill keeps running underneath, with only the stir and jiggle swapped
       for their calmer variants (see the -calm rules in styles.css) */
    for (const el of [spoonRig, runBtn, bowl]) el.classList.add('is-finishing');
    settleMix(MIX_SCALE_EASE, FINISH_MS);   // first stage of the calm-down

    /* FINISH_MS later — exactly the original DESCEND+FILL boundary */
    setTimeout(() => {
      for (const el of [spoonRig, runBtn, bowl]) {
        el.classList.remove('is-mixing', 'is-finishing');
        el.classList.add('is-done');       // spoon lifts out; gauge fades to "ready"
      }
      stopGauge();
      gaugeNum.textContent = '100%';       // land on a round number under the fade
      settleMix(MIX_SCALE_REST, SETTLE_MS);// second stage, from the already-eased value
      say('Midpoint ready.');

      /* READY is a moment, not a state — it fades a few seconds later. The window
         closing normally clears it (see the observer above); this covers the case
         where the window is never opened, so it can't sit there indefinitely. */
      clearTimeout(readyFade);
      readyFade = setTimeout(() => {
        // if the window did open, the observer above has already handled this
        if (mixWin && mixWin.classList.contains('is-open')) return;
        windDownAfterResult();
      }, READY_HOLD_MS);
    }, FINISH_MS);

    /* …and only then the result itself — at the original distance from the
       calm-down (MIX_MS - FINISH_AT = FINISH_MS + LIFT_MS + READY_BEAT). */
    setTimeout(() => {
      const url = composeMidpoint(slots.a.image, slots.b.image);

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = url;

      for (const frame of frames) frame.src = url;

      /* the "two source objects" section is optional too (also cut) */
      if (slots.a.out) { slots.a.out.src = slots.a.url; slots.a.out.alt = 'Object 1'; }
      if (slots.b.out) { slots.b.out.src = slots.b.url; slots.b.out.alt = 'Object 2'; }

      stage?.classList.remove('is-working');
      say('Midpoint generated.');

      // .is-done deliberately STAYS: it holds the bowl full and the gauge on
      // "ready" behind the window. The drain is triggered when the window closes
      // (see the MutationObserver above).
      window.openMixWindow?.();
    }, MIX_MS - FINISH_AT);
  }), FINISH_AT);
});

function composeMidpoint(imageA, imageB) {
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  drawCover(ctx, imageA, 1);
  drawCover(ctx, imageB, 0.5);   // 50 % of the way from A to B

  return canvas.toDataURL('image/jpeg', 0.9);
}

/* draw an image so it covers the canvas, centre-cropped, at a given alpha */
function drawCover(ctx, image, alpha) {
  const scale = Math.max(OUT_W / image.naturalWidth, OUT_H / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;

  ctx.globalAlpha = alpha;
  ctx.drawImage(image, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

function say(message) {
  status.textContent = message;
}

/* ── recording mode hooks (recording.js) ──────────────────────────────────
   A scripted, cursor-less demo drives the tool itself for a clean screen
   capture. These expose the module-scoped pieces it needs — filling a slot
   from a preset asset, starting the churn with a short fill, and the spoon
   "lift" beat — without recording.js reaching into this file's internals or
   the normal flow changing at all. Purely additive. */
// resolves ONLY once the image has actually decoded and is showing in the slot
// (load()'s onDone) — recording.js awaits this instead of guessing a timeout.
window.recFillSlot = (key, url) =>
  fetch(url)
    .then(r => r.blob())
    .then(b => new Promise(resolve => {
      load(key, new File([b], 'object ' + (key === 'a' ? '1' : '2') + '.jpg', { type: b.type || 'image/jpeg' }), resolve);
    }));
window.recResetSlots = () => resetSlots();
window.recStir = (fillMs) => { playStir(fillMs); };
window.recLift = () => {
  for (const el of [spoonRig, runBtn, bowl]) {
    el.classList.remove('is-mixing', 'is-finishing');
    el.classList.add('is-done');          // spoon lifts out; gauge holds at ready
  }
  stopGauge();
  gaugeNum.textContent = '100%';
  settleMix(MIX_SCALE_REST, SETTLE_MS);
};
