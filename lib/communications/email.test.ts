import { describe, expect, it } from "vitest";
import { renderTenantEmailHtml } from "./email";
import { templateDefinition } from "./templates";

const brand = {
  company: "Fieldgrid Test",
  domain: "test.staging.fieldgrid.nl",
  primary: "#222C35",
  accent: "#41AC42",
  senderEmail: "noreply@fieldgrid.nl",
};

describe("HTML e-mailrenderer", () => {
  it("rendert een responsieve prijsopgave met veilige CTA en huisstijl", () => {
    const template = templateDefinition("quote");
    const html = renderTenantEmailHtml({
      brand,
      kind: "quote",
      message: template,
      values: {
        bedrijfsnaam: brand.company,
        klantnaam: "Restaurant De Pier",
        offertelink: "https://test.staging.fieldgrid.nl/quote/token",
      },
      targetUrl: "https://test.staging.fieldgrid.nl/quote/token",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("background:#41AC42");
    expect(html).toContain("Prijsopgave bekijken");
    expect(html).toContain("https://test.staging.fieldgrid.nl/quote/token");
    expect(html).toContain("@media screen and (max-width:640px)");
  });

  it("escaped tenant- en template-inhoud", () => {
    const html = renderTenantEmailHtml({
      brand: { ...brand, company: "<script>kwaad()</script>" },
      kind: "quote",
      message: { subject: "Hallo {bedrijfsnaam}", body: "Beste <img src=x onerror=kwaad()>" },
      values: { bedrijfsnaam: "<script>kwaad()</script>" },
      targetUrl: "https://example.test/quote/token",
    });
    expect(html).not.toContain("<script>kwaad()");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;kwaad()&lt;/script&gt;");
  });

  it("weigert niet-HTTPS transactielinks bij verzending", () => {
    expect(() => renderTenantEmailHtml({
      brand,
      kind: "invoice",
      message: { subject: "Factuur", body: "Bekijk de factuur" },
      targetUrl: "http://onveilig.test/pay",
    })).toThrow("geen geldige HTTPS-URL");
  });

  it("kan een oningevulde HTML-template veilig als bron tonen", () => {
    const template = templateDefinition("invoice");
    const html = renderTenantEmailHtml({ brand, kind: "invoice", message: template, mode: "template" });
    expect(html).toContain("{factuurnummer}");
    expect(html).toContain("{betaallink}");
  });

  it("toont bij een logo geen bedrijfsnaam of domein ernaast en zet de website in de footer", () => {
    const html = renderTenantEmailHtml({
      brand: { ...brand, emailLogoUrl: "https://assets.fieldgrid.test/logo.png" },
      kind: "invoice",
      message: { subject: "Factuur", body: "Uw factuur staat klaar." },
      mode: "preview",
    });
    const header = html.match(/padding:34px 42px 25px;">\s*([\s\S]*?)\s*<\/td><\/tr>/)?.[1];
    const footer = html.match(/background:#F7F9FA;[\s\S]*?<\/td><\/tr>/)?.[0];

    expect(header).toContain('<img src="https://assets.fieldgrid.test/logo.png"');
    expect(header).not.toContain(">Fieldgrid Test<");
    expect(header).not.toContain(brand.domain);
    expect(footer).toContain(`href="https://${brand.domain}/"`);
    expect(footer).toContain(`>${brand.domain}</a>`);
  });

  it("gebruikt zonder logo de bedrijfsnaam als merk in de header", () => {
    const html = renderTenantEmailHtml({
      brand,
      kind: "quote",
      message: { subject: "Prijsopgave", body: "Uw prijsopgave staat klaar." },
      mode: "preview",
    });
    const header = html.match(/padding:34px 42px 25px;">\s*([\s\S]*?)\s*<\/td><\/tr>/)?.[1];

    expect(header).toContain(">Fieldgrid Test</span>");
    expect(header).not.toContain("<img");
    expect(header).not.toContain(brand.domain);
  });
});
