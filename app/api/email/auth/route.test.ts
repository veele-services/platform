import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), env: { APP_URL: "https://staging.fieldgrid.nl", DEPLOY_TARGET: "staging", SENDGRID_FROM_EMAIL: "noreply@example.test", SUPABASE_SEND_EMAIL_HOOK_SECRET: `v1,whsec_${Buffer.alloc(32, 7).toString("base64")}` } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => mocks.env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { white_label_enabled: false }, error: null }) }) }) }) }) }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
vi.mock("@/lib/providers/sendgrid", () => ({ sendEmail: mocks.send, NotificationSuppressedError: class extends Error {} }));
import { POST } from "./route";

function request(type = "recovery", signature = true, destination = "https://fixture.staging.fieldgrid.nl/auth/confirm") {
  const raw = JSON.stringify({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "test@example.test", new_email: "new@example.test" }, email_data: { email_action_type: type, redirect_to: destination, token: "123456", token_new: "654321", token_hash: "a".repeat(64), ...(type === "email_change" ? { token_hash_new: "b".repeat(64) } : {}) } });
  const timestamp = String(Math.floor(Date.now() / 1000)), id = "fictitious-hook-id", sig = createHmac("sha256", Buffer.alloc(32, 7)).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return new Request(`${mocks.env.APP_URL}/api/email/auth`, { method: "POST", body: raw, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature ? sig : "invalid"}` } });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.send.mockResolvedValue({ id: "fictitious-provider" });
  mocks.rpc.mockImplementation(async (_db, name, args) => name === "email_auth_login_resolve" ? args.target_slug : name === "email_auth_context" ? { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", company: "FICTITIOUS", primary: "#222C35", accent: "#41AC42", logo: false } : args.operation === "begin" ? { claimed: true } : { ok: true });
});
describe("signed Auth mail endpoint", () => {
  it("retains the server prepared tenant when Auth sanitizes its redirect to the platform", async () => {
    mocks.rpc.mockImplementation(async (_db, name, args) => name === "email_auth_login_resolve" ? "fixture" : name === "email_auth_context" ? { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", company: "FICTITIOUS", primary: "#223D53", accent: "#389447", logo: true } : args.operation === "begin" ? { claimed: true } : { ok: true });
    expect((await POST(request("magiclink", true, "https://staging.fieldgrid.nl/"))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "email_auth_login_resolve", expect.objectContaining({ target_slug: null, hook_id: "fictitious-hook-id" }));
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "email_auth_context", expect.objectContaining({ target_slug: "fixture" }));
    const mail = mocks.send.mock.calls[0][0];
    expect(mail.fromName).toBe("FICTITIOUS"); expect(mail.subject).toContain("FICTITIOUS");
    expect(mail.html).toContain("#223D53"); expect(mail.html).toContain("#389447");
    expect(mail.html).toContain("https://staging.fieldgrid.nl/api/branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/email-logo");
  });
  it("rejects unsigned payloads before any DB or provider access", async () => {
    expect((await POST(request("recovery", false))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses trusted tenant context and persists no token/body in receipts", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/);
    expect(await response.json()).toEqual({});
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ disableTracking: true, policy: { kind: "security", flow: "auth_hook", tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("a".repeat(64));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("123456");
  });
  it("returns success for completed duplicates without sending again", async () => {
    mocks.rpc.mockImplementation(async (_db, name, args) => name === "email_auth_login_resolve" ? args.target_slug : name === "email_auth_context" ? { tenant_id: null, company: "Fieldgrid", primary: "#222C35", accent: "#41AC42", logo: false } : { claimed: false, state: "done" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/);
    expect(await response.json()).toEqual({});
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not retry uncertain or in-progress sends", async () => {
    mocks.rpc.mockImplementation(async (_db, name, args) => name === "email_auth_login_resolve" ? args.target_slug : name === "email_auth_context" ? { tenant_id: null, company: "Fieldgrid", primary: "#222C35", accent: "#41AC42", logo: false } : { claimed: false, state: "uncertain" });
    expect((await POST(request())).status).toBe(409); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("records partial two-address sends as uncertain and never returns provider details", async () => {
    mocks.send.mockResolvedValueOnce({ id: "first" }).mockRejectedValueOnce(new Error("PRIVATE provider details"));
    const response = await POST(request("email_change")); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.at(-1)?.[2]).toMatchObject({ operation: "uncertain" });
  });
  it("fails closed for unknown or unauthorized tenant context", async () => {
    mocks.rpc.mockRejectedValue(new Error("Unavailable")); expect((await POST(request())).status).toBe(503); expect(mocks.send).not.toHaveBeenCalled();
  });
});
