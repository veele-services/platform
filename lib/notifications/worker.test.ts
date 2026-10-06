import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), push: vi.fn(), permit: vi.fn(), vapid: vi.fn(), mail: vi.fn(), render: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { white_label_enabled: false }, error: null }) }) }) }) }) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ VAPID_PUBLIC_KEY: "fixture-public", VAPID_PRIVATE_KEY: "fixture-private", VAPID_SUBJECT: "mailto:fixture@example.invalid", SENDGRID_API_KEY: "fixture-mail-key", SENDGRID_FROM_EMAIL: "sender@example.invalid" }) }));
vi.mock("@/lib/providers/sendgrid", () => ({ sendEmail: mock.mail, SendGridDeliveryError: class extends Error {} }));
vi.mock("@/lib/communications/email", () => ({ renderTenantEmailHtml: mock.render }));
vi.mock("@/lib/tenancy/hostname", () => ({ tenantAppUrl: (slug: string, path: string) => `https://${slug}.example.invalid${path}` }));
vi.mock("./brand-asset", () => ({ freezeEmailLogo: vi.fn() }));
vi.mock("../tickets/rpc", () => ({ ticketRpc: mock.rpc }));
vi.mock("web-push", () => ({ default: { sendNotification: mock.push, setVapidDetails: mock.vapid } }));
vi.mock("./provider-policy", async importOriginal => ({ ...await importOriginal<object>(), withNotificationProviderPermit: mock.permit }));

import { processNotificationDeliveryClaims } from "./worker";

const id = "99111111-1111-4111-8111-111111111111";
const snapshot = {
  title: "PRIVATE-CAMPAIGN-TITLE", body: "PRIVATE-SOURCE-BODY", pushTitle: "Een update van de organisatie", pushBody: "Bekijk uw beveiligde omgeving.",
  actionLabel: "Bekijken", path: "/staff/notificaties", recipient: "fixture@example.invalid", slug: "fixture", priority: "normal",
  brand: { company: "Fictieve organisatie", primary: "#222C35", accent: "#41AC42" },
};
const delivery = { id, tenantId: id, type: "manual.tenant", context: "staff", recipientUserId: id, channel: "push", ttl_seconds: 237, snapshot, transport: null, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/fictitious", keys: { p256dh: "fixture-key", auth: "fixture-auth" } } };

beforeEach(() => {
  vi.clearAllMocks();
  mock.push.mockResolvedValue({ statusCode: 201 });
  mock.mail.mockResolvedValue({ id: "fictitious-provider" });
  mock.render.mockReturnValue("<p>Fictitious notification</p>");
  mock.permit.mockImplementation(async (_input: unknown, submit: () => Promise<unknown>) => submit());
  mock.rpc.mockImplementation(async (_db: unknown, name: string) => name === "notification_delivery_begin" ? delivery : true);
});

it.each([null, id])("customer email uses a reachable destination for recipient %s", async recipientUserId => {
  mock.rpc.mockImplementation(async (_db: unknown, name: string, args: { input?: unknown }) =>
    name === "notification_delivery_begin" ? { ...delivery, context: "customer", channel: "email", recipientUserId, snapshot: { ...snapshot, path: "/klant/notificaties" } }
      : name === "notification_delivery_freeze" ? args.input : true);
  expect((await processNotificationDeliveryClaims([{ id, lease: id }])).sent).toBe(1);
  expect(mock.render).toHaveBeenCalledWith(expect.objectContaining({
    targetUrl: `https://fixture.example.invalid${recipientUserId ? "/klant/notificaties" : "/"}`,
    targetLabel: recipientUserId ? "Bekijken" : "Website openen",
  }));
  expect(mock.mail).toHaveBeenCalledOnce();
  expect(mock.push).not.toHaveBeenCalled();
  if (!recipientUserId) expect(mock.mail.mock.calls[0][0].text).not.toContain("/klant/");
});

describe("central push transport", () => {
  it("uses frozen safe channel-template text and actual remaining TTL, never full source prose", async () => {
    expect((await processNotificationDeliveryClaims([{ id, lease: id }])).sent).toBe(1);
    const payload = JSON.parse(mock.push.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: snapshot.pushTitle, body: snapshot.pushBody, context: "staff", tag: `notification-${id}` });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE-");
    expect(mock.push.mock.calls[0][2]).toEqual({ TTL: 237, urgency: "normal", timeout: 15000 });
    expect(mock.permit).toHaveBeenCalledOnce();
  });

  it("a newly published safe template changes actual push content without a universal TTL", async () => {
    mock.rpc.mockImplementation(async (_db: unknown, name: string) => name === "notification_delivery_begin" ? { ...delivery, ttl_seconds: 13, snapshot: { ...snapshot, pushBody: "Een nieuwe veilige formulering." } } : true);
    await processNotificationDeliveryClaims([{ id, lease: id }]);
    expect(JSON.parse(mock.push.mock.calls[0][1]).body).toBe("Een nieuwe veilige formulering.");
    expect(mock.push.mock.calls[0][2].TTL).toBe(13);
  });

  it("historical snapshots without safe push fields retain their generic private projection", async () => {
    mock.rpc.mockImplementation(async (_db: unknown, name: string) => name === "notification_delivery_begin" ? { ...delivery, snapshot: { ...snapshot, pushTitle: undefined, pushBody: undefined } } : true);
    await processNotificationDeliveryClaims([{ id, lease: id }]);
    const payload = JSON.parse(mock.push.mock.calls[0][1]);
    expect(payload.title).toBe(snapshot.brand.company);
    expect(payload.body).toBe("Er staat een nieuwe melding klaar in de beveiligde omgeving.");
    expect(JSON.stringify(payload)).not.toContain("PRIVATE-");
  });
});
