import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { step: "email" } as { step: "email" | "code"; email?: string; next?: string; requestedAt?: number; notice?: string; error?: string },
  loginOtp: vi.fn(), staffOtp: vi.fn(), signIn: vi.fn(), action: vi.fn(), pending: false,
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (action: unknown) => {
    expect(action).toBe(mocks.loginOtp);
    return [mocks.state, mocks.action, mocks.pending];
  },
}));
vi.mock("@/app/login/actions", () => ({ loginOtp: mocks.loginOtp, staffOtp: mocks.staffOtp, signIn: mocks.signIn }));

import { LoginForm } from "@/app/login/login-form";

describe("one compact OTP form for every workspace", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.state = { step: "email" }; mocks.pending = false; });
  it.each(["/app", "/staff", "/klant", "/platform"])("%s uses the universal action, email input and no password/link login", next => {
    const html = renderToStaticMarkup(createElement(LoginForm, { next }));
    expect(html).toContain('name="email"');
    expect(html).toContain("Inlogcode versturen");
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("Wachtwoord vergeten");
    expect(html).not.toContain("Veilig inloggen");
  });
  it("accepts supported numeric OTP lengths with autofill, verification and fresh-code actions without exposing a credential-bearing URL", () => {
    mocks.state = { step: "code", email: "fictitious@example.test", next: "/klant", requestedAt: 1_800_000_000_000, notice: "Als dit account toegang heeft, ontvang je een e-mail met een eenmalige inlogcode." };
    const html = renderToStaticMarkup(createElement(LoginForm, { next: "/klant" }));
    for (const attribute of ['name="code"', 'inputMode="numeric"', 'autoComplete="one-time-code"', 'pattern="[0-9]{6,10}"', 'minLength="6"', 'maxLength="10"']) expect(html).toContain(attribute);
    const pattern = new RegExp(`^(?:${html.match(/pattern="([^"]+)"/)![1]})$`);
    for (const code of ["012345", "0123456", "01234567", "012345678", "0123456789"]) expect(pattern.test(code)).toBe(true);
    for (const code of ["12345", "12345678901", "1234abcd", "１２３４５６"]) expect(pattern.test(code)).toBe(false);
    expect(html).toContain("Vul de volledige code uit de e-mail in.");
    expect(html).not.toContain("zescijferige");
    expect(html).toContain("Code controleren");
    expect(html).toContain("Nieuwe code aanvragen (60s)");
    expect(html).toContain("Ander e-mailadres gebruiken");
    expect(html).not.toContain("token_hash");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain('name="password"');
  });
  it("renders a generic verification error and retains the selected workspace", () => {
    mocks.state = { step: "code", email: "fictitious@example.test", next: "/staff/werkbon/123", error: "De code is ongeldig of verlopen." };
    const html = renderToStaticMarkup(createElement(LoginForm, { next: "/staff/werkbon/123" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("De code is ongeldig of verlopen.");
    expect(html).toContain('name="next" value="/staff/werkbon/123"');
  });
});
