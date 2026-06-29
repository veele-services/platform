const CACHE = "veele-personeel-v3";
const APP_PREFIX = "/personeel";
const SYNC_TAG = "veele-personeel-work-order-sync";
const NOTIFICATION_ICON = `${APP_PREFIX}/icons/notification-icon.png`;
const NOTIFICATION_BADGE = `${APP_PREFIX}/icons/notification-badge.png`;

const PRECACHE = [
  APP_PREFIX,
  `${APP_PREFIX}/manifest.json`,
  `${APP_PREFIX}/icons/icon-192.png`,
  `${APP_PREFIX}/icons/icon-512.png`,
  NOTIFICATION_ICON,
  NOTIFICATION_BADGE,
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
        Promise.all(
          keys
            .filter((key) => key.startsWith("veele-personeel-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

function shouldCacheResponse(response) {
  return response && response.ok && response.type !== "opaque";
}

async function putInCache(request, response) {
  if (!shouldCacheResponse(response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallbackPath) {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    throw new Error("No offline cache available");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putInCache(request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAppPath = url.pathname === APP_PREFIX || url.pathname.startsWith(`${APP_PREFIX}/`);
  if (!isAppPath) return;

  const isStaticAsset =
    url.pathname.startsWith(`${APP_PREFIX}/_next/static/`) ||
    url.pathname.startsWith(`${APP_PREFIX}/icons/`) ||
    url.pathname === `${APP_PREFIX}/manifest.json`;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, APP_PREFIX));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "Veele Services",
      body: "Er staat een nieuwe melding voor je klaar.",
      href: "/personeel/meldingen",
      priority: "normal",
      urgency: "normal",
    };
  }

  try {
    const payload = event.data.json();
    const priority = payload.priority || payload.urgency || "normal";
    return {
      title: payload.title || "Veele Services",
      body: payload.body || "Er staat een nieuwe melding voor je klaar.",
      href: payload.href || payload.url || "/personeel/meldingen",
      tag: payload.tag,
      priority,
      urgency: payload.urgency || priority,
      data: payload,
    };
  } catch {
    return {
      title: "Veele Services",
      body: event.data.text(),
      href: "/personeel/meldingen",
      priority: "normal",
      urgency: "normal",
    };
  }
}

function normalizeAppHref(href) {
  if (!href || typeof href !== "string") return "/personeel/meldingen";
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  if (path === "/personeel" || path.startsWith("/personeel/")) return path;
  return `/personeel${path}`;
}

async function notifyClients(message) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  clientList.forEach((client) => client.postMessage(message));
}

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(notifyClients({ type: "VEELE_PROCESS_OFFLINE_QUEUE" }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "VEELE_SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "VEELE_REQUEST_OFFLINE_SYNC") {
    event.waitUntil(notifyClients({ type: "VEELE_PROCESS_OFFLINE_QUEUE" }));
  }
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const isHighPriority = payload.priority === "high" || payload.urgency === "high";
  const tag = payload.tag || `veele-${Date.now()}`;

  event.waitUntil(
    Promise.all([
      notifyClients({
        type: "VEELE_PUSH_NOTIFICATION",
        payload: {
          title: payload.title,
          body: payload.body,
          href: payload.href,
          tag,
          priority: payload.priority,
          urgency: payload.urgency,
          receivedAt: Date.now(),
          ...(payload.data || {}),
        },
      }),
      self.registration.showNotification(payload.title, {
        body: payload.body,
        badge: NOTIFICATION_BADGE,
        icon: NOTIFICATION_ICON,
        tag,
        renotify: isHighPriority,
        requireInteraction: isHighPriority,
        silent: false,
        timestamp: Date.now(),
        vibrate: isHighPriority ? [180, 80, 180, 80, 240] : [120, 60, 120],
        data: {
          href: payload.href,
          priority: payload.priority,
          urgency: payload.urgency,
          ...(payload.data || {}),
        },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const fallback = "/personeel/meldingen";
  const href = normalizeAppHref(event.notification.data?.href || fallback);
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
