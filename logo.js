/* ─────────────────────────────────────────────────────────────────────
   logo — three linked behaviours on one wordmark:

     1. it OPENS on load — the five letters start piled behind the "t" and
        slide out to their places, left to right;
     2. then it RUNS — each letter swaps typeface on its own fast beat;
     3. scrolling CLOSES it again — the same slide, scrubbed by scroll
        position and in reverse order (the "l" folds back first), and once
        the banner has scrolled away the mark reappears small in the
        bottom-right corner, on no background, as a back-to-top button.

   The swapping IS the idea: the ABC Dinamo library is what gives the mark its
   character, and all 2,077 of those files are static cuts (none carries an
   `fvar` table), so there is nothing to interpolate between — a variable font
   morphs smoothly but only ever wears one face, which read as dull.

   Everything below exists because a specific thing looked wrong first:
     · x-height normalisation — mixing faces at one size looked ragged;
     · width balancing (pose composed as a SET) — a pose could land all-narrow
       and the word visibly shrank;
     · a baseline probe — estimating the baseline from font metrics left the
       word sitting low in the band;
     · optical centring toward the o's — the visual mass of "toool" is the row
       of o's, not the thin ascenders, so the arithmetic centre read as low;
     · scale taken from the larger half-extent about that optical centre —
       otherwise moving the centre let the t and l clip at the top;
     · horizontal bounds from real ink bearings — centring the advance boxes
       left a gap on the left, because the first glyph's ink starts inside its
       box.
   ───────────────────────────────────────────────────────────────────── */

