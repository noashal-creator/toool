#!/usr/bin/env python3
"""
Prepare the chag card's 28 pair photos.  assets/chag/res/  ->  res-w/  ->  res-c/

The originals in res/ are never touched; re-run this any time they change.

res-w/  the photo, ready to sit on the card's white sheet
        1. WHITE POINT levelled: the studio ground (it runs 237-253 across the
           set) is stretched to pure 255, so the photo melts into the sheet with
           no edge at all.  Not a cutout - Noa rejected cutting as "too coarse";
           the shadow under the object survives intact.
        2. edge dirt whitened, with the ring capped at each image's own object
           clearance so a tightly-cropped shot is never clipped.
        3. DESPECKLED: detached blobs smaller than 0.1% of the object are
           scanner dust, not content - one of them was 84px at darkness 21,
           which reads as a black dot floating on the sheet.

res-c/  the same photo re-canvassed so the OBJECT is dead centre, which is what
        the card wants: Noa asked for each one placed optically centred, sizes
        left as shot since no two are ever seen together.  The canvas is the
        smallest box-aspect rectangle centred on the object that still holds the
        whole source, padded white - so `object-fit: contain` drops every object
        on the box centre and nothing is ever cropped.

        Measuring that centre is the subtle part.  A plain threshold bbox is
        WRONG: gezer+tamar carries 227px of 232-value haze on its left, which
        inflated its bbox and threw the object 89px off centre - visibly.  So
        the object is found as connected blobs of clearly-visible ink (< 225),
        keeping every blob at least 0.5% of the largest.
"""
from PIL import Image
import numpy as np, glob, os
from collections import deque

BOX_W, BOX_H = 1129, 653          # the card's creature box (chag card 1241x998)
AR           = BOX_W / BOX_H
VIS          = 225                # "clearly visible ink"
KEEP_BLOB    = 0.005              # blobs >= 0.5% of the largest are the object
DUST_BLOB    = 0.001              # detached blobs < 0.1% of it are dust
SRC, MID, OUT = 'assets/chag/res', 'assets/chag/res-w', 'assets/chag/res-c'


def box_count(m, r):
    """how many mask pixels sit in the (2r+1)^2 window centred on each pixel"""
    p = np.pad(m.astype(np.int32), r)
    I = np.pad(p.cumsum(0).cumsum(1), ((1,0),(1,0)))
    H, W = m.shape
    k = 2*r + 1
    return I[k:k+H, k:k+W] - I[0:H, k:k+W] - I[k:k+H, 0:W] + I[0:H, 0:W]


def specks(mask):
    """isolated pixels — a scan can carry single dark px, and they are what
       broke this before: a 1px dot at an odd coordinate is invisible to the
       eye but drags a threshold bbox tens of px, which threw the object
       visibly off centre on dag+kara and dvash+keves. Full resolution, no
       subsampling, precisely because that is where they used to hide."""
    dense = box_count(mask, 3) >= 12          # part of a real region
    near  = box_count(dense, 4) > 0           # or touching one
    return mask & ~near


