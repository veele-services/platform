// Minimal service worker for PWA installability.
// Caches the app shell on install and serves from cache when offline.

const CACHE = "veele-personeel-v1";

const PRECACHE = [
  "/personeel",
  "/personeel/manifest.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Only cache same-origin requests under /personeel
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "Veele Services",
      body: "Er staat een nieuwe melding voor je klaar.",
      href: "/personeel/meldingen",
    };
  }

  try {
    const payload = event.data.json();
    return {
      title: payload.title || "Veele Services",
      body: payload.body || "Er staat een nieuwe melding voor je klaar.",
      href: payload.href || payload.url || "/personeel/meldingen",
      tag: payload.tag,
      data: payload,
    };
  } catch {
    return {
      title: "Veele Services",
      body: event.data.text(),
      href: "/personeel/meldingen",
    };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      badge: "/personeel/icons/icon-192.png",
      icon: "/personeel/icons/icon-192.png",
      tag: payload.tag,
      data: {
        href: payload.href,
        ...(payload.data || {}),
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const fallback = "/personeel/meldingen";
  const href = event.notification.data?.href || fallback;
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client && client.url === targetUrl) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
