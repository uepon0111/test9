```javascript
const SHELL_CACHE = 'sekai-music-shell-v1';
const DATA_CACHE = 'sekai-music-data-v1';
const SW_VERSION = 1;

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, DATA_CACHE]);

        const keys = await caches.keys();

        await Promise.all(
            keys
                .filter(
                    key =>
                        key.startsWith('sekai-music-shell-') ||
                        key.startsWith('sekai-music-data-')
                )
                .filter(key => !keep.has(key))
                .map(key => caches.delete(key))
        );

        const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        const shell = await caches.open(SHELL_CACHE);

        await Promise.all(
            clients.map(async client => {
                if (
                    !client.url ||
                    client.url.startsWith('about:') ||
                    client.url.startsWith('blob:')
                ) {
                    return;
                }

                try {
                    const response = await fetch(client.url, {
                        cache: 'no-store'
                    });

                    if (response.ok) {
                        await shell.put(client.url, response.clone());
                    }
                } catch (e) {
                    // オフライン時などは無視
                }
            })
        );

        await self.clients.claim();
    })());
});

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);

        if (response.ok) {
            await cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        throw error;
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    const isNavigation = request.mode === 'navigate';

    const isDbJson =
        url.origin === 'https://sekai-world.github.io' &&
        url.pathname.startsWith('/sekai-master-db-diff/') &&
        url.pathname.endsWith('.json');

    if (isNavigation) {
        event.respondWith(
            networkFirst(request, SHELL_CACHE)
        );
        return;
    }

    if (isDbJson) {
        event.respondWith(
            networkFirst(request, DATA_CACHE)
        );
    }
});
```
