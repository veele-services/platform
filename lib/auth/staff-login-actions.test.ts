import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  authContext: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp, signOut: mocks.signOut } }) }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.authContext }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

import { staffOtp } from "@/app/login/actions";

const request = (email: string, next = "/staff") => {
  const form = new FormData();
  form.set("intent", "request"); form.set("email", email); form.set("next", next);
  return form;
};

const verify = (email: string, code: string, next = "/staff") => {
  const form = new FormData();
  form.set("intent", "verify"); form.set("email", email); form.set("code", code); form.set("next", next);
  return form;
};

describe("staff email OTP actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    process.env.APP_URL = "https://staging.fieldgrid.nl";
    process.env.DEPLOY_TARGET = "staging";
    mocks.headers.mockResolvedValue(new Headers());
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user" }, session: { access_token: "access", refresh_token: "refresh" } }, error: null });
    mocks.authContext.mockResolvedValue({ tenant: { roles: ["staff"] } });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("requests a non-creating OTP for the canonical staff destination", async () => {
    const result = await staffOtp({ step: "email" }, request(" Worker@Example.test ", "/staff/werkbon/123"));
    expect(result).toMatchObject({ step: "code", email: "worker@example.test", next: "/staff/werkbon/123", requestedAt: 1_800_000_000_000 });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "worker@example.test", options: { emailRedirectTo: "https://staging.fieldgrid.nl/staff", shouldCreateUser: false } });
  });

  it("does not reveal whether an account exists or delivery failed", async () => {
    const delivered = await staffOtp({ step: "email" }, request("known@example.test"));
    mocks.signInWithOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: "account/provider details must stay private" } });
    const unknown = await staffOtp({ step: "email" }, request("unknown@example.test"));
    expect({ ...unknown, email: "known@example.test" }).toEqual(delivered);
  });

  it("verifies exactly six digits and preserves only staff subroutes", async () => {
    await expect(staffOtp({ step: "code" }, verify("worker@example.test", "123456", "/staff/werkbon/123?tab=taken"))).rejects.toThrow("redirect:/staff/werkbon/123?tab=taken");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "worker@example.test", token: "123456", type: "email" });

    const invalid = await staffOtp({ step: "code" }, verify("worker@example.test", "12345", "/app"));
    expect(invalid).toMatchObject({ step: "code", next: "/staff", error: expect.stringContaining("ongeldig of verlopen") });
  });

  it("removes a verified session when current tenant access is not staff", async () => {
    mocks.authContext.mockResolvedValueOnce({ tenant: { roles: ["planning"] } });
    const result = await staffOtp({ step: "code" }, verify("worker@example.test", "123456"));
    expect(result.error).toContain("ongeldig of verlopen");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
