import { describe, expect, it } from "vitest";
import { createContentSecurityPolicy } from "./content-security-policy";

describe("content security policy", () => {
  it("uses a fresh nonce and a closed production script policy", () => {
    const first = createContentSecurityPolicy(false, true);
    const second = createContentSecurityPolicy(false, true);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.value).toContain(`script-src 'self' 'nonce-${first.nonce}' 'strict-dynamic'`);
    expect(first.value).not.toContain("'unsafe-eval'");
    expect(first.value).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(first.value).toContain("object-src 'none'");
    expect(first.value).toContain("frame-ancestors 'none'");
    expect(first.value).not.toContain("fonts.googleapis.com");
    expect(first.value).not.toContain("fonts.gstatic.com");
    expect(first.value).toContain("upgrade-insecure-requests");
  });

  it("allows only the development evaluator exception", () => {
    const policy = createContentSecurityPolicy(true, true).value;
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("does not upgrade the explicit HTTP-only local test origin", () => {
    expect(createContentSecurityPolicy(false, false).value).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("allows only the configured Supabase HTTP and realtime origins", () => {
    const local = createContentSecurityPolicy(false, false, "http://127.0.0.1:59321").value;
    expect(local).toContain("connect-src 'self' https://tiles.openfreemap.org http://127.0.0.1:59321 ws://127.0.0.1:59321");

    const hosted = createContentSecurityPolicy(false, true, "https://fieldgrid-test.supabase.co/path").value;
    expect(hosted).toContain("https://fieldgrid-test.supabase.co wss://fieldgrid-test.supabase.co");
    expect(hosted).not.toContain("/path");

    const credentialed = createContentSecurityPolicy(false, true, "https://user:pass@fieldgrid-test.supabase.co").value;
    expect(credentialed).not.toContain("fieldgrid-test.supabase.co");
  });
});
