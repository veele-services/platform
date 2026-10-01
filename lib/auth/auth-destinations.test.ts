import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { GET } from "@/app/auth/confirm/route";
import { signIn } from "@/app/login/actions";

describe("authentication redirect sinks", () => {
  beforeEach(() => { auth.exchangeCodeForSession.mockResolvedValue({ error: null }); auth.signInWithPassword.mockResolvedValue({ error: null }); });
  it.each(["/\\evil.invalid", "/\t/evil.invalid", "/\n/evil.invalid", "/a/..//evil.invalid", "/.//evil.invalid", "/%2e//evil.invalid"])("both handlers reject %j", async (next) => {
    const url = new URL("https://tenant.staging.fieldgrid.nl/auth/confirm");
    url.searchParams.set("code", "fictitious-code"); url.searchParams.set("next", next);
    const response = await GET(new NextRequest(url));
    expect(response.headers.get("location")).toBe("https://tenant.staging.fieldgrid.nl/app");
    const form = new FormData(); form.set("email", "test@example.invalid"); form.set("password", "fictitious-password"); form.set("next", next);
    await expect(signIn({}, form)).rejects.toThrow("redirect:/app");
  });
  it.each(["/staff", "/klant", "/auth/reset"])("preserves the legitimate destination %s", async (next) => {
    const url = new URL("https://tenant.staging.fieldgrid.nl/auth/confirm"); url.searchParams.set("code", "fictitious-code"); url.searchParams.set("next", next);
    expect((await GET(new NextRequest(url))).headers.get("location")).toBe(`https://tenant.staging.fieldgrid.nl${next}`);
    const form = new FormData(); form.set("email", "test@example.invalid"); form.set("password", "fictitious-password"); form.set("next", next);
    await expect(signIn({}, form)).rejects.toThrow(`redirect:${next}`);
  });
  it("failed code exchange does not follow next", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid" } });
    const response = await GET(new NextRequest("https://tenant.staging.fieldgrid.nl/auth/confirm?code=invalid&next=/staff"));
    expect(response.headers.get("location")).toBe("https://tenant.staging.fieldgrid.nl/login?error=confirm");
  });
});
