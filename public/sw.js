// Keeps a copy of the game on the device so it loads fast and still opens without internet.
const CACHE = 'oliverblox-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only the game's own files. Chat and playing together always go to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const fresh = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });

  if (request.mode === 'navigate') {
    // The page itself: newest version when online, the saved one when not.
    event.respondWith(fresh.catch(() => caches.match(request, { ignoreSearch: true })));
  } else {
    // Models and code: the saved copy straight away, refreshed quietly for next time.
    event.respondWith(
      caches.match(request).then((saved) => {
        if (!saved) return fresh;
        fresh.catch(() => undefined);
        return saved;
      }),
    );
  }
});
