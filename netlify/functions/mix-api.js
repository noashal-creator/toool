/* ─────────────────────────────────────────────────────────────────────
   mix-api.js — the ONLY server piece of TOOOL LIVE (live.html).

   Holds the secret keys (FAL_KEY, ANTHROPIC_API_KEY) as Netlify env vars —
   they are never in the repo and never reach the browser. The browser talks
   only to this function; this function talks to fal / Anthropic.

   Actions (POST JSON {action, ...}):
     submit       {image_urls:[a,b]}  → fal queue submit  → {request_id}
     status       {request_id}        → fal queue status  → {status}
     result       {request_id}        → fal queue result  → {images:[{url}]}
     describe     {image_url}         → vision model      → {name,kind,desc,size,weight}
     archive      {a,b,result_url,text} → stores the whole mix in Netlify Blobs
     archive-list {k?}                → index of stored mixes (no images)
     archive-get  {id,k?}             → one full stored mix (with images)
   The archive lives in Netlify Blobs (store "mixes") — part of this same
   Netlify project, no extra account. The result image is fetched server-side
   and stored as bytes, so records outlive fal's hosted URLs. If an
   ARCHIVE_KEY env var is set, archive-list/-get require k to match it.

   The fal PROMPT and both model choices are pinned HERE, server-side, so a
   stranger who discovers the endpoint cannot spend the keys on arbitrary
   work — the function only does the one thing the site does. Each call is
   short (submit/status/result are quick; describe is one small vision call)
   to stay inside Netlify's ~10s synchronous-function ceiling; the slow part
   (fal generation, 15–40s) happens on fal's queue between our polls.       */

import { getStore } from '@netlify/blobs';

const FAL_MODEL = 'openai/gpt-image-2/edit';
const FAL_QUEUE = 'https://queue.fal.run/' + FAL_MODEL;
/* fal queues requests under the BASE model id — the /edit subpath exists only
   on submit. Its own submit response points status_url at .../gpt-image-2/... */
const FAL_QUEUE_BASE = 'https://queue.fal.run/openai/gpt-image-2';

const PROMPT = `Unedited analog photograph of a previously unknown transitional evolutionary form between the two uploaded subjects. The resulting entity should feel like an impossible discovery that somehow exists in the real world. Do not simply merge, blend, overlap, or split the two subjects. Avoid literal combinations and avoid choosing the most obvious visual similarities. Instead, invent an entirely new form that feels like an irrational evolutionary accident or a surreal mutation with its own strange internal logic. The connection between the original subjects should only become recognizable after careful observation.
Reject safe, elegant, or expected ideas. Deliberately avoid the first, second, and third obvious solution. Favor the weirdest, least predictable interpretation possible. Surprise is more important than realism of function. The entity should feel awkward, uncanny, bizarre, slightly ridiculous, and unexpectedly humorous without becoming cartoonish. Make bold, irrational design decisions. Invent impossible transitions, misplaced structures, unnecessary appendages, conflicting materials, strange proportions, unexpected textures, absurd anatomical or mechanical features, and surreal morphological choices that no human designer would intentionally create. It should look like evolution made a series of questionable decisions that somehow resulted in a stable form. The viewer's first reaction should be confusion, followed by curiosity, and only later recognition of the original subjects.
The photograph should feel like a genuine found analog snapshot taken in the late 1990s or early 2000s by someone casually documenting a real physical specimen. It is not a product render, not commercial photography, not concept art, and not a polished studio shoot. The specimen is placed in front of a seamless plain light grey paper backdrop and photographed using a real DSLR or 35mm film camera with a normal lens and a harsh direct on-camera flash. The flash is the dominant light source, creating harsh specular highlights, deep hard-edged shadows, slightly uneven exposure, flat lighting, subtle red-eye style flash characteristics where applicable, and the unmistakable raw aesthetic of an ordinary documentary photograph. The composition is slightly awkward and imperfect, as if the photographer was simply recording evidence rather than creating art. The specimen occupies most of the frame and remains the unquestionable focal point.
The image is completely unedited, retaining the authentic imperfections of analog photography: subtle film grain, tiny dust particles, faint scratches, light wrinkles in the print, minor exposure inconsistencies, soft lens imperfections, slight color shifts, natural optical imperfections, and the feeling of a physical photograph that has been sitting inside an archive box for decades before being scanned. Every material should exhibit convincing physical realism, believable weight, accurate texture, and authentic reflections. Nothing should resemble CGI, 3D rendering, digital illustration, product visualization, concept art, or AI-generated imagery. The image should be indistinguishable from a real documentary photograph of a tangible object that physically exists.
The surrealism exists only within the specimen itself. The camera, lighting, composition, and photographic process remain completely ordinary, objective, raw, and documentary. If there is any conflict between the surreal subject and the photographic style, always preserve the realism of the photograph. The image should first be perceived as a genuine found analog photograph, and only afterward reveal the impossible nature of the specimen.
Generate exactly ONE image containing exactly ONE single specimen — only the midpoint form itself, never a sequence, never a grid, never multiple stages or variants side by side. The single specimen is perfectly centered in the frame, fully visible, with GENEROUS empty background margins on all four sides (the specimen occupies roughly the middle 60% of the frame, never touching or approaching any edge), and the seamless plain light grey paper backdrop fills the entire frame edge to edge with nothing else in it.
THE FUSION IS ABSOLUTE. The two source objects must NO LONGER EXIST as separate recognizable entities anywhere in the image. STRICTLY FORBIDDEN: one object sitting on the other, inside the other, next to the other, attached to the other, wearing the other, holding the other, riding the other, or any composition of two distinct objects sharing a frame. If the result can be described as "X on Y" or "X with Y", it is WRONG. REQUIRED: one single continuous body whose anatomy, skeleton, surfaces and materials are a true fusion of both sources — the merge happens at the level of flesh, material and structure, so that neither original object could be pointed at or separated out.`;

