/* ─────────────────────────────────────────────────────────────────────
   cta.js — call-to-action nudge on the upload flow

   Guides a first-time user ONE STEP AT A TIME: only the NEXT action hops.
   With both slots empty, badge 1 alone gives a soft bob, a long rest, and
   repeats — badge 2 stays still. The instant image 1 is uploaded (app.js adds
   `is-filled` to the slot), the nudge moves to badge 2. Once both are filled
   it hands off to the MIX button (#run). The motion itself is CSS (@keyframes
   cta-bounce in styles.css); this file only decides WHICH element bobs and
   WHEN, by toggling `.is-cta` on it for exactly one pulse.

   Why only the next step and not 1-then-2 together: an earlier version bobbed
   1 then 2 on a tight loop, which read as an odd constant jump. Highlighting
   just the single next action — with a long rest between bobs — is calmer and
   clearer ("do this now"), and the sequence unfolds across the user's own
   actions rather than in a rapid loop.

   Smart behaviour:
     - only the first empty slot bobs; badge 2 waits its turn,
     - a slot goes quiet the instant its image is uploaded,
     - both filled -> the bob hands off to MIX (#run),
     - while MIX is mid-run (or the result is showing) nothing bobs.

   State is read, never written, from the classes app.js already manages — no
   edits to app.js. A MutationObserver watches the two slots and the run
   button for class changes, but only RESTARTS the sequence when the relevant
   state actually changes (a "signature" of the fill/idle flags), so the
   observer never reacts to the `.is-cta` class this file toggles itself and
   there is no feedback loop.

   prefers-reduced-motion: no hopping at all — a steady ring marks the current
   "start here" target instead (.is-cta-static), matching how the rest of the
   site disables motion outright rather than softening it. */

(() => {
  const slotA  = document.getElementById('slot-a');
  const slotB  = document.getElementById('slot-b');
  const runBtn = document.getElementById('run');
  if (!slotA || !slotB || !runBtn) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const PULSE = 600;   // one bob — MUST match the CSS animation duration
  const REST  = 3600;  // long, calm pause before the next bob

  const CANDIDATES = [slotA, slotB, runBtn];
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const dropCta = () => CANDIDATES.forEach(el => el.classList.remove('is-cta'));
  const dropAll = () => CANDIDATES.forEach(el => el.classList.remove('is-cta', 'is-cta-static'));

  // MIX is "idle" (worth nudging) only before a run starts / after a reset.
  const RUN_BUSY = ['is-mixing', 'is-finishing', 'is-done', 'is-draining', 'is-carrying'];
  const runIdle = () => !RUN_BUSY.some(c => runBtn.classList.contains(c));

  // Once a mix has been run in this session the nudge has taught what it had to
  // teach, and app.js marks <html> with `has-mixed` (it also restores the mark
  // from sessionStorage on load, before this file runs). Nothing bobs after
  // that. No extra wiring is needed to stop mid-flight: starting a mix changes
  // runIdle(), which changes the signature, which restarts the cycle — and the
  // cycle then finds nothing to nudge.
  const taught = () => document.documentElement.classList.contains('has-mixed');

  // only the NEXT action deserves the nudge — the first empty slot in order,
  // then MIX once both are filled
  function targets() {
    if (taught()) return [];
    if (!slotA.classList.contains('is-filled')) return [slotA];
    if (!slotB.classList.contains('is-filled')) return [slotB];
    return runIdle() ? [runBtn] : [];
  }

  // signature of the state the nudge depends on — ignores our own .is-cta toggles
  const sig = () => [
    slotA.classList.contains('is-filled'),
    slotB.classList.contains('is-filled'),
    runIdle(),
  ].join(',');
  let lastSig = sig();

  function cycle() {
    clearTimers();
    dropCta();
    const el = targets()[0];
    if (!el) return;   // nothing to nudge (mid-mix / result open); observer restarts us later
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    at(0,     () => el.classList.add('is-cta'));   // one soft bob
    at(PULSE, () => el.classList.remove('is-cta'));
    at(PULSE + REST, cycle);                       // long rest, then again
  }

  function applyStatic() {
    clearTimers();
    dropAll();
    const els = targets();
    if (els[0]) els[0].classList.add('is-cta-static');
  }

  let scheduled = false;
  function restart() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (reduce.matches) applyStatic();
      else cycle();
    });
  }

  const mo = new MutationObserver(() => {
    const s = sig();
    if (s === lastSig) return;      // only react to real state changes
    lastSig = s;
    restart();
  });
  CANDIDATES.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));

  // a backgrounded tab throttles timers; pause cleanly and resume on return
  document.addEventListener('visibilitychange', () => {
    if (reduce.matches) return;
    if (document.hidden) { clearTimers(); dropCta(); }
    else restart();
  });
  reduce.addEventListener?.('change', restart);

  restart();
})();
