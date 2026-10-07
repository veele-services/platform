vi.mock("server-only",()=>({}));
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/auth/login-access", () => ({ getLoginAccess: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { GET } from "@/app/auth/confirm/route";
import { signIn } from "@/app/login/actions";

describe("obsolete authentication entry points require OTP instead of installing sessions", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(["/app", "/staff", "/klant", "/platform", "/auth/reset", "/\\evil.invalid", "/\t/evil.invalid", "/\n/evil.invalid", "/a/..//evil.invalid", "/.//evil.invalid", "/%2e//evil.invalid"])("a legacy PKCE URL cannot exchange a code or follow next %j", async next => {
    const url = new URL("https://tenant.staging.fieldgrid.nl/auth/confirm");
    url.searchParams.set("code", "fictitious-code"); url.searchParams.set("next", next);
    const response = await GET(new NextRequest(url));
    const location = new URL(response.headers.get("location")!, url);
    expect(location.origin + location.pathname).toBe("https://tenant.staging.fieldgrid.nl/login");
    expect(location.searchParams.get("error")).toBe("otp_required");
    expect(location.searchParams.get("next")).toBe(["/app", "/staff", "/klant", "/platform"].includes(next) ? next : "/app");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("a legacy confirm request without a code also returns to the OTP login", async () => {
    expect((await GET(new NextRequest("https://tenant.staging.fieldgrid.nl/auth/confirm?next=/platform"))).headers.get("location")).toBe("/login?error=otp_required&next=%2Fplatform");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it.each([
    ["https://staging.fieldgrid.nl", "/platform"],
    ["https://tenant.staging.fieldgrid.nl", "/staff/werkbon/example?tab=taken"],
  ])("a standalone localhost request keeps the browser on %s without trusting forwarded headers", async (publicOrigin, next) => {
    const internalUrl = new URL("https://localhost:3301/auth/confirm");
    internalUrl.searchParams.set("code", "fictitious-legacy-code");
    internalUrl.searchParams.set("token_hash", "fictitious-legacy-hash");
    internalUrl.searchParams.set("type", "magiclink");
    internalUrl.searchParams.set("next", next);
    const response = await GET(new NextRequest(internalUrl, { headers: {
      host: new URL(publicOrigin).host,
      "x-forwarded-host": "evil.invalid",
      "x-forwarded-proto": "http",
      forwarded: "host=evil.invalid;proto=http",
      "x-fieldgrid-tenant-slug": "other-tenant",
    } }));
    const location = response.headers.get("location")!;
    expect(response.status).toBe(307);
    expect(location).toBe(`/login?error=otp_required&next=${encodeURIComponent(next)}`);
    const browserDestination = new URL(location, `${publicOrigin}/auth/confirm`);
    expect(browserDestination.origin).toBe(publicOrigin);
    expect(browserDestination.pathname).toBe("/login");
    expect(browserDestination.searchParams.get("next")).toBe(next);
    expect(location).not.toMatch(/localhost|evil\.invalid|other-tenant|fictitious|token_hash|magiclink/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("the old password action does not contact Supabase Auth", async () => {
    expect((await signIn()).error).toContain("eenmalige e-mailcode");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
