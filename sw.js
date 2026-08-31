/* Sekai Music DB offline service worker.
 * Scope is the directory containing this file (GitHub Pages compatible).
 */
const SW_VERSION = 'sekai-music-db-offline-v2';
const APP_CACHE = `${SW_VERSION}-app`;
const SONG_CACHE = 'sekai-music-db-song-cache-v2';
const DB_BASE = 'https://sekai-world.github.io/sekai-master-db-diff';
const ASSET_HOST = 'storage.sekai.best';
const ASSET_PATH_PREFIX = '/sekai-jp-assets/music/jacket/';

async function cacheResource(cache, url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response && response.ok) await cache.put(url, response.clone());
  } catch (e) {
    // Installation remains successful even when an optional shell fetch fails.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const scopeUrl = new URL(self.registration.scope);
    const indexUrl = new URL('./index.html', scopeUrl).href;
    const swUrl = new URL('./sw.js', scopeUrl).href;
    await Promise.all([cacheResource(cache, indexUrl), cacheResource(cache, swUrl)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, SONG_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sekai-music-db-offline-') && !keep.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isAppNavigation(request) {
  return request.mode === 'navigate';
}

function isJacketRequest(url) {
  return url.hostname === ASSET_HOST && url.pathname.startsWith(ASSET_PATH_PREFIX);
}

function isSameOriginRequest(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isAppNavigation(request)) {
    event.respondWith((async () => {
      const appCache = await caches.open(APP_CACHE);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const indexUrl = new URL('./index.html', self.registration.scope).href;
          await appCache.put(indexUrl, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return (await appCache.match(request)) || (await appCache.match(new URL('./index.html', self.registration.scope).href)) || Response.error();
      }
    })());
    return;
  }

  if (!isJacketRequest(url) && !isSameOriginRequest(url)) return;

  event.respondWith((async () => {
    // Saved jackets are stored under their original absolute URL, so the
    // page can continue using the existing getJacketUrl() without special cases.
    const songCache = await caches.open(SONG_CACHE);
    const cached = await songCache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      return await fetch(request);
    } catch (error) {
      const appCache = await caches.open(APP_CACHE);
      return (await appCache.match(request)) || Response.error();
    }
  })());
});
