import { expect, it } from "vitest";
import { renderTenantEmailHtml } from "../communications/email";

const brand = { company: "Fixture tenant", domain: "fixture.invalid", primary: "#222C35", accent: "#41AC42", senderEmail: "sender@fixture.invalid" };
it("renders a generic authenticated ticket link without interpreting tenant-like placeholders", () => {
  const html = renderTenantEmailHtml({ brand, kind: "ticket_event", message: { subject: "Nieuwe ticketmelding", body: "Open de beveiligde omgeving. {geheime_inhoud}" }, targetUrl: "https://fixture.invalid/app/meldingen/fixture" });
  expect(html).toContain("BEVEILIGDE MELDING");
  expect(html).toContain("Melding bekijken");
  expect(html).toContain("{geheime_inhoud}");
  expect(html).not.toContain("Factuur veilig betalen");
});
it("renders the short-lived ticket verification code without a transaction CTA", () => {
  const html = renderTenantEmailHtml({ brand, kind: "ticket_otp", message: { subject: "Bevestig rechtenwijziging", body: "Uw fictieve testcode: 123456" }, targetUrl: "https://fixture.invalid/app/meldingen/instellingen" });
  expect(html).toContain("TIJDELIJKE VERIFICATIECODE");
  expect(html).toContain("123456");
  expect(html).not.toContain("Melding bekijken");
  expect(html).not.toContain("Prijsopgave bekijken");
  expect(html).not.toContain('href="https://fixture.invalid/app/meldingen/instellingen"');
});
