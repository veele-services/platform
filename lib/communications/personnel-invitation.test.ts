import { describe, expect, it } from "vitest";
import { renderPersonnelInvitation } from "./personnel-invitation";

const input = {
  brand: { company: "Noordhaven", domain: "noordhaven.staging.fieldgrid.nl", primary: "#214E72", accent: "#C65D21", emailLogoUrl: "https://staging.fieldgrid.nl/api/branding/test/email-logo", senderEmail: "noreply@fieldgrid.nl" },
  name: "Robin de Vries", employeeNumber: "P-0100", existingAccount: false,
  targetUrl: "https://noordhaven.staging.fieldgrid.nl/auth/invite?tenant=noordhaven#token_hash=test-token",
};

describe("personnel invitation email", () => {
  it("explains the personnel portal and activation in the tenant's branding", () => {
    const mail = renderPersonnelInvitation(input);
    expect(mail.subject).toBe("Uitnodiging voor het personeelsportaal van Noordhaven");
    expect(mail.text).toContain("Hallo Robin de Vries");
    expect(mail.text).toContain("Je personeelsnummer is P-0100");
    expect(mail.text).toContain("planning en werkbonnen");
    expect(mail.html).toContain("Personeelsaccount activeren");
    expect(mail.html).toContain('background:#C65D21');
    expect(mail.html).toContain('color:#214E72');
    expect(mail.html).toContain(`src="${input.brand.emailLogoUrl}"`);
    expect(mail.html).toContain(input.targetUrl);
    expect(mail.html).not.toMatch(/Supabase|Auth-uitnodiging|eigen tenantomgeving/);
    const header = mail.html.match(/padding:34px 42px 25px;">\s*([\s\S]*?)\s*<\/td><\/tr>/)?.[1];
    expect(header).not.toContain(">Noordhaven<");
    expect(header).not.toContain(input.brand.domain);
  });
  it("leaves existing credentials unchanged and points to the portal", () => {
    const mail = renderPersonnelInvitation({ ...input, existingAccount: true, targetUrl: "https://noordhaven.staging.fieldgrid.nl/staff" });
    expect(mail.text).toContain("Je wachtwoord blijft ongewijzigd");
    expect(mail.html).toContain("Personeelsportaal openen");
    expect(mail.html).not.toContain("Personeelsaccount activeren");
  });
  it("escapes tenant and employee names and falls back to a text brand without a logo", () => {
    const mail = renderPersonnelInvitation({ ...input, name: "<script>alert(1)</script>", brand: { ...input.brand, company: "A & B", emailLogoUrl: "" } });
    expect(mail.html).toContain("A &amp; B");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
  });
  it("allows loopback links only when explicitly rendering for local development", () => {
    const local = { ...input, targetUrl: "http://127.0.0.1:3000/auth/invite#token_hash=test", brand: { ...input.brand, emailLogoUrl: "http://127.0.0.1:3000/logo.png" } };
    expect(() => renderPersonnelInvitation(local)).toThrow("HTTPS");
    expect(renderPersonnelInvitation({ ...local, allowLocalLinks: true }).html).toContain(local.targetUrl);
    expect(() => renderPersonnelInvitation({ ...local, allowLocalLinks: true, targetUrl: "http://untrusted.test/invite" })).toThrow("HTTPS");
  });
});
