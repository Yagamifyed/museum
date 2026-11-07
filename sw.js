// The Museum's cache in the browser, registered by app.js on the live site.
//
// Images, share cards and fonts: shown from the cache at once and refreshed in
// the background, so a repeat visit doesn't wait for the network and a work
// seen once still shows offline. Pages, code and data: from the network first,
// so a new arrangement or a fix shows straight away; the cache only steps in
// when there's no connection. Videos are left to the browser (it fetches them
// in ranges). Bump VERSION to drop everything cached before.

const VERSION = 'museum-1';
const STATIC = /^\/(media|fonts|w)\/.+\.(webp|svg|png|jpe?g|gif|woff2)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  if (url.pathname.endsWith('.mp4')) return;
  e.respondWith(STATIC.test(url.pathname) ? fromCache(e, req) : fromNetwork(req));
});

async function fromCache(e, req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

async function fromNetwork(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
