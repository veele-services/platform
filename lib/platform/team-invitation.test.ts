import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ APP_URL: "https://staging.fieldgrid.nl", SENDGRID_API_KEY: "fictional-test-only", SENDGRID_FROM_EMAIL: "support@fieldgrid.test", DEPLOY_TARGET: "staging" }) }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
vi.mock("@/lib/providers/sendgrid", () => ({ sendEmail: mocks.provider, SendGridDeliveryError: class extends Error {} }));
import { deliverSupportInvitation } from "./team-invitation";
const input = { userId: "11111111-1111-4111-8111-111111111111", deliveryId: "22222222-2222-4222-8222-222222222222", name: "Fictieve supportmedewerker", email: "support@example.test", version: 1 };
const db = {} as Parameters<typeof deliverSupportInvitation>[0];
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ allowed: true, email: input.email }); mocks.provider.mockResolvedValue({ id: "provider-id" }); });
it("claims exact recipient and current revision immediately before the provider", async () => {
  expect(await deliverSupportInvitation(db, input)).toEqual({});
  expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({ to: input.email, disableTracking: true, policy: { kind: "security", flow: "invitation", tenantId: null } }));
  const mail = mocks.provider.mock.calls[0][0]; expect(mail.text).toContain("https://staging.fieldgrid.nl/login?next=%2Fplatform%2Fsupport");
  expect(mocks.rpc).toHaveBeenLastCalledWith(db, "platform_team_command", expect.objectContaining({ command: "finish_delivery", input: { deliveryId: input.deliveryId, status: "sent" } }));
});
it("does not deliver a revoked or already-claimed invitation", async () => {
  mocks.rpc.mockResolvedValue({ allowed: false }); expect((await deliverSupportInvitation(db, input)).warning).toBeTruthy(); expect(mocks.provider).not.toHaveBeenCalled();
});
it("records network uncertainty without any automatic duplicate send", async () => {
  mocks.provider.mockRejectedValue(new Error("timeout")); expect((await deliverSupportInvitation(db, input)).warning).toContain("onzeker");
  expect(mocks.provider).toHaveBeenCalledTimes(1); expect(mocks.rpc).toHaveBeenLastCalledWith(db, "platform_team_command", expect.objectContaining({ input: { deliveryId: input.deliveryId, status: "uncertain" } }));
});
