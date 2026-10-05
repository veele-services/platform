import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), signOut: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), headers: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ SUPABASE_URL: "https://auth.example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictitious-public-key" }) }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { verifyAccountEmail } from "@/app/auth/verify/actions";

function form(type: string) {
  const result = new FormData();
  result.set("type", type);
  result.set("tokenHash", "a".repeat(64));
  return result;
}

describe("account confirmation never installs a browser login session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockReturnValue({ auth: mocks });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.verifyOtp.mockResolvedValue({ error: null, data: { user: { id: "fixture-user", email: "user@example.test" }, session: { access_token: "fictitious" } } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({});
  });

  it.each(["magiclink", "email", "recovery"])("rejects old %s links without consuming the token", async type => {
    expect(await verifyAccountEmail({}, form(type))).toMatchObject({ error: expect.any(String) });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each(["invite", "signup", "email_change"])("finishes %s with an isolated session and requires a fresh OTP login", async type => {
    await expect(verifyAccountEmail({}, form(type))).rejects.toThrow("redirect:/login");
    expect(mocks.createClient).toHaveBeenCalledWith("https://auth.example.test", "fictitious-public-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("requires current access to the hostname tenant before completing an invitation", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-fieldgrid-tenant-slug": "tenant-a" }));
    mocks.rpc.mockRejectedValue(new Error("private authorization detail"));
    expect(await verifyAccountEmail({}, form("invite"))).toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).toHaveBeenCalledWith({}, "email_auth_context", { target_slug: "tenant-a", actor: "fixture-user", recipient: "user@example.test", action_type: "session" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("can confirm the first secure-email-change mailbox without receiving a session", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null, data: { user: null, session: null } });
    expect(await verifyAccountEmail({}, form("email_change"))).toMatchObject({ message: expect.stringContaining("andere e-mailadres") });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("keeps token verification transport errors private", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("private transport detail"));
    const result = await verifyAccountEmail({}, form("invite"));
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