/* the article text next to the image — same boxes, same lengths as the
   existing fixed demo copy ("Wing dryer"), so the design never reflows */
const DESCRIBE_PROMPT = `You are writing a dry, encyclopedic catalogue entry for the object in this photograph, in the exact style of an absurd specimen archive. Look at the image and invent what this object IS (a plausible-sounding but impossible everyday object). Respond with ONLY a JSON object, no markdown, with these fields and STRICT length limits:
{
  "name": "invented object name, 1-2 words, max 14 characters (like 'Wing dryer')",
  "kind": "category phrase, 2 words, max 20 characters (like 'Insect accessory')",
  "desc": "35-45 words, three dry factual sentences describing what it is, its form, and how it is used (like: 'A wing dryer is an object used for drying the wings of large insects. The body is rounded and compact, with a raised upper section. The insect is placed on the surface while the wings dry.')",
  "size": "plausible size in the format 'NN cm × NN cm'",
  "weight": "plausible weight in the format 'NNN g'"
}
Tone: deadpan, matter-of-fact, subtly absurd. Never mention photography, AI, or that the object is strange. Invent a NEW, different object identity every time — never reuse "wing dryer" or any previous name; derive the identity from what THIS specific specimen looks like.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  /* light abuse deterrent: only serve our own pages */
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  const allowed = ['toool-tool.netlify.app', 'localhost', '127.0.0.1'];
  if (origin && !allowed.some((h) => origin.includes(h))) {
    return json({ error: 'forbidden' }, 403);
  }

  const FAL_KEY = process.env.FAL_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { action } = body || {};

  try {
    if (action === 'submit') {
      if (!FAL_KEY) return json({ error: 'FAL_KEY not configured' }, 500);
      const { image_urls } = body;
      if (!Array.isArray(image_urls) || image_urls.length !== 2)
        return json({ error: 'need exactly 2 image_urls' }, 400);
      const r = await fetch(FAL_QUEUE, {
        method: 'POST',
        headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: PROMPT,
          image_urls,
          num_images: 1,
          output_format: 'png',
          /* landscape 4:3 — closest to the 1207×975 result card, so the
             full-bleed cover trims only background, never the specimen */
          image_size: 'landscape_4_3',
          /* medium renders noticeably faster (and cheaper) than the default;
             at the card's ~1200px display size the difference is invisible.
             Flip back to 'high' if the analog grain ever suffers. */
          quality: 'medium',
        }),
      });
      return json(await r.json(), r.status);
    }

    if (action === 'status' || action === 'result') {
      if (!FAL_KEY) return json({ error: 'FAL_KEY not configured' }, 500);
      const id = String(body.request_id || '');
      if (!/^[\w-]+$/.test(id)) return json({ error: 'bad request_id' }, 400);
      const url = FAL_QUEUE_BASE + '/requests/' + id + (action === 'status' ? '/status' : '');
      const r = await fetch(url, { headers: { Authorization: 'Key ' + FAL_KEY } });
      return json(await r.json(), r.status);
    }

    if (action === 'describe') {
      const imageUrl = String(body.image_url || '');
      if (!/^https:\/\//.test(imageUrl)) return json({ error: 'bad image_url' }, 400);

      let text = '';
      if (ANTHROPIC_API_KEY) {
        /* preferred path — direct Anthropic vision (needs a valid key) */
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',   /* fast — fits the 10s window */
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'url', url: imageUrl } },
                { type: 'text', text: DESCRIBE_PROMPT },
              ],
            }],
          }),
        });
        const data = await r.json();
        if (!data?.error) text = data?.content?.[0]?.text || '';
      }
      if (!text) {
        /* fal path — vision through the SAME FAL_KEY the images use, so no
           extra account is ever needed. any-llm relays to a vision model. */
        if (!FAL_KEY) return json({ error: 'FAL_KEY not configured' }, 500);
        const r = await fetch('https://fal.run/fal-ai/any-llm/vision', {
          method: 'POST',
          headers: { Authorization: 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-flash-1.5',
            prompt: DESCRIBE_PROMPT,
            image_url: imageUrl,
          }),
        });
        const data = await r.json();
        if (data?.detail || data?.error)
          return json({ error: 'fal-llm: ' + JSON.stringify(data.detail || data.error).slice(0, 200) }, 502);
        text = data?.output || '';
      }
      /* the model answers with bare JSON; tolerate stray fencing */
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: 'no json in reply', raw: String(text).slice(0, 200) }, 502);
      return json(JSON.parse(m[0]));
    }

    if (action === 'archive') {
      const { a, b, result_url, text } = body;
      if (!/^data:image\//.test(a || '') || !/^data:image\//.test(b || ''))
        return json({ error: 'bad uploads' }, 400);
      if (!/^https:\/\//.test(result_url || '')) return json({ error: 'bad result_url' }, 400);

      const store = getStore('mixes');
      /* ISO timestamp leads the id so a plain key-sort is chronological */
      const id = new Date().toISOString().replace(/[:.]/g, '-') +
                 '-' + Math.random().toString(36).slice(2, 8);

      /* pull the result bytes NOW — fal's hosted URLs are not forever */
      let resultData = null;
      try {
        const r = await fetch(result_url);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const mime = r.headers.get('content-type') || 'image/png';
          resultData = 'data:' + mime + ';base64,' + buf.toString('base64');
        }
      } catch { /* keep the URL-only record rather than losing the mix */ }

      await store.set(id + '/a', a);
      await store.set(id + '/b', b);
      if (resultData) await store.set(id + '/result', resultData);
      await store.setJSON(id + '/meta', {
        at: new Date().toISOString(),
        result_url,
        has_result_copy: !!resultData,
        text: text || null,
      });
      return json({ ok: true, id });
    }

    if (action === 'archive-list' || action === 'archive-get' || action === 'archive-delete') {
      const gate = process.env.ARCHIVE_KEY;
      if (gate && body.k !== gate) return json({ error: 'wrong key' }, 403);
      const store = getStore('mixes');

      if (action === 'archive-delete') {
        const id = String(body.id || '');
        if (!/^[\w-]+$/.test(id)) return json({ error: 'bad id' }, 400);
        await Promise.all(['/meta', '/a', '/b', '/result'].map((s) =>
          store.delete(id + s).catch(() => {})));
        return json({ ok: true, deleted: id });
      }

      if (action === 'archive-list') {
        const { blobs } = await store.list();
        const ids = [...new Set(blobs.map((b) => b.key.split('/')[0]))].sort().reverse();
        const items = await Promise.all(ids.slice(0, 200).map(async (id) => {
          const meta = await store.get(id + '/meta', { type: 'json' }).catch(() => null);
          return { id, ...(meta || {}) };
        }));
        return json({ items });
      }

      const id = String(body.id || '');
      if (!/^[\w-]+$/.test(id)) return json({ error: 'bad id' }, 400);
      const [meta, a, b, result] = await Promise.all([
        store.get(id + '/meta', { type: 'json' }).catch(() => null),
        store.get(id + '/a').catch(() => null),
        store.get(id + '/b').catch(() => null),
        store.get(id + '/result').catch(() => null),
      ]);
      if (!meta) return json({ error: 'not found' }, 404);
      return json({ id, ...meta, a, b, result });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 502);
  }
};
