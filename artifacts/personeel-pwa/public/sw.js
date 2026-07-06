const CACHE_PREFIX = "fieldgrid-personeel-pwa";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v4`;
const CONTENT_CACHE = `${CACHE_PREFIX}-content-v1`;
const APP_PREFIX = "/personeel";
const SYNC_TAG = "veele-personeel-work-order-sync";
const NOTIFICATION_ICON = `${APP_PREFIX}/icons/notification-icon.png`;
const NOTIFICATION_BADGE = `${APP_PREFIX}/icons/notification-badge.png`;
const MAX_CONTENT_PAGES = 24;

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
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              (key.startsWith(CACHE_PREFIX) || key.startsWith("veele-personeel-")) &&
              ![STATIC_CACHE, CONTENT_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

function shouldCacheResponse(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith(`${APP_PREFIX}/_next/static/`) ||
    pathname.startsWith(`${APP_PREFIX}/icons/`) ||
    pathname === `${APP_PREFIX}/manifest.json`
  );
}

function isPrivateMediaPath(pathname) {
  return pathname.startsWith(`${APP_PREFIX}/help/media/`) || pathname.startsWith(`${APP_PREFIX}/releases/media/`);
}

function isCacheableContentPath(pathname) {
  if (isPrivateMediaPath(pathname)) return false;
  if (pathname === `${APP_PREFIX}/help` || pathname === `${APP_PREFIX}/releases`) return true;
  if (/^\/personeel\/help\/[^/]+$/.test(pathname)) return true;
  if (/^\/personeel\/releases\/[^/]+$/.test(pathname)) return true;
  return false;
}

async function trimContentCache() {
  const cache = await caches.open(CONTENT_CACHE);
  const requests = await cache.keys();
  const contentRequests = requests.filter((request) => isCacheableContentPath(new URL(request.url).pathname));
  while (contentRequests.length > MAX_CONTENT_PAGES) {
    const oldest = contentRequests.shift();
    if (oldest) await cache.delete(oldest);
  }
}

async function putContentInCache(request, response) {
  if (!shouldCacheResponse(response)) return;
  const cache = await caches.open(CONTENT_CACHE);
  await cache.put(request, response.clone());
  await trimContentCache();
}

function offlineHtmlResponse(pathname) {
  const isDetail = /^\/personeel\/(?:help|releases)\/[^/]+$/.test(pathname);
  const title = isDetail ? "Offline versie niet beschikbaar" : "Offline";
  const body = isDetail
    ? "Deze pagina is nog niet lokaal opgeslagen. Open het artikel of de release een keer terwijl je online bent."
    : "Je bent offline. Eerder geopende helpartikelen en release notes blijven beschikbaar via je browsergeschiedenis.";

  return new Response(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f6f8fb;color:#081d3a;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:520px;border:1px solid #dbe4ef;border-radius:18px;background:#fff;padding:24px;box-shadow:0 12px 40px rgba(8,29,58,.08)}h1{margin:0;font-size:24px}p{line-height:1.6;color:#52657d}a{color:#087c79;font-weight:800}</style></head><body><main class="wrap"><section class="card"><h1>${title}</h1><p>${body}</p><p><a href="${APP_PREFIX}/help">Terug naar Help</a></p></section></main></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Fieldgrid-Offline": "1",
      },
    },
  );
}

async function networkFirstContent(request) {
  try {
    const response = await fetch(request);
    await putContentInCache(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineHtmlResponse(new URL(request.url).pathname);
  }
}

async function networkOnlyWithOfflineState(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineHtmlResponse(new URL(request.url).pathname);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type !== "opaque") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAppPath = url.pathname === APP_PREFIX || url.pathname.startsWith(`${APP_PREFIX}/`);
  if (!isAppPath) return;

  if (isPrivateMediaPath(url.pathname)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      isCacheableContentPath(url.pathname)
        ? networkFirstContent(event.request)
        : networkOnlyWithOfflineState(event.request),
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
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
