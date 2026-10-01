import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ MAIL_MARKETING_ENABLED: "false" }) }));
import { withMailTransport } from "./transport";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", attempt = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input = { policy: { kind: "security", flow: "auth_hook", tenantId: id } as const, deliveryKey: "fixture", to: "fixture@example.test", subject: "SECRET code" };
beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockImplementation(async (_db, _name, args) => args.operation === "begin" ? { allowed: true, id, attempt_id: attempt } : { ok: true }); });
it("does not send when the durable mail stop blocks an Auth mail", async () => {
  mocks.rpc.mockResolvedValue({ allowed: false, id, reason: "email_emergency_stop" }); const send = vi.fn();
  await expect(withMailTransport(input, send)).rejects.toMatchObject({ name: "NotificationSuppressedError" }); expect(send).not.toHaveBeenCalled();
});
it("passes opaque ID to provider and stores generic security subjects only", async () => {
  const send = vi.fn(async () => ({ id: "provider" })); await withMailTransport(input, send);
  expect(send).toHaveBeenCalledWith(id); expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("SECRET");
  expect(mocks.rpc.mock.calls.at(-1)?.[2]).toMatchObject({ operation: "finish", input: { id, attempt_id: attempt, outcome: "accepted", provider_id: "provider" } });
});
it("records timeout uncertainty and rejects a failed acceptance write", async () => {
  await expect(withMailTransport(input, async () => { throw new Error("timeout"); })).rejects.toThrow("timeout");
  expect(mocks.rpc.mock.calls.at(-1)?.[2].input.outcome).toBe("uncertain");
  mocks.rpc.mockImplementation(async (_db, _name, args) => args.operation === "begin" ? { allowed: true, id, attempt_id: attempt } : { ok: false });
  await expect(withMailTransport(input, async () => ({ id: "accepted" }))).rejects.toThrow("onzeker");
});
it("the runtime marketing-off flag cannot be bypassed by database settings", async () => {
  const send = vi.fn();
  await expect(withMailTransport({ ...input, policy: { kind: "notification", tenantId: id, type: "manual.tenant", context: "customer", sourceId: id } }, send)).rejects.toMatchObject({ reason: "marketing_environment_disabled" });
  expect(send).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
