#!/usr/bin/env python3
"""Bundle the deck into ONE self-contained .html file.

Stylesheet, script, every image and the embedded font CSS are inlined or
base64'd, so the result opens by double-click on any machine — no server, no
folder, no paths to break. All the motion still works: same markup, same script,
carried inside one file.

    python3 export-deck.py            → TOOOL-deck.html

Re-run after any change to deck.html / deck.css / deck.js / assets.
"""
import base64, mimetypes, os, re, sys

SRC, OUT = 'deck.html', 'TOOOL-deck.html'
mimetypes.add_type('image/svg+xml', '.svg')
missing, embedded = [], {}

def data_uri(path):
    """file → data: URI, cached so a picture used on five slides is carried once"""
    path = path.split('?')[0].split('#')[0]
    if path in embedded:
        return embedded[path]
    if not os.path.isfile(path):
        missing.append(path)
        return path
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    with open(path, 'rb') as f:
        embedded[path] = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
    return embedded[path]

def inline_css(css, base):
    def imp(m):
        p = os.path.join(base, m.group(1).strip('\'"'))
        if os.path.isfile(p):
            return inline_css(open(p, encoding='utf-8').read(), os.path.dirname(p))
        missing.append(p); return ''
    css = re.sub(r'@import\s+url\(([^)]+)\)\s*;', imp, css)
    def url(m):
        raw = m.group(1).strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:')):
            return m.group(0)
        return 'url("%s")' % data_uri(os.path.join(base, raw))
    return re.sub(r'url\(([^)]+)\)', url, css)

html = open(SRC, encoding='utf-8').read()

# 1 · drop every dormant section, wherever it sits. They never render, but their
#     pictures would still be embedded — megabytes of slides nobody sees. Matched
#     by class rather than by position: they are NOT all in the parked tail.
before = html.count('<section class="parked')
html = re.sub(r'<section class="parked[^>]*>.*?</section>\n?', '', html, flags=re.S)
html = re.sub(r'<!-- ══+\n\s+PARKED.*?-->\n?', '', html, flags=re.S)
print('dropped %d dormant sections' % before)

# 2 · lift the <link> and <script> tags OUT before touching any src= attribute,
#     so the asset pass below cannot mangle them and the JS body cannot be
#     mistaken for markup (its comments contain example src paths)
slots = {}
def hold(m, kind):
    path = m.group(1).split('?')[0]
    key = '@@%s_%d@@' % (kind, len(slots))
    body = open(path, encoding='utf-8').read()
    slots[key] = ('<style>\n%s\n</style>' % inline_css(body, os.path.dirname(path) or '.')
                  if kind == 'css' else '<script>\n%s\n</script>' % body)
    return key
html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', lambda m: hold(m, 'css'), html)
html = re.sub(r'<script src="([^"]+)"></script>',              lambda m: hold(m, 'js'),  html)

# 3 · embed every asset the markup points at. data-src drives the drop-in loader
#     and data-frames is a comma-separated list — both must travel too, or the
#     loader 404s and silently removes the pictures it cannot find.
sub = lambda a: (r'(\b%s=")(?!data:|https?:)([^"]+)(")' % a,
                 lambda m: m.group(1) + data_uri(m.group(2)) + m.group(3))
for attr in ('src', 'data-src'):
    html = re.sub(*sub(attr), string=html)
html = re.sub(r'(\bdata-frames=")([^"]+)(")',
              lambda m: m.group(1) + ','.join(data_uri(p.strip()) for p in m.group(2).split(',')) + m.group(3),
              html)

# 4 · put the stylesheet and script back
for key, body in slots.items():
    html = html.replace(key, body)

open(OUT, 'w', encoding='utf-8').write(html)
print('wrote %s  —  %.1f MB, %d files embedded' % (OUT, os.path.getsize(OUT) / 1048576, len(embedded)))
if missing:
    print('\nMISSING (left as plain paths, will NOT travel):')
    for p in sorted(set(missing)): print('  -', p)
    sys.exit(1)
