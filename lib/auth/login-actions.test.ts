import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(),
  signInWithPassword: vi.fn(), access: vi.fn(), headers: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("@/lib/auth/login-access", () => ({ getLoginAccess: mocks.access }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

import { loginOtp, signIn } from "@/app/login/actions";
import type { LoginWorkspace } from "./login-destination";

function form(intent: string, email = "user@example.test", next?: string, code?: string) {
  const input = new FormData();
  input.set("intent", intent); input.set("email", email);
  if (next !== undefined) input.set("next", next);
  if (code !== undefined) input.set("code", code);
  return input;
}

describe("universal email OTP login actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    vi.stubEnv("APP_URL", "https://staging.fieldgrid.nl");
    vi.stubEnv("DEPLOY_TARGET", "staging");
    mocks.headers.mockResolvedValue(new Headers());
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user" }, session: { access_token: "fictitious-access" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.access.mockResolvedValue({ workspaces: ["/app"] });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each(["/app", "/staff", "/klant", "/platform"])("requests a non-creating code for %s without exposing account access", async next => {
    const result = await loginOtp({ step: "email" }, form("request", " User@Example.test ", next));
    expect(result).toMatchObject({ step: "code", email: "user@example.test", next, requestedAt: 1_800_000_000_000 });
    expect(result.notice).toContain("eenmalige inlogcode");
    expect(result.notice).not.toMatch(/zes|six|6/);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "user@example.test", options: { emailRedirectTo: "https://staging.fieldgrid.nl/login", shouldCreateUser: false } });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("preserves only the trusted hostname for tenant mail branding, never browser-supplied tenant fields", async () => {
    mocks.headers.mockResolvedValueOnce(new Headers({ "x-fieldgrid-tenant-slug": "tenant-a" }));
    const input = form("request", " User@Example.test ", "/klant?account=10000000-0000-4000-8000-000000000001");
    input.set("tenant", "tenant-b"); input.set("redirectTo", "https://evil.invalid"); input.set("role", "platform_admin");
    await loginOtp({ step: "email" }, input);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "user@example.test", options: { emailRedirectTo: "https://tenant-a.staging.fieldgrid.nl/login", shouldCreateUser: false } });
  });

  it("never uses a local fallback when the required staging origin is absent", async () => {
    vi.stubEnv("APP_URL", "");
    const result = await loginOtp({ step: "email" }, form("request"));
    expect(result).toMatchObject({ step: "code", notice: expect.stringContaining("Als dit account toegang heeft") });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("unknown accounts, provider errors and thrown network errors return the same non-enumerating state", async () => {
    const delivered = await loginOtp({ step: "email" }, form("request"));
    mocks.signInWithOtp.mockResolvedValueOnce({ error: { message: "private account/provider details" } });
    expect(await loginOtp({ step: "email" }, form("request"))).toEqual(delivered);
    mocks.signInWithOtp.mockRejectedValueOnce(new Error("private network/provider details"));
    expect(await loginOtp({ step: "email" }, form("request"))).toEqual(delivered);
  });

  it.each(["", "invalid", "a".repeat(321) + "@example.test"])("invalid email %j never calls Auth", async email => {
    expect(await loginOtp({ step: "email" }, form("request", email))).toMatchObject({ step: "email", error: expect.any(String) });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([
    ["/staff/werkbon/123?tab=taken", ["/staff"]],
    ["/app/aanvragen?status=new", ["/app"]],
    ["/klant?account=10000000-0000-4000-8000-000000000001&view=objects", ["/klant"]],
    ["/platform/notificaties?tab=tenants", ["/platform"]],
  ] as Array<[string, LoginWorkspace[]]>)("verifies the code and preserves authorized destination %s", async (next, workspaces) => {
    mocks.access.mockResolvedValueOnce({ workspaces });
    await expect(loginOtp({ step: "code" }, form("verify", " User@Example.test ", next, "123456"))).rejects.toThrow(`redirect:${next}`);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "user@example.test", token: "123456", type: "email" });
    expect(mocks.access).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(["012345", "0123456", "01234567", "012345678", "0123456789"])("passes the full supported email code %s to Auth and rechecks workspace rights", async code => {
    await expect(loginOtp({ step: "code" }, form("verify", "user@example.test", "/app", code))).rejects.toThrow("redirect:/app");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "user@example.test", token: code, type: "email" });
    expect(mocks.access).toHaveBeenCalledOnce();
  });

  it.each(["12345", "12345678901", "abcdef", "12 456", "１２３４５６"])("rejects an unsupported email code %j before verifying", async code => {
    expect(await loginOtp({ step: "code" }, form("verify", "user@example.test", "/staff", code))).toMatchObject({ step: "code", next: "/staff", error: expect.stringContaining("ongeldig of verlopen") });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it.each(["01234567", "0123456789"])("clears the session when a supported longer code %s verifies but workspace access is revoked", async code => {
    mocks.access.mockResolvedValueOnce({ workspaces: [] });
    expect(await loginOtp({ step: "code" }, form("verify", "user@example.test", "/klant", code))).toMatchObject({ error: expect.stringContaining("ongeldig of verlopen") });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "user@example.test", token: code, type: "email" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    { error: { message: "private verification details" }, data: { user: null, session: null } },
    { error: null, data: { user: null, session: { access_token: "fictitious-access" } } },
    { error: null, data: { user: { id: "user" }, session: null } },
  ])("never looks up workspace rights for incomplete or failed verification", async result => {
    mocks.verifyOtp.mockResolvedValueOnce(result);
    expect(await loginOtp({ step: "code" }, form("verify", "user@example.test", "/app", "123456"))).toMatchObject({ error: expect.stringContaining("ongeldig of verlopen") });
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it.each([
    ["/staff", ["/app"]], ["/app/personeel", ["/staff"]],
    ["/klant", ["/app"]], ["/platform", ["/staff", "/app", "/klant"]],
    ["/staff", []],
  ] as Array<[string, LoginWorkspace[]]>)("clears the newly verified session for denied explicit destination %s", async (next, workspaces) => {
    mocks.access.mockResolvedValueOnce({ workspaces });
    expect(await loginOtp({ step: "code" }, form("verify", "user@example.test", next, "123456"))).toMatchObject({ error: expect.stringContaining("ongeldig of verlopen") });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each(["/staff", "/klant", "/platform"] as LoginWorkspace[])("allows the generic login home to select only the currently authorized %s workspace", async workspace => {
    mocks.access.mockResolvedValueOnce({ workspaces: [workspace] });
    await expect(loginOtp({ step: "code" }, form("verify", "user@example.test", undefined, "123456"))).rejects.toThrow(`redirect:${workspace}`);
  });

  it.each(["//evil.invalid", "https://evil.invalid", "/\\evil.invalid", "/app/../../platform", "/auth/reset", "/api/worker"])("never redirects to unsafe or out-of-workspace next %j", async next => {
    mocks.access.mockResolvedValueOnce({ workspaces: ["/staff"] });
    const result = loginOtp({ step: "code" }, form("verify", "user@example.test", next, "123456"));
    if (next === "/app/../../platform") {
      expect(await result).toMatchObject({ error: expect.any(String) });
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    } else await expect(result).rejects.toThrow("redirect:/staff");
  });

  it("fails closed and clears the session when live tenant or account rights cannot be rechecked", async () => {
    mocks.access.mockRejectedValueOnce(new Error("private database details"));
    const result = await loginOtp({ step: "code" }, form("verify", "user@example.test", "/app", "123456"));
    expect(result.error).toContain("ongeldig of verlopen");
    expect(JSON.stringify(result)).not.toContain("database");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps verification transport failures generic instead of surfacing Auth or provider details", async () => {
    mocks.verifyOtp.mockRejectedValueOnce(new Error("PRIVATE verification transport details"));
    const result = await loginOtp({ step: "code" }, form("verify", "user@example.test", "/app", "123456"));
    expect(result.error).toContain("ongeldig of verlopen");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("keeps stale password action IDs harmless and never invokes password Auth", async () => {
    expect((await signIn()).error).toContain("eenmalige e-mailcode");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
