import { describe, expect, it } from "vitest";
import { renderManagementInvitation } from "./management-invitation";
const brand = { company: "Fictief & Co", domain: "fictief.staging.fieldgrid.nl", primary: "#204F70", accent: "#4A9B92", emailLogoUrl: "https://fictief.staging.fieldgrid.nl/api/branding/test/email-logo" };
describe("management OTP invitation", () => {
 it("uses tenant logo/colors and explains OTP without password or activation token", () => {
  const mail = renderManagementInvitation({ brand, name: "Fictieve Manager", role: "Planning", targetUrl: "https://fictief.staging.fieldgrid.nl/login?next=%2Fapp" });
  expect(mail.subject).toBe("Uitnodiging voor Fictief & Co");expect(mail.text).toContain("eenmalige inlogcode");expect(mail.text).toContain("rol Planning");expect(mail.html).toContain(`src="${brand.emailLogoUrl}"`);expect(mail.html).toContain("#204F70");expect(mail.html).toContain("#4A9B92");expect(mail.html).not.toContain("token_hash");
 });
 it("escapes display data and uses tenant name fallback without logo", () => {
  const mail = renderManagementInvitation({ brand: { ...brand, emailLogoUrl: null }, name: "<script>alert(1)</script>", role: "Support", targetUrl: "https://fictief.staging.fieldgrid.nl/login" });expect(mail.html).not.toContain("<script>");expect(mail.html).toContain("&lt;script&gt;");expect(mail.html).toContain("Fictief &amp; Co");
 });
});
