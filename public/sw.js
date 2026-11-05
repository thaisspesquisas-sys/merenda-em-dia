const CACHE_VERSION = "merenda-escolar-pwa-v2";
const CORE_ASSETS = [
  "/",
  "/auth",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key !== CACHE_VERSION ? caches.delete(key) : Promise.resolve())),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache authentication or direct Supabase API mutations/tokens in Service Worker cache
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/auth/v1") ||
    url.pathname.includes("/rest/v1") ||
    url.pathname.includes("/storage/v1")
  ) {
    return;
  }

  // Navigation requests: Network-first with cached shell fallback for offline access
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, networkResp.clone());
          return networkResp;
        } catch {
          const cachedPage =
            (await caches.match(request)) ||
            (await caches.match("/")) ||
            (await caches.match("/auth"));
          if (cachedPage) return cachedPage;
          return new Response(
            "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Merenda Escolar — Modo Offline</title></head><body style='font-family:sans-serif;padding:2rem;text-align:center'><h1>Gestão da Merenda Escolar</h1><p>Você está sem conexão com a internet no momento. Reconecte-se para sincronizar os dados.</p><button onclick='location.reload()' style='padding:0.6rem 1.2rem;background:#1d5bd6;color:#fff;border:none;border-radius:6px;cursor:pointer'>Tentar novamente</button></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts, icons): Stale-While-Revalidate
  if (
    url.origin === self.location.origin ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((resp) => {
            if (resp && resp.status === 200) {
              cache.put(request, resp.clone());
            }
            return resp;
          })
          .catch(() => cached);
        return cached || (await networkPromise) || new Response("", { status: 504 });
      })(),
    );
  }
});

