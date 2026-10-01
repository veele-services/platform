import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("../tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
import { NotificationDeferredError, NotificationSuppressedError, withNotificationProviderPermit } from "./provider-policy";

const id = "11000000-0000-4000-8000-000000000001";
const input = { policy: { kind: "notification", tenantId: id, type: "invoice.available", context: "customer", sourceId: id } as const, channel: "email" as const, deliveryKey: "fictitious-invoice-delivery", recipient: "fixture@example.invalid" };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockImplementation(async (_db, _name, args) => args.operation === "begin" ? { allowed: true, id } : { ok: true }); });
it("never calls the provider when policy suppresses an otherwise valid message", async () => {
  mocks.rpc.mockResolvedValue({ allowed: false, reason: "global_off" }); const send = vi.fn();
  await expect(withNotificationProviderPermit(input, send)).rejects.toBeInstanceOf(NotificationSuppressedError);
  expect(send).not.toHaveBeenCalled(); expect(mocks.rpc).toHaveBeenCalledOnce();
});
it("defers quiet hours with a concrete retry instant without submitting a provider request",async()=>{
 mocks.rpc.mockResolvedValue({allowed:false,reason:"quiet_hours",quiet_until:"2026-10-01T07:00:00+02:00"});const send=vi.fn();
 await expect(withNotificationProviderPermit(input,send)).rejects.toBeInstanceOf(NotificationDeferredError);expect(send).not.toHaveBeenCalled();
});
it("requires a durable permit and finishes accepted only after provider acceptance", async () => {
  const send = vi.fn(async () => ({ id: "provider-fixture" }));
  expect(await withNotificationProviderPermit(input, send)).toEqual({ id: "provider-fixture" });
  expect(mocks.rpc.mock.calls[0][2]).toMatchObject({ operation: "begin", source_id: id, input: { source_kind: "mail", recipient: "fixture@example.invalid" } });
  expect(mocks.rpc.mock.calls[1][2]).toMatchObject({ operation: "finish", input: { permit_id: id, outcome: "accepted", source_kind: "mail", recipient: "fixture@example.invalid" } });
});
it.each([[429, "failed"], [400, "failed"], [408, "uncertain"], [503, "uncertain"], [0, "uncertain"]])("classifies provider status %i as %s without blindly repeating the call", async (status, outcome) => {
  const error = Object.assign(new Error("Fictitious failure"), { httpStatus: status }), send = vi.fn(async () => { throw error; });
  await expect(withNotificationProviderPermit(input, send)).rejects.toThrow("Fictitious failure");
  expect(mocks.rpc.mock.calls[1][2].input.outcome).toBe(outcome); expect(send).toHaveBeenCalledOnce();
});
it("ends an expired push endpoint without retrying it", async () => {
  await expect(withNotificationProviderPermit({ ...input, channel: "push" }, async () => { throw { statusCode: 410 }; })).rejects.toEqual({ statusCode: 410 });
  expect(mocks.rpc.mock.calls[1][2].input.outcome).toBe("cancelled");
});
it("fails closed when permit registration or acceptance recording fails", async () => {
  const send = vi.fn(async () => "accepted"); mocks.rpc.mockRejectedValueOnce(new Error("Database unavailable"));
  await expect(withNotificationProviderPermit(input, send)).rejects.toThrow(); expect(send).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({ allowed: true, id }).mockResolvedValueOnce({ ok: false });
  await expect(withNotificationProviderPermit(input, send)).rejects.toThrow("niet automatisch opnieuw"); expect(send).toHaveBeenCalledOnce();
});
it("keeps named authentication flows available while rejecting an absent classification", async () => {
  const send = vi.fn(async () => "security");
  expect(await withNotificationProviderPermit({ ...input, policy: { kind: "security", flow: "permissions_otp" } }, send)).toBe("security");
  expect(mocks.rpc).not.toHaveBeenCalled();
  await expect(withNotificationProviderPermit({ ...input, policy: undefined as never }, send)).rejects.toThrow();
  expect(send).toHaveBeenCalledOnce();
});
