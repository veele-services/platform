import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

function worker() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const show = vi.fn(async () => undefined), open = vi.fn(async () => undefined), match = vi.fn(async () => []), notices = vi.fn(async () => []);
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), { URL, self: { location: { origin: "https://tenant.staging.fieldgrid.nl" }, addEventListener: (name: string, fn: (event: Record<string, unknown>) => void) => { listeners[name] = fn; }, registration: { showNotification: show, getNotifications: notices }, clients: { matchAll: match, openWindow: open } } });
  return { listeners, show, open, match, notices };
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
