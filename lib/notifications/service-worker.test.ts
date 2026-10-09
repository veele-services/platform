import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const show = vi.fn(async () => undefined), open = vi.fn(async () => undefined), match = vi.fn(async () => []), notices = vi.fn(async () => []);
  const addAll = vi.fn(async (_paths: string[]) => { void _paths; }), staticMatch = vi.fn(async () => "public-brand"), cacheOpen = vi.fn(async () => ({ addAll, match: staticMatch })), cacheMatch = vi.fn(async () => "public-offline"), cacheDelete = vi.fn(async () => true), cacheKeys = vi.fn(async () => ["fieldgrid-shell-v1", "fieldgrid-shell-v2", "unrelated-application"]), fetch = vi.fn(async () => "live-network"), claim = vi.fn(async () => undefined), skipWaiting = vi.fn(async () => undefined);
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), { URL, fetch, caches: { open: cacheOpen, match: cacheMatch, delete: cacheDelete, keys: cacheKeys }, self: { location: { origin: "https://tenant.staging.fieldgrid.nl" }, addEventListener: (name: string, fn: (event: Record<string, unknown>) => void) => { listeners[name] = fn; }, skipWaiting, registration: { showNotification: show, getNotifications: notices }, clients: { claim, matchAll: match, openWindow: open } } });
  return { listeners, show, open, match, notices, addAll, cacheOpen, cacheMatch, cacheDelete, fetch, staticMatch };
}
async function emit(fn: (event: Record<string, unknown>) => void, event: Record<string, unknown>) { let pending: Promise<unknown> | undefined; fn({ ...event, waitUntil: (value: Promise<unknown>) => { pending = value; } }); await pending; }
it("uses generic fallback for invalid push JSON and bounds displayed fields", async () => {
  const w = worker(); await emit(w.listeners.push, { data: { json: () => { throw new Error(); } } });
  expect(w.show.mock.calls[0]).toMatchObject(["Fieldgrid", { data: { target: "/staff" } }]);
});
it.each(["https://attacker.invalid/app", "//attacker.invalid/staff", "/staff/../api/pay", "/staff\\evil", "/auth/confirm"])("never navigates an untrusted target %s", async target => {
  const w = worker(); await emit(w.listeners.push, { data: { json: () => ({ title: "Update", target, context: "backoffice" }) } });
  expect(w.show.mock.calls[0]).toMatchObject(["Update", { data: { target: "/app" } }]);
});
it("retains stable deduplication tag and focuses the correct same-origin context", async () => {
  const w = worker(), focus = vi.fn(async () => undefined), navigate = vi.fn(async () => ({ focus }));
  w.match.mockResolvedValue([{ url: "https://tenant.staging.fieldgrid.nl/app", navigate }] as never);
  await emit(w.listeners.push, { data: { json: () => ({ title: "Update", target: "/app/notificaties?item=fixture", context: "backoffice", tag: "notification-fixture" }) } });
  expect(w.show.mock.calls[0]).toMatchObject(["Update", { tag: "notification-fixture", renotify: false }]);
  await emit(w.listeners.notificationclick, { notification: { close: vi.fn(), data: { target: "/app/notificaties?item=fixture" } } });
  expect(navigate).toHaveBeenCalledWith("https://tenant.staging.fieldgrid.nl/app/notificaties?item=fixture"); expect(focus).toHaveBeenCalledOnce(); expect(w.open).not.toHaveBeenCalled();
});
it("precaches only repository-owned public assets and removes only previous Fieldgrid shells", async () => {
  const w = worker();
  await emit(w.listeners.install, {});
  expect(w.addAll.mock.calls[0][0]).toEqual(["/offline.html", "/favicon.svg", "/branding/fieldgrid-logo.svg", "/branding/fieldgrid-icon-192.png"]);
  expect(JSON.stringify(w.addAll.mock.calls)).not.toMatch(/manifest|api|\/staff|auth/);
  await emit(w.listeners.activate, {});
  expect(w.cacheDelete).toHaveBeenCalledExactlyOnceWith("fieldgrid-shell-v1");
});
it.each(["/staff", "/staff/notificaties", "/app", "/klant", "/platform", "/login", "/auth/verify"])("keeps authenticated navigation network-only without caching: %s", async path => {
  const w = worker(); let response!: Promise<unknown>;
  const request = { method: "GET", mode: "navigate", url: `https://tenant.staging.fieldgrid.nl${path}` };
  w.listeners.fetch({ request, respondWith: (result: Promise<unknown>) => { response = result; } });
  expect(await response).toBe("live-network");
  expect(w.fetch).toHaveBeenCalledExactlyOnceWith(request);
  expect(w.cacheOpen).not.toHaveBeenCalled(); expect(w.cacheMatch).not.toHaveBeenCalled();
});
it("shows the generic offline shell only after network failure and leaves API/RSC/assets untouched", async () => {
  const w = worker(); let response!: Promise<unknown>;
  w.fetch.mockRejectedValue(new Error("offline"));
  w.listeners.fetch({ request: { method: "GET", mode: "navigate" }, respondWith: (result: Promise<unknown>) => { response = result; } });
  expect(await response).toBe("public-offline"); expect(w.cacheMatch).toHaveBeenCalledExactlyOnceWith("/offline.html");
  for (const url of ["/api/private", "/staff?_rsc=fixture", "/staff/manifest.webmanifest", "/staff/pwa/icon-192.png"]) {
    const respondWith = vi.fn(); w.listeners.fetch({ request: { url: `https://tenant.staging.fieldgrid.nl${url}`, method: "GET", mode: "cors" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
it("uses only a fixed same-origin staff icon for notification branding", async () => {
  const w = worker(); await emit(w.listeners.push, { data: { json: () => ({ context: "staff", icon: "https://attacker.invalid/track.png" }) } });
  expect(w.show.mock.calls[0]).toMatchObject(["Fieldgrid", { icon: "/staff/pwa/icon-192.png", badge: "/staff/pwa/icon-192.png" }]);
});
it("serves the fixed offline Fieldgrid logo from its own public shellcache", async () => {
  const w = worker(); let response!: Promise<unknown>;
  w.listeners.fetch({ request: { method: "GET", mode: "cors", url: "https://tenant.staging.fieldgrid.nl/branding/fieldgrid-logo.svg" }, respondWith: (result: Promise<unknown>) => { response = result; } });
  expect(await response).toBe("public-brand");
  expect(w.cacheOpen).toHaveBeenCalledExactlyOnceWith("fieldgrid-shell-v2");
  expect(w.staticMatch).toHaveBeenCalledOnce(); expect(w.fetch).not.toHaveBeenCalled();
  for (const url of ["https://attacker.invalid/branding/fieldgrid-logo.svg", "https://tenant.staging.fieldgrid.nl/branding/fieldgrid-logo.svg?private=fixture"]) {
    const respondWith = vi.fn(); w.listeners.fetch({ request: { method: "GET", mode: "cors", url }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
