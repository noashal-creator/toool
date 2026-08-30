/* ─────────────────────────────────────────────────────────────────────
   chag-data.js — the holiday variation's data (FINAL design, Figma 3399:379).

   Three tables the rest of the variation reads:
     CHAG_SYMBOLS — the 8 symbols (id, label, image). Images are the exact
                    crops exported from the Figma frame (assets/chag/sym2/).
     CHAG_GRID    — the 4×2 grid, in the frame's own order.
     CHAG_RESULTS — the pre-prepared result for each of the 28 pairs.

   The pair key is the two symbol ids sorted A→Z joined with "+", so pick
   order never matters. chag-live.js looks the result up by that key.

   RESULTS ARE STILL PLACEHOLDERS (one demo image + generated copy) until
   Noa delivers the 28 prepared results:
     • each pair's `img` → assets/chag/res/<key>.png
     • each pair's text (name / kind / desc / size / weight)
     • optional `stir` (ms) — how long the bowl churns for that pair.
   ───────────────────────────────────────────────────────────────────── */

window.CHAG_SYMBOLS = [
  { id: 'dvash',   label: 'דבש',       img: 'assets/chag/sym2/dvash.png'   },
  { id: 'tapuach', label: 'תפוח',      img: 'assets/chag/sym2/tapuach.png' },
  { id: 'keves',   label: 'ראש כבש',   img: 'assets/chag/sym2/keves.png'   },
  { id: 'gezer',   label: 'גזר',       img: 'assets/chag/sym2/gezer.png'   },
  { id: 'dag',     label: 'ראש דג',    img: 'assets/chag/sym2/dag.png'     },
  { id: 'kara',    label: 'קרא',       img: 'assets/chag/sym2/kara.png'    },
  { id: 'tamar',   label: 'תמר',       img: 'assets/chag/sym2/tamar.png'   },
  { id: 'rimon',   label: 'רימון',     img: 'assets/chag/sym2/rimon.png'   },
];

/* the 4×2 grid, exactly as the Figma frame lays it out (row by row) */
window.CHAG_GRID = [
  'dvash', 'tapuach', 'keves', 'gezer',
  'dag',   'kara',    'tamar', 'rimon',
];

/* ── the 28 pairs — placeholder fill until the real results arrive ── */
window.CHAG_RESULTS = (() => {
  const out = {};
  const S = window.CHAG_SYMBOLS;
  for (let i = 0; i < S.length; i++) {
    for (let j = i + 1; j < S.length; j++) {
      const a = S[i], b = S[j];
      const key = [a.id, b.id].sort().join('+');
      out[key] = {
        /* the prepared result for this pair — one file per pair, named by the
           same sorted key. res-c/ is the card-ready set: white point levelled
           so the photo melts into the card's white sheet with no edge, dust
           removed, and re-canvassed so the object lands optically centred.
           Rebuild it from the originals with prep-chag-results.py. */
        img:    `assets/chag/res-c/${key}.png`,
        name:   `${a.label}־${b.label}`,
        kind:   'סימן חג ממוזג',
        desc:   `התוצר המשולב של ${a.label} ו${b.label} — כאן יופיע התיאור שהכנת מראש לזוג הזה.`,
        size:   '12 ס״מ × 8 ס״מ',
        weight: '180 ג׳',
        /* stir: 30000  // אופציונלי — משך הבחישה לזוג הזה */
      };
    }
  }
  return out;
})();
