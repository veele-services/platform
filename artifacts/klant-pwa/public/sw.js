self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {
      title: "Veele Services",
      body: "Er staat een nieuwe melding voor u klaar.",
      href: "/meldingen",
    };
  }

  try {
    const payload = event.data.json();
    return {
      title: payload.title || "Veele Services",
      body: payload.body || "Er staat een nieuwe melding voor u klaar.",
      href: payload.href || payload.url || "/meldingen",
      tag: payload.tag,
      data: payload,
    };
  } catch {
    return {
      title: "Veele Services",
      body: event.data.text(),
      href: "/meldingen",
    };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
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
  const fallback = "/meldingen";
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
