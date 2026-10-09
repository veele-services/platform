const CACHE = "fieldgrid-shell-v2";
// Public, account-independent offline shell only. Live manifests, tenant logos,
// authenticated HTML, RSC responses and APIs are deliberately never cached.
const SHELL = ["/offline.html", "/favicon.svg", "/branding/fieldgrid-logo.svg", "/branding/fieldgrid-icon-192.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("fieldgrid-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && !url.search && SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
  }
});
self.addEventListener("push", (event) => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
  const target = safeNotificationTarget(data.target, data.context);
  const title = typeof data.title === "string" ? data.title.slice(0, 100) : "Fieldgrid";
  const body = typeof data.body === "string" ? data.body.slice(0, 300) : "Er is een update beschikbaar. Open de beveiligde omgeving.";
  const tag = typeof data.tag === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(data.tag) ? data.tag : undefined;
  const icon = data.context === "staff" ? "/staff/pwa/icon-192.png" : "/branding/fieldgrid-icon-192.png";
  event.waitUntil(self.registration.showNotification(title || "Fieldgrid", { body, icon, badge: icon, ...(tag ? { tag, renotify: false } : {}), data: { target } }));
});
function safeNotificationTarget(input, context) {
  const roots = { platform: "/platform", backoffice: "/app", staff: "/staff", customer: "/klant" };
  const fallback = roots[context] || "/staff";
  if (typeof input !== "string" || input.length > 1000 || !input.startsWith("/") || input.startsWith("//") || /[\\\u0000-\u0020]/.test(input)) return fallback;
  try {
    const url = new URL(input, self.location.origin);
    if (url.origin !== self.location.origin || !/^\/(app|staff|klant|platform)(\/|$)/.test(url.pathname) || (roots[context] && url.pathname !== roots[context] && !url.pathname.startsWith(roots[context] + "/"))) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeNotificationTarget(event.notification.data?.target);
  event.waitUntil((async () => {
    const url = new URL(target, self.location.origin);
    const root = url.pathname.split("/")[1];
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => {
      try { const current = new URL(client.url); return current.origin === url.origin && current.pathname.split("/")[1] === root; } catch { return false; }
    });
    if (existing) { const navigated = await existing.navigate(url.href); if (navigated) return navigated.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
// Logout clears already displayed generic notices on this origin as well as
// the account binding on the server. Private API data is never shell-cached.
self.addEventListener("message", event => {
  if (event.data?.type !== "CLEAR_ACCOUNT_NOTIFICATIONS") return;
  event.waitUntil(self.registration.getNotifications().then(items => { for (const item of items) item.close(); }));
});