def components(mask, step=2):
    """connected blobs of `mask`, labelled on a coarsened grid for speed"""
    ms = mask[::step, ::step]
    H, W = ms.shape
    seen = np.zeros(ms.shape, bool)
    out = []
    for y in range(H):
        for x in range(W):
            if ms[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True
                px = []
                x0 = x1 = x; y0 = y1 = y
                while q:
                    cy, cx = q.popleft(); px.append((cy, cx))
                    if cx < x0: x0 = cx
                    if cx > x1: x1 = cx
                    if cy < y0: y0 = cy
                    if cy > y1: y1 = cy
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                        ny, nx = cy+dy, cx+dx
                        if 0 <= ny < H and 0 <= nx < W and ms[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                out.append(dict(area=len(px)*step*step, px=px, step=step,
                                box=(x0*step, y0*step, x1*step+step-1, y1*step+step-1)))
    return out


os.makedirs(MID, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
log = []

for f in sorted(glob.glob(SRC + '/*.png')):
    n = os.path.basename(f)
    im = Image.open(f).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape

    # ── 1. white point ──
    bw = max(20, min(h, w) // 25)
    band = np.concatenate([a[:bw].reshape(-1,3), a[-bw:].reshape(-1,3),
                           a[:, :bw].reshape(-1,3), a[:, -bw:].reshape(-1,3)])
    wp = np.percentile(band, 0.5, axis=0)
    img = np.clip(a * (255.0/wp), 0, 255).astype(np.uint8)
    lift = 255 - wp.min()

    # ── 2. edge ring, never wider than the object's own clearance ──
    ink = (img.astype(int) < 235).any(axis=-1)
    ys, xs = np.where(ink)
    gap = min(ys.min(), h-1-ys.max(), xs.min(), w-1-xs.max())
    ring = max(0, min(6, gap-2))
    if ring:
        img[:ring] = 255; img[-ring:] = 255; img[:, :ring] = 255; img[:, -ring:] = 255

    # ── 3. despeckle, in two passes because dust comes in two sizes ──
    m = img.astype(int).min(axis=2) < VIS
    sp = specks(m)                              # single stray pixels
    img[sp] = 255
    n_specks = int(sp.sum())

    m = img.astype(int).min(axis=2) < VIS       # now safe to coarsen
    comps = components(m)
    big = max(c['area'] for c in comps)
    dust = [c for c in comps if c['area'] < DUST_BLOB * big]
    for c in dust:                              # small detached smudges
        st = c['step']
        for (cy, cx) in c['px']:
            img[cy*st:cy*st+st, cx*st:cx*st+st] = 255

    # any speck the coarse pass exposed by removing its neighbours
    m = img.astype(int).min(axis=2) < VIS
    sp2 = specks(m)
    img[sp2] = 255
    n_specks += int(sp2.sum())
    Image.fromarray(img).save(MID + '/' + n)

    # ── 4. the object, and a canvas centred on it ──
    m = img.astype(int).min(axis=2) < VIS
    comps = components(m)
    big = max(c['area'] for c in comps)
    keep = [c for c in comps if c['area'] >= KEEP_BLOB * big]
    ox0 = min(c['box'][0] for c in keep); oy0 = min(c['box'][1] for c in keep)
    ox1 = max(c['box'][2] for c in keep); oy1 = max(c['box'][3] for c in keep)
    # the coarse grid rounds outward — snap back to the real ink
    ys2, xs2 = np.where(m)
    ox0 = max(ox0, int(xs2.min())); oy0 = max(oy0, int(ys2.min()))
    ox1 = min(ox1, int(xs2.max())); oy1 = min(oy1, int(ys2.max()))
    cx, cy = (ox0+ox1+1)/2, (oy0+oy1+1)/2

    hw = max(cx, w-cx); hh = max(cy, h-cy)
    hw = max(hw, hh*AR); hh = hw/AR
    CW, CH = int(round(2*hw)), int(round(2*hh))
    px, py = int(round(hw-cx)), int(round(hh-cy))
    canvas = Image.new('RGB', (CW, CH), (255,255,255))
    canvas.paste(Image.fromarray(img), (px, py))
    canvas.save(OUT + '/' + n)

    k = min(BOX_W/CW, BOX_H/CH)
    log.append(dict(name=n, lift=lift, ring=ring, dust=len(dust)+ (1 if n_specks else 0),
                    dust_px=sum(c['area'] for c in dust) + n_specks,
                    obj=(ox1-ox0+1, oy1-oy0+1), canvas=(CW,CH), paste=(px,py),
                    rendered=int((ox1-ox0+1)*k),
                    err=max(abs(BOX_W/2 - (px+cx)*k - (BOX_W-CW*k)/2),
                            abs(BOX_H/2 - (py+cy)*k - (BOX_H-CH*k)/2))))

print(f'{"pair":22s} {"lift":>4s} {"ring":>4s} {"dust":>10s} {"object":>11s} {"on card":>8s} {"centre err":>10s}')
for r in log:
    print(f'{r["name"][:-4]:22s} {r["lift"]:4.0f} {r["ring"]:4d} '
          f'{r["dust"]:2d}/{r["dust_px"]:6d}px {r["obj"][0]:5d}x{r["obj"][1]:<5d} '
          f'{r["rendered"]:7d}px {r["err"]:9.2f}px')

# ── verify nothing was lost between res-w and res-c ──
bad = []
for r in log:
    A = np.asarray(Image.open(MID+'/'+r['name']).convert('RGB'))
    B = np.asarray(Image.open(OUT+'/'+r['name']).convert('RGB'))
    h, w, _ = A.shape
    if not np.array_equal(A, B[r['paste'][1]:r['paste'][1]+h, r['paste'][0]:r['paste'][0]+w]):
        bad.append(r['name'])
# a browser measures a plain threshold bbox — that must now agree with ours,
# otherwise an invisible speck is still pulling the object off centre
drift = []
for r in log:
    B = np.asarray(Image.open(OUT+'/'+r['name']).convert('RGB')).astype(int).min(axis=2)
    ys, xs = np.where(B < VIS)
    H, W = B.shape
    dx = (xs.min()+xs.max()+1)/2 - W/2
    dy = (ys.min()+ys.max()+1)/2 - H/2
    drift.append((r['name'][:-4], dx, dy))
worst = max(drift, key=lambda d: max(abs(d[1]), abs(d[2])))
print(f'\nplain-threshold check (what the browser sees): worst drift '
      f'{worst[0]} ({worst[1]:+.1f}, {worst[2]:+.1f})px')
over = [d for d in drift if max(abs(d[1]), abs(d[2])) > 2]
print('off by more than 2px:', [(d[0], round(d[1],1), round(d[2],1)) for d in over] if over else 'none')

print(f'\n{len(log)} pairs prepared.')
print('res-w preserved byte-for-byte inside res-c:', 'yes, all of them' if not bad else bad)
print(f'object-centre error: worst {max(r["err"] for r in log):.2f}px, mean {sum(r["err"] for r in log)/len(log):.2f}px')
print(f'dust removed in total: {sum(r["dust"] for r in log)} blobs, {sum(r["dust_px"] for r in log):,}px')
print(f'objects render {min(r["rendered"] for r in log)}..{max(r["rendered"] for r in log)}px wide (as shot)')
