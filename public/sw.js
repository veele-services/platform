const CACHE = "fieldgrid-shell-v1";
const SHELL = ["/offline.html", "/manifest.webmanifest", "/favicon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Fieldgrid", body: "Er is een update beschikbaar.", target: "/staff" };
  event.waitUntil(self.registration.showNotification(data.title || "Fieldgrid", { body: data.body, icon: "/favicon.svg", badge: "/favicon.svg", data: { target: data.target || "/staff" } }));
});
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.target || "/staff")); });
