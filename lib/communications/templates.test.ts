import { describe, expect, it } from "vitest";
import {
  renderPlainEmail,
  renderTemplateText,
  templateDefinition,
  validateTemplateDraft,
} from "./templates";

describe("tenant message templates", () => {
  it("accepteert uitsluitend variabelen uit het gekozen template", () => {
    expect(validateTemplateDraft("quote", "Prijsopgave van {bedrijfsnaam}", "Open {offertelink}" )).toBeNull();
    expect(validateTemplateDraft("quote", "Prijsopgave {factuurnummer}", "Open {offertelink}" )).toBe("Onbekende variabele: {factuurnummer}");
    expect(validateTemplateDraft("invoice", "Onveilig\nOnderwerp", "Bericht")).toMatch(/onderwerp/i);
  });

  it("faalt gesloten wanneer een vereiste renderwaarde ontbreekt", () => {
    expect(() => renderTemplateText("Hallo {klantnaam}", {})).toThrow("{klantnaam}");
    expect(renderTemplateText("Hallo {klantnaam}", {}, false)).toBe("Hallo {klantnaam}");
  });

  it("bouwt tekst en onderwerp uit dezelfde versie", () => {
    const definition = templateDefinition("invoice");
    const rendered = renderPlainEmail({
      subject: definition.subject,
      body: definition.body,
      values: {
        bedrijfsnaam: "Fieldgrid Test",
        klantnaam: "Klant Eén",
        factuurnummer: "FG-2026-1",
        betaallink: "https://test.invalid/pay/1",
      },
      targetUrl: "https://test.invalid/pay/1",
      targetLabel: "Veilig betalen",
    });
    expect(rendered.subject).toBe("Factuur FG-2026-1 van Fieldgrid Test");
    expect(rendered.text).toContain("Beste Klant Eén");
    expect(rendered.text).toContain("Veilig betalen: https://test.invalid/pay/1");
  });
});
