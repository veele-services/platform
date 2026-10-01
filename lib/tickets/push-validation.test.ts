import { expect, it } from "vitest";
import { ticketPushEndpointAllowed, ticketPushRequestSchema } from "./push-validation";

it("accepts only HTTPS production browser push providers", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/fictitious", "https://updates.push.services.mozilla.com/wpush/v2/fictitious", "https://web.push.apple.com/Qfictitious", "https://wns2-par02p.notify.windows.com/w/?token=fictitious", "https://fcm.googleapis.com:443/fcm/send/fictitious"]) expect(ticketPushEndpointAllowed(endpoint)).toBe(true);
});
it("rejects local, credentialed, malformed, redirected and lookalike destinations", () => {
  for (const endpoint of ["https://127.0.0.1/push", "http://fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "https://fcm.googleapis.com.attacker.invalid/a", "https://fcm.googleapis.com@attacker.invalid/a", "https://user@fcm.googleapis.com/a", "https://fcm.googleapis.com/a#fragment", "https://fcm.googleapis.com\\@attacker.invalid/a", "https://fcm.googleapis.com/a\n", "https://notify.windows.com.evil.invalid/a", "https://push.apple.com.attacker.invalid/a"]) expect(ticketPushEndpointAllowed(endpoint)).toBe(false);
});
it("whitelists request fields and requires real key lengths for registration", () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/fictitious", keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) } };
  expect(ticketPushRequestSchema.parse({ workspace: "platform", action: "subscribe", subscription }).workspace).toBe("platform");
  expect(ticketPushRequestSchema.safeParse({ workspace: "platform", action: "subscribe", tenantId: "client-hint", subscription }).success).toBe(false);
  expect(ticketPushRequestSchema.safeParse({ workspace: "staff", action: "subscribe", subscription: { ...subscription, keys: { auth: "a", p256dh: "b" } } }).success).toBe(false);
  expect(ticketPushRequestSchema.safeParse({ workspace: "staff", action: "unsubscribe", subscription: { endpoint: subscription.endpoint } }).success).toBe(true);
});