(() => {
  const logo   = document.getElementById('site-logo');
  const banner = document.querySelector('.logo-banner');
  const mini   = document.getElementById('mini-logo');
  if (!logo || !banner) return;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FONTS=['"ABC Helveesti Spikes Trial"','"ABC Helveesti Trial"','"ABC Gravity Trial"',
   '"ABC Gravity Wide Trial"','"ABC Gravity Expanded Trial"','"ABC Gravity Compressed Trial"',
   '"ABC Gravity Extra Condensed Trial"','"ABC Ginto Nord Trial"','"ABC Ginto Condensed Trial"',
   '"ABC Ginto Rounded Nord Trial"','"ABC Arizona Serif Trial"','"ABC Arizona Flare Trial"',
   '"ABC Arizona Mix Trial"','"ABC Gramercy Display Trial"','"ABC Gramercy Fine Trial"',
   '"ABC Diatype Extended Trial"','"ABC Diatype Compressed Trial"','"ABC Diatype Rounded Trial"',
   '"ABC Favorit Expanded Trial"','"ABC Favorit Compressed Trial"','"ABC Camera Rounded Trial"',
   '"ABC Ikarus Contrast Trial"','"ABC Ikarus Flair Trial"','"ABC Daily Slab Trial"',
   '"ABC Daily Scotch Trial"','"ABC Estragon Trial"','"ABC Asfalt Expanded Trial"',
   '"ABC Bingo Trial"','"ABC Cowboy Trial"','"ABC Honeymoon Trial"','"ABC Bubblegum Trial"'];
  const WEIGHTS=['200','300','400','500','700','800','900'];
  const XH=0.52, MAX_H=0.80, TARGET=3.15, TOL=0.12;
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const cx=document.createElement('canvas').getContext('2d');
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;

  const CAND={};
  function buildMetrics(){
    for(const ch of 'tol'){
      const list=[];
      for(const fam of FONTS) for(const w of WEIGHTS) for(const st of ['normal','italic']){
        cx.font=`${st} ${w} 200px ${fam}`;
        const mo=cx.measureText('o');
        const xh=(mo.actualBoundingBoxAscent+mo.actualBoundingBoxDescent)/200;
        if(!(xh>0.05)) continue;
        const sizeEm=XH/xh;
        const m=cx.measureText(ch);
        const ascR=m.actualBoundingBoxAscent/200, descR=m.actualBoundingBoxDescent/200;
        if((ascR+descR)*sizeEm>MAX_H) continue;
        /* the FONT's own ascent/descent — with line-height:1 the baseline sits
           inside the box in this proportion, which is how the true ink box is
           located below */
        const fA=(m.fontBoundingBoxAscent||ascR*200)/200, fD=(m.fontBoundingBoxDescent||descR*200)/200;
        /* where the ink actually starts and ends inside the advance box — a
           glyph with a wide left side bearing sits right of its box, which made
           the centred word look pushed to the right */
        const blR=(m.actualBoundingBoxLeft||0)/200, brR=(m.actualBoundingBoxRight||m.width)/200;
        list.push({fam,w,st,sizeEm,ascR,descR,fA,fD,blR,brR,adv:(m.width/200)*sizeEm});
      }
      CAND[ch]=list;
    }
  }
  function apply(el,p){
    el.style.fontFamily=p.fam+', "Helvetica Neue", sans-serif';
    el.style.fontWeight=p.w; el.style.fontStyle=p.st;
    el.style.fontSize=p.sizeEm.toFixed(3)+'em';
    el.dataset.asc=p.ascR; el.dataset.desc=p.descR;
    el.dataset.fa=p.fA;    el.dataset.fd=p.fD;
    el.dataset.bl2=p.blR;  el.dataset.br2=p.brR;
  }
  /* compose the pose as a SET so the word never grows or shrinks */
  function balance(chars,p){
    for(let i=0;i<24;i++){
      const t=p.reduce((s,x)=>s+x.adv,0);
      if(Math.abs(t-TARGET)<=TOL) break;
      const wider=t<TARGET;
      const j=p.reduce((m,x,k)=>(wider? x.adv<p[m].adv : x.adv>p[m].adv)?k:m,0);
      let best=p[j];
      for(let a=0;a<8;a++){const c=pick(CAND[chars[j]]); if(wider? c.adv>best.adv : c.adv<best.adv) best=c;}
      p[j]=best;
    }
    return p;
  }
  /* ── where the mark sits, at any point of its journey ──────────────────
     prog 0 = fitted inside the banner, prog 1 = landed in the bottom-right
     corner. It is ONE object the whole way (gallery option 5): it shrinks and
     flies to the corner, overshooting a little and settling.

     Because the element is position:fixed while it flies, the banner's own
     rect is re-read every frame — that is what makes it ride the banner up
     before peeling off toward the corner. */
  /* easeOutBack — the ORIGINAL size/position curve for the flight, restored
     unchanged. It maps scroll → how far the mark has shrunk and flown to the
     corner; the overshoot is a small deliberate spring at the landing. The
     "make it smoother" work does NOT touch this curve and does NOT stretch the
     scroll runway, so the mark's SIZE and POSITION at every scroll point are
     exactly what they always were. Smoothing is done purely in TIME by the
     glide below (it eases the shown progress toward the scroll target so
     mouse-wheel steps stop reading as hard jumps). At any scroll rest point the
     shown progress equals the scroll value, so the size/position is identical
     to before — the smoothing only lives in the frames between. */
  const easeBack = p => { const q = p - 1; return 1 + 1.8*q*q*q + 0.8*q*q; };
  const lerp = (a,b,t) => a + (b-a)*t;
  function place(word,band,letters,prog){
    /* Fit and centre on the TRUE ink box.
       The baseline is read from a zero-size inline-block probe rather than
       estimated from font metrics — estimating it left the word sitting low in
       the band (52px of air above, 22 below). Every letter shares that baseline,
       so the ink box is simply baseline ∓ the measured ascent/descent.

       The open/close slide puts a transform on each LETTER, which would drag
       these measurements with it — so the letters are momentarily returned to
       their resting places, measured, and put back. */
    const held = letters.map(el => el.style.transform);
    letters.forEach(el => { el.style.transform = 'none'; });
    word.style.transform='none';
    const b=band.getBoundingClientRect();
    const probe=word.querySelector('.bl');
    const baseline=probe? probe.getBoundingClientRect().bottom : null;
    let L=1e9,R=-1e9,T=1e9,B=-1e9,xTop=1e9;
    letters.forEach(el=>{
      const q=el.getBoundingClientRect();
      const fs=parseFloat(getComputedStyle(el).fontSize);
      const bl=baseline!==null? baseline : q.bottom;
      const top=bl-(+el.dataset.asc||0.7)*fs;
      /* horizontal bounds from the real ink, not the advance box */
      L=Math.min(L, q.left - (+el.dataset.bl2||0)*fs);
      R=Math.max(R, q.left + (+el.dataset.br2||0)*fs);
      T=Math.min(T, top);
      if(el.textContent==='o') xTop=Math.min(xTop,top);   // the x-height mass
      /* "toool" has no descenders, so the baseline IS the visual bottom */
      B=Math.max(B, bl);
    });
    letters.forEach((el,i) => { el.style.transform = held[i]; });
    if(xTop===1e9) xTop=T;
    const w=R-L;
    if(!(w>0)) return;

    /* Optical centring: the visual mass of "toool" is the row of o's, not the
       thin ascenders of t and l. Centring the full box is arithmetically correct
       but reads as sitting low, so bias the centre toward the x-height band. */
    const OPTICAL = 0.62;                       // 0 = full box, 1 = x-height only
    const cFull = (T+B)/2, cX = (xTop+B)/2;
    const inkCy = cFull + (cX-cFull)*OPTICAL;

    /* Because that centre is off the geometric middle, the ink reaches further
       on one side than the other — so the scale has to come from the LARGER
       half-extent around it, not from the box height. Using the height was what
       let the t and l get clipped once the centre moved. */
    const half = Math.max(inkCy-T, B-inkCy);
    if(!(half>0)) return;
    const kBand = Math.min((b.width*0.88)/w, (b.height*0.5*0.94)/half);

    /* The corner size is set on the INK, not on a font-size: every typeface
       carries a different ink height at the same size, so pinning the ink is
       what keeps the landed mark from breathing in and out. */
    const CORNER_INK = clamp(innerWidth*0.033, 26, 46);
    const kCorner = CORNER_INK / (B-T);
    const e = easeBack(clamp(prog,0,1));
    const k = lerp(kBand, kCorner, e);

    /* Same reasoning as the ink-pinned gaps on the old corner mark: the target
       is where the ink's right edge and baseline should land, so the visible
       margin is equal on both sides whatever the typeface is doing. */
    const PAD = clamp(innerWidth*0.022, 14, 30);
    const inkCx = (L+R)/2;

    /* ── the LONG band: stand the wordmark UP ────────────────────────────
       "toool" is a wide, short word; the tall band is much taller than it is,
       so laid flat the word floats small in a sea of blue. Turn it 90° so it
       reads top-to-bottom and fills the band's HEIGHT instead, parked against
       the left edge by the sidebar — the only way a wide word fills a tall box.
       Same flight afterwards: it shrinks to the corner as you scroll, staying
       upright. Only in sideways + logo-long; every other mode is untouched. */
    if (document.body.classList.contains('sideways') &&
        document.body.classList.contains('logo-long')) {
      const kBandV = Math.min((b.height * 0.90) / w, (b.width * 0.5) / (B - T));
      const kV     = lerp(kBandV, kCorner, e);
      const halfWv = (B - T) * kV / 2;        // rotated: ink's horizontal half-extent
      const halfHv = w * kV / 2;              // rotated: ink's vertical half-extent
      const marginX = b.width * 0.04;
      const restX = b.left + marginX + halfWv,  restY = b.top + b.height / 2;
      const endXv = innerWidth  - PAD - halfWv, endYv = innerHeight - PAD - halfHv;
      const tgtXv = lerp(restX, endXv, e),      tgtYv = lerp(restY, endYv, e);
      const wrv = word.getBoundingClientRect();
      const cx0v = wrv.left + wrv.width / 2,     cy0v = wrv.top + wrv.height / 2;
      /* rotate(90deg) about the box centre sends a point (dx,dy) → (-dy,dx),
         so solving for the ink centre landing on the target gives these. */
      const txv = tgtXv - cx0v + kV * (inkCy - cy0v);
      const tyv = tgtYv - cy0v - kV * (inkCx - cx0v);
      word.style.transform =
        `translate(${txv.toFixed(1)}px, ${tyv.toFixed(1)}px) rotate(90deg) scale(${kV.toFixed(3)})`;
      return;
    }

    const startX = b.left + b.width/2,               endX = innerWidth  - PAD - (R-inkCx)*k;
    const startY = b.top  + b.height/2,              endY = innerHeight - PAD - (B-inkCy)*k;
    const tgtX = lerp(startX, endX, e), tgtY = lerp(startY, endY, e);

    const wr=word.getBoundingClientRect();
    const cx0=wr.left+wr.width/2, cy0=wr.top+wr.height/2;
    const tx=tgtX-cx0-(inkCx-cx0)*k;
    const ty=tgtY-cy0-(inkCy-cy0)*k;
    word.style.transform=`translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${k.toFixed(3)})`;
  }

  /* ── back to the top ───────────────────────────────────────────────────
     Under reduced motion the mark never flies, so the corner button is all
     there is — it just appears once the banner is gone. */
  /* the mark is hidden in CSS until it has been placed — this is the backstop
     that reveals it even if the fonts never resolve */
  const reveal = () => logo.classList.add('is-ready');
  setTimeout(reveal, 2500);

  const goTop = () => window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  if (mini) mini.addEventListener('click', goTop);


  document.fonts.ready.then(() => {
    const letters = [...logo.querySelectorAll('.ltr')];
    const chars = letters.map(el => el.textContent);
    if (!letters.length) return;

    /* the zero-size probe that reveals the line's exact baseline */
    if (!logo.querySelector('.bl')) {
      const probe = document.createElement('span');
      probe.className = 'bl';
      logo.appendChild(probe);
    }

    const size = () => { logo.style.fontSize = (banner.clientWidth * 0.30) + 'px'; };
    size();

    /* The corner mark only lives while the page is moving — see its beat
       below. This flag is raised by the scroll listener and drops again a
       moment after the last scroll event. */
    let scrolling = false, stopTimer = 0;

    /* ── the spectrum: one pose function for BOTH the open and the close ──
       u = 1 fully open, u = 0 closed down to "tl".

       The brand idea is the geometry: the t and the l are the two endpoints
       and the o's are the spectrum between them. So closed is not a pile of
       letters — it is the two endpoints standing together at the left, and
       opening is the l travelling right while the o's fill in the gap it
       leaves behind. The o's never fly in from the side (that always read as
       unnatural); each one is gated on the l having cleared its place, and
       grows up off the baseline where it already belongs.

       The resting geometry is re-read every call rather than cached: the
       typefaces keep swapping underneath, so the letters' own widths and
       positions move between frames. offsetLeft/offsetWidth ignore transforms,
       which is exactly what makes them safe to read mid-animation. */
    function spectrum(u) {
      const xs = letters.map(el => el.offsetLeft);
      const ws = letters.map(el => el.offsetWidth);
      const last = letters.length - 1;
      const lStart = xs[0] + ws[0];                     // the l parked against the t
      const lx = lStart + (xs[last] - lStart) * u;      // where the l actually is
      letters[last].style.transform =
        u >= 1 ? 'none' : `translateX(${(lx - xs[last]).toFixed(1)}px)`;
      for (let i = 1; i < last; i++) {
        /* an o comes in across its OWN slot: it starts as the l reaches its
           left edge and is fully there once the l reaches the next letter's.
           The slot is the PITCH to the next letter, not this letter's width —
           the letters overlap slightly (negative letter-spacing), so measuring
           the width left the last o a few percent short of solid, for ever. */
        const pitch = xs[i+1] - xs[i];
        const c = clamp((lx - xs[i]) / Math.max(pitch > 0 ? pitch : ws[i], 1), 0, 1);
        letters[i].style.transform = c >= 1 ? 'none' : `scale(${(0.35 + 0.65 * c).toFixed(3)})`;
        letters[i].style.opacity   = c.toFixed(3);
      }
    }
    /* how far the banner has left the top of the screen: 0 at rest, 1 gone.
       Tied to the banner's OWN height (the original mapping) — NOT stretched —
       so the mark reaches the corner at exactly the scroll point it always did
       and never lingers big in the middle. */
    const scrollProg = () => {
      const b = banner.getBoundingClientRect();
      return clamp(-b.top / Math.max(b.height, 1), 0, 1);
    };
    let openU = REDUCED ? 1 : 0;          // how far the load-in has opened
    /* The word stays open for the whole flight — it is the same mark landing in
       the corner, not a mark that folds up and a second one that appears. */
    let opening = null;                   // set while the load-in is running
    /* Smoothing (this is the "make it less sharp" fix, and the ONLY change to
       the flight). The flight used to be scrubbed 1:1 by scroll position, so a
       mouse wheel — which arrives in ~100px steps — moved the mark in those
       same hard steps. Now the scroll only sets a TARGET (progT) and the shown
       progress (progC) glides toward it each frame, so the wheel steps blur
       into one smooth move. It is kept tight on purpose: progC catches progT
       fast, so the mark's size/position never visibly trails behind the scroll
       — the glide only rounds off the jitter, it does not make the mark hang
       big or drift. At any scroll rest point progC == progT == the scroll
       value, so the resting size/position is byte-identical to the original. */
    let progT = scrollProg();        // where the scroll says we are (target)
    let progC = progT;               // where the mark actually is (shown, eased)
    let glideRaf = 0;
    const GLIDE = 0.22;             // fraction of the gap closed per frame — tight: de-jitter only, no visible lag
    const pose = () => spectrum(openU);
    const render = () => {
      if (opening) opening();
      pose();
      place(logo, banner, letters, progC);
      /* the button wakes up with the landing, and it is toggled HERE rather
         than only in the scroll handler: the handler runs inside rAF, which a
         browser pauses in a background tab, and the click target must not be
         left switched off just because the page loaded out of sight. Keyed on
         the real scroll target, not the eased value, so it never lags. */
      if (mini) mini.classList.toggle('is-in', progT >= 1);
    };
    function glideStep() {
      const d = progT - progC;
      if (Math.abs(d) < 0.0006) { progC = progT; glideRaf = 0; render(); return; }
      progC += d * GLIDE;
      render();
      glideRaf = requestAnimationFrame(glideStep);
    }
    function kickGlide() { if (!glideRaf) glideRaf = requestAnimationFrame(glideStep); }

    if (!REDUCED) {
      buildMetrics();
      if (CAND.o && CAND.o.length) {
        let p = balance(chars, chars.map(ch => pick(CAND[ch])));
        letters.forEach((el, k) => apply(el, p[k]));

        /* the mark leaves the banner, so it can no longer live inside it:
           fixed positioning is what lets it fly past the banner's edge and
           stay in the corner. `place` re-reads the banner every frame, so it
           still rides the band on the way out. */
        logo.classList.add('is-flying');

        /* 1 · OPEN — driven frame by frame rather than by a CSS transition:
           the letters are changing typeface all the way through the opening,
           so the geometry the pose is built from moves every frame and a
           transition would be interpolating toward a stale target. */
        spectrum(0);
        place(logo, banner, letters, 0);
        const DUR = 1050, t0 = performance.now();
        /* openU comes off the clock, not off the frame count, so a tab that
           loads in the background (where rAF is paused) does not sit there
           half-open: the very next swap beat carries the opening forward. */
        opening = () => { openU = 1 - Math.pow(1 - clamp((performance.now()-t0)/DUR, 0, 1), 3); };
        const step = () => { opening(); render();
                             if (openU < 1) requestAnimationFrame(step); else opening = null; };
        requestAnimationFrame(step);

        /* 2 · RUN — from the same moment, not after the opening: each letter
           turns over on its own fast beat (~0.25–0.4s), so the t and the l are
           already running while the spectrum between them unrolls.

           Once it has landed in the corner it turns over only while the page is
           moving — a mark that flickers at a standing page pulls the eye away
           from whatever is being read. */
        letters.forEach((el, k) => {
          const beat = () => {
            if (scrollProg() >= 1 && !scrolling) return;      // parked and resting
            p[k] = pick(CAND[chars[k]]);
            p = balance(chars, p);
            letters.forEach((e, i) => apply(e, p[i]));
            render();
          };
          setTimeout(() => { beat(); setInterval(beat, 250 + Math.random() * 150); },
                     k * 110 + Math.random() * 150);
        });
      }
    }

    progT = progC = scrollProg();          // if loaded mid-scroll, start settled — no glide-from-0
    place(logo, banner, letters, progC);
    reveal();                              // measured and placed — safe to show
    new ResizeObserver(() => { size(); onScroll(); }).observe(banner);

    /* 3 · THE FLIGHT — scrubbed by scroll, all of it inside `place`: the mark
       shrinks and travels to the bottom-right corner, overshooting slightly and
       settling (gallery option 5). Scrolling back up flies it home again.

       The corner button is not a second mark any more — it is an invisible hit
       area sitting under the landed one, so the click target and the thing you
       see are in the same place without being the same element. */
    let ticking = false;
    function onScroll() {
      if (!REDUCED) { progT = scrollProg(); kickGlide(); return; }
      if (mini) mini.classList.toggle('is-in', scrollProg() >= 1);
    }
    onScroll();
    window.addEventListener('scroll', () => {
      scrolling = true;                       // keeps the landed mark turning over
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => { scrolling = false; }, 160);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; onScroll(); });
    }, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  });
})();
