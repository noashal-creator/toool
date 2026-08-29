/* ─────────────────────────────────────────────────────────────────────
   color-edit — a simple, clear colour panel for the sidebar.

   A small 🎨 button (bottom-left). Click it → a panel opens listing every
   editable sidebar colour BY NAME, each with a colour swatch (the full
   colour scale) + a hex field. Pick or type → it recolours live. No modes,
   no guessing which element. Picks persist (localStorage); "copy CSS" dumps
   them so they can be baked into styles.css. Close with the ✕ or the button.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  /* v3: the store key changes whenever the design's own palette changes —
     colours saved against an older palette were overriding the new one on
     Noa's machine (the purple title). A new key starts from the Figma colours. */
  const STORE = 'toool-chag-colors-v3';
  try {
    localStorage.removeItem('toool-chag-colors');
    localStorage.removeItem('toool-chag-colors-v2');
  } catch (e) { /* fine */ }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { saved = {}; }

  /* one-time reset: the cow background was changed by accident, so drop that one
     saved override and let it fall back to the green CSS default (#00961C). The
     flag makes it happen exactly once, so the "רקע הפרה" swatch still works and
     any future pick you make sticks. */
  try {
    if (!localStorage.getItem('toool.heroBg.reset1')) {
      if (saved.heroBg) { delete saved.heroBg; localStorage.setItem(STORE, JSON.stringify(saved)); }
      localStorage.setItem('toool.heroBg.reset1', '1');
    }
  } catch (e) { /* private mode — nothing to reset */ }

  const rgbToHex = v => {
    v = (v || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    if (!m) return '#000000';
    const h = n => (+n).toString(16).padStart(2, '0');
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  };
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // ── the named, editable sidebar colours ──
  const CONTROLS = [
    { key: 'panel', name: 'רקע הסרגל (צהוב)',
      get: () => getComputedStyle(sidebar).backgroundColor,
      apply: v => document.documentElement.style.setProperty('--panel', v),
      css: v => ':root { --panel: ' + v + '; }' },
    { key: 'slotbg', name: 'רקע ריבועי ההעלאה',
      get: () => { const s = $('.slot'); return s ? getComputedStyle(s).backgroundColor : '#fff'; },
      /* also drives --slot-bg, which the fish band's ground reads: the two are
         meant to be the same yellow, so one pick moves both */
      apply: v => { $$('.slot').forEach(el => el.style.backgroundColor = v);
                    document.documentElement.style.setProperty('--slot-bg', v); },
      css: v => ':root { --slot-bg: ' + v + '; }\n.slot { background: ' + v + '; }' },
    { key: 'frame', name: 'קו המסגרת המקווקו',
      get: () => { const r = $('.slot__frame rect'); return r ? (r.style.stroke || r.getAttribute('stroke') || '#000') : '#000'; },
      apply: v => $$('.slot__frame rect').forEach(r => r.style.stroke = v),
      css: v => '.slot__frame rect { stroke: ' + v + '; }' },
    { key: 'badge', name: 'עיגול המספר',
      get: () => { const n = $('.slot__num'); return n ? getComputedStyle(n).backgroundColor : '#560476'; },
      apply: v => $$('.slot__num').forEach(n => n.style.backgroundColor = v),
      css: v => '.slot__num { background: ' + v + '; }' },
    { key: 'badgeborder', name: 'מסגרת העיגול',
      get: () => { const n = $('.slot__num'); return n ? getComputedStyle(n).borderTopColor : '#000'; },
      apply: v => $$('.slot__num').forEach(n => n.style.borderColor = v),
      css: v => '.slot__num { border-color: ' + v + '; }' },
    { key: 'mix', name: 'טקסט "mix"',
      get: () => { const m = $('.run__label'); return m ? getComputedStyle(m).color : '#000'; },
      apply: v => $$('.run__label').forEach(m => m.style.color = v),
      css: v => '.run__label { color: ' + v + '; }' },
    { key: 'bowl', name: 'צבע הקערה',
      /* sets the VARIABLE, not .bowl's own colour: the bowl's SVGs and the
         waterline in .bowl-wave both read --bowl-color, so one swatch moves
         them together. Setting .bowl { color } directly would recolour the
         bowl and leave the wave on its old red. */
      get: () => { const b = $('.bowl'); return b ? getComputedStyle(b).color : '#cc0000'; },
      apply: v => document.documentElement.style.setProperty('--bowl-color', v),
      css: v => ':root { --bowl-color: ' + v + '; }' },
    // ── the holiday grid ──
    { key: 'gridCell', name: 'רקע התא (לבן)',
      get: () => { const t = $('.chag-tile'); return t ? getComputedStyle(t).backgroundColor : '#ffffff'; },
      apply: v => $$('.chag-tile').forEach(t => t.style.backgroundColor = v),
      css: v => '.chag-tile { background: ' + v + '; }' },
    { key: 'gridLines', name: 'קווי הרשת (שחור)',
      get: () => { const p = $('.chag-picker'); return p ? getComputedStyle(p).backgroundColor : '#000000'; },
      apply: v => $$('.chag-picker').forEach(p => p.style.backgroundColor = v),
      css: v => '.chag-picker { background: ' + v + '; }' },
    { key: 'stageBg', name: 'רקע העמוד',
      get: () => { const s = $('.chag-stage'); return s ? getComputedStyle(s).backgroundColor : '#ffffff'; },
      apply: v => $$('.chag-stage').forEach(s => s.style.backgroundColor = v),
      css: v => '.chag-stage { background: ' + v + '; }' },
    { key: 'bowlFill', name: 'צבע מילוי הקערה',
      get: () => { const f = $('.bowl-fill__level'); return f ? getComputedStyle(f).backgroundColor : '#560476'; },
      apply: v => $$('.bowl-fill__level').forEach(f => f.style.backgroundColor = v),
      css: v => '.bowl-fill__level { background: ' + v + '; }' },
    // ── logo ──
    { key: 'logoBanner', name: 'לוגו — רקע הבאנר (סגול)',
      get: () => { const b = $('.logo-banner'); return b ? getComputedStyle(b).backgroundColor : '#560476'; },
      apply: v => $$('.logo-banner').forEach(b => b.style.backgroundColor = v),
      css: v => '.logo-banner { background: ' + v + '; }' },
    { key: 'logoText', name: 'לוגו — צבע האותיות (אדום)',
      get: () => { const t = $('.logo .ltr'); return t ? getComputedStyle(t).color : '#FE0000'; },
      apply: v => $$('.logo .ltr').forEach(t => t.style.color = v),
      css: v => '.logo .ltr { color: ' + v + '; }' },
    { key: 'logoStroke', name: 'לוגו — קו מתאר (שחור)',
      get: () => { const t = $('.logo .ltr'); return t ? (getComputedStyle(t).webkitTextStrokeColor || '#000') : '#000'; },
      apply: v => $$('.logo .ltr').forEach(t => t.style.setProperty('-webkit-text-stroke-color', v)),
      css: v => '.logo .ltr { -webkit-text-stroke-color: ' + v + '; }' },
  ];

  // ── restore saved picks ──
  CONTROLS.forEach(c => { if (saved[c.key]) c.apply(saved[c.key]); });

  function persist(key, value) {
    saved[key] = value;
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch (e) {
      /* localStorage can throw (strict privacy settings, storage full, some
         extensions) — the colour still applies live, it just won't survive
         a reload. Surface this loudly instead of failing silently, since
         "it looked like it worked but didn't save" is otherwise undiagnosable. */
      console.error('[color-edit] could not save to localStorage — colour will NOT persist across reload:', e);
      alert('הצבע הוחל אבל לא נשמר (localStorage חסום בדפדפן שלך): ' + e.message);
    }
  }
  function copyCss() {
    const lines = CONTROLS.filter(c => saved[c.key]).map(c => c.css(saved[c.key]));
    const css = lines.join('\n') || '/* no colours changed yet */';
    if (navigator.clipboard) navigator.clipboard.writeText(css).catch(() => {});
    console.log('%c[sidebar colours]\n' + css, 'color:#5c5');
    alert('הועתק ל-clipboard (וגם בקונסול):\n\n' + css);
  }

  // ── UI ──
  const btn = document.createElement('button');
  btn.textContent = '🎨 צבעים';
  btn.title = 'צבעי הסרגל';
  btn.className = 'rec-hide';
  btn.style.cssText =
    'position:fixed;top:14px;right:14px;z-index:2147483646;padding:11px 16px;border-radius:24px;' +
    'border:2px solid #fff;background:#111;color:#fff;font:600 15px/1 -apple-system,Helvetica,Arial,sans-serif;' +
    'cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.5)';
  // the colours button is an AUTHORING tool — it is not part of the Figma
  // design, so it only appears with ?edit in the URL (chag.html?edit)
  if (new URLSearchParams(location.search).has('edit')) document.body.appendChild(btn);

  let panel = null;
  function buildPanel() {
    panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;left:12px;bottom:64px;z-index:2147483647;background:#1b1b1b;color:#fff;' +
      'border:1px solid #555;border-radius:12px;padding:12px;width:300px;max-height:78vh;overflow:auto;' +
      'font:13px/1.35 -apple-system,Helvetica,Arial,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55);direction:rtl;text-align:right';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<strong>צבעים</strong>' +
        '<button class="ce-x" style="border:1px solid #555;background:#2a2a2a;color:#fff;border-radius:6px;padding:3px 8px;cursor:pointer">✕</button>' +
      '</div>';

    CONTROLS.forEach(c => {
      const hex = rgbToHex(saved[c.key] || c.get());
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:9px';
      row.innerHTML =
        '<input type="color" class="ce-sw" value="' + hex + '" ' +
          'style="width:40px;height:34px;flex:none;padding:0;border:1px solid #555;border-radius:6px;background:#111;cursor:pointer">' +
        '<span style="flex:1">' + c.name + '</span>' +
        '<input type="text" class="ce-hex" value="' + hex + '" ' +
          'style="width:82px;flex:none;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#fff;direction:ltr;text-align:left">';
      const sw = row.querySelector('.ce-sw');
      const tx = row.querySelector('.ce-hex');
      const set = (v, fromSwatch) => {
        c.apply(v); persist(c.key, v);
        if (fromSwatch) tx.value = v; else if (/^#[0-9a-f]{6}$/i.test(v)) sw.value = v;
      };
      sw.addEventListener('input', () => set(sw.value, true));
      tx.addEventListener('input', () => { const v = tx.value.trim(); if (v) set(v, false); });
      panel.appendChild(row);
    });

    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:8px;margin-top:6px';
    foot.innerHTML =
      '<button class="ce-copy" style="flex:1;padding:7px;border-radius:7px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer">copy CSS</button>' +
      '<button class="ce-reset" style="padding:7px 10px;border-radius:7px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer">איפוס</button>';
    panel.appendChild(foot);

    panel.querySelector('.ce-x').onclick = togglePanel;
    panel.querySelector('.ce-copy').onclick = copyCss;
    panel.querySelector('.ce-reset').onclick = () => {
      // clear inline overrides + storage, then reload the live values
      document.documentElement.style.removeProperty('--panel');
      $$('.slot').forEach(el => el.style.removeProperty('background-color'));
      $$('.slot__frame rect').forEach(r => r.style.removeProperty('stroke'));
      $$('.slot__num').forEach(n => { n.style.removeProperty('background-color'); n.style.removeProperty('border-color'); });
      $$('.run__label').forEach(m => m.style.removeProperty('color'));
      $$('.logo-banner').forEach(b => b.style.removeProperty('background-color'));
      $$('.logo .ltr').forEach(t => { t.style.removeProperty('color'); t.style.removeProperty('-webkit-text-stroke-color'); });
      document.documentElement.style.removeProperty('--bowl-color');
      $$('.bowl-fill__level').forEach(f => f.style.removeProperty('background-color'));
      $$('.chag-tile').forEach(t => t.style.removeProperty('background-color'));
      $$('.chag-picker').forEach(p => p.style.removeProperty('background-color'));
      $$('.chag-stage').forEach(s => s.style.removeProperty('background-color'));
      saved = {}; localStorage.removeItem(STORE);
      panel.remove(); panel = null; buildPanel();
    };
    document.body.appendChild(panel);
  }

  function togglePanel() {
    if (panel) { panel.remove(); panel = null; }
    else buildPanel();
  }
  btn.addEventListener('click', togglePanel);
})();
