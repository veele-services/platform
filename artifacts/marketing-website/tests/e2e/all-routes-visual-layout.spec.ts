import { expect, test } from "@playwright/test";

const routes = [
  ["home", "/"],
  ["diensten", "/diensten"],
  ["schoonmaak", "/schoonmaak"],
  ["schoonmaak-kantoorschoonmaak", "/schoonmaak/kantoorschoonmaak"],
  ["schoonmaak-vve-vastgoed", "/schoonmaak/vve-vastgoed"],
  ["schoonmaak-winkels", "/schoonmaak/winkels"],
  ["schoonmaak-horeca", "/schoonmaak/horeca"],
  ["schoonmaak-glasbewassing", "/schoonmaak/glasbewassing"],
  ["schoonmaak-specialistisch-oplevering", "/schoonmaak/specialistisch-oplevering"],
  ["beveiliging", "/beveiliging"],
  ["beveiliging-objectbeveiliging", "/beveiliging/objectbeveiliging"],
  ["beveiliging-mobiele-surveillance", "/beveiliging/mobiele-surveillance"],
  ["beveiliging-winkelbeveiliging", "/beveiliging/winkelbeveiliging"],
  ["beveiliging-evenementen", "/beveiliging/evenementen"],
  ["beveiliging-horeca", "/beveiliging/horeca"],
  ["beveiliging-receptie-toegangscontrole", "/beveiliging/receptie-toegangscontrole"],
  ["beveiliging-persoonsbeveiliging", "/beveiliging/persoonsbeveiliging"],
  ["beveiliging-chauffeursdiensten", "/beveiliging/chauffeursdiensten"],
  ["facilitair", "/facilitair"],
  ["facilitair-receptie-gastvrijheid", "/facilitair/receptie-gastvrijheid"],
  ["facilitair-evenementenpersoneel", "/facilitair/evenementenpersoneel"],
  ["facilitair-horeca-bar", "/facilitair/horeca-bar"],
  ["facilitair-sanitaire-service", "/facilitair/sanitaire-service"],
  ["oplossingen", "/oplossingen"],
  ["oplossingen-kantoren", "/oplossingen/kantoren"],
  ["oplossingen-vve-vastgoed", "/oplossingen/vve-vastgoed"],
  ["oplossingen-retail", "/oplossingen/retail"],
  ["oplossingen-horeca-hotels", "/oplossingen/horeca-hotels"],
  ["oplossingen-evenementen", "/oplossingen/evenementen"],
  ["oplossingen-zorg-onderwijs", "/oplossingen/zorg-onderwijs"],
  ["over-ons", "/over-ons"],
  ["cases", "/cases"],
  ["kennis", "/kennis"],
  ["werken-bij", "/werken-bij"],
  ["contact", "/contact"],
  ["offerte", "/offerte"],
  ["portaal", "/portaal"],
  ["den-haag", "/den-haag"],
  ["scheveningen", "/scheveningen"],
  ["rijswijk", "/rijswijk"],
  ["voorburg-leidschendam", "/voorburg-leidschendam"],
  ["wassenaar", "/wassenaar"],
  ["delft", "/delft"],
  ["zoetermeer", "/zoetermeer"],
] as const;

const forbiddenPublicationCopy = [
  "marketingdemo",
  "conceptomgeving",
  "portaalconcept",
  "veiligheidsmicrocopy",
  "lokale bewijslast vóór livegang",
  "voorbeeldtitel",
  "publicatievoorwaarde",
  "privacytekst bij verzenden",
  "formulierknop",
  "redactionele regel",
  "startonderwerpen voor de eerste zes maanden",
  "vaste artikelstructuur",
] as const;

type TapTargetFailure = {
  element: string;
  height: number;
  label: string;
  width: number;
};

test.describe("all marketing routes visual and layout QA", () => {
  test.describe.configure({ mode: "parallel" });

  for (const [screenshotName, route] of routes) {
    test(`${route} renders without visual layout blockers`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.emulateMedia({ reducedMotion: "reduce" });
      const response = await page.goto(route, { waitUntil: "networkidle" });

      expect(response, `${route} should return a document response`).not.toBeNull();
      expect(response?.status(), `${route} should return a successful response`).toBeLessThan(400);

      const visibleHeading = page.locator("h1:visible");
      await expect(visibleHeading, `${route} should expose exactly one visible h1`).toHaveCount(1);
      await expect(visibleHeading, `${route} h1 should be visible`).toBeVisible();
      await expect(page.locator("body"), `${route} body should be visible`).toBeVisible();
      await page.evaluate(async () => document.fonts.ready);

      const bodyText = (await page.locator("body").innerText()).toLocaleLowerCase("nl-NL");
      for (const forbiddenCopy of forbiddenPublicationCopy) {
        expect(bodyText, `${route} should not expose internal publication copy: ${forbiddenCopy}`).not.toContain(forbiddenCopy);
      }

      if (route === "/portaal") {
        const portalLoginLinks = page.getByRole("link", { name: "Log in op het klantenportaal" });
        expect(await portalLoginLinks.count()).toBeGreaterThanOrEqual(2);
        const portalLoginHrefs = await portalLoginLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
        expect(portalLoginHrefs.every((href) => href === "/klant/login")).toBe(true);
      }

      const heavyHeadings = await page.locator("h1:visible, h2:visible").evaluateAll((headings) =>
        headings
          .map((heading) => ({
            text: heading.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "",
            weight: Number.parseInt(window.getComputedStyle(heading).fontWeight, 10),
          }))
          .filter(({ weight }) => Number.isFinite(weight) && weight > 600),
      );
      expect(heavyHeadings, `${route} should keep public h1/h2 typography at weight 600 or lighter`).toEqual([]);

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(layout.scrollWidth, `${route} should not horizontally overflow`).toBeLessThanOrEqual(layout.clientWidth + 1);

      const tapTargetFailures = await page.evaluate<TapTargetFailure[]>(() => {
        const selector = [
          "button",
          "input:not([type='hidden'])",
          "select",
          "textarea",
          "summary",
          "[role='button']",
          "a[class~='group/button']",
        ].join(",");
        const failures: TapTargetFailure[] = [];

        for (const node of document.querySelectorAll<HTMLElement>(selector)) {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const isRendered = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          if (!isRendered || node.closest("[aria-hidden='true']")) continue;

          let targetRect = rect;
          if (node instanceof HTMLInputElement && ["checkbox", "radio"].includes(node.type)) {
            const explicitLabel = node.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(node.id)}"]`) : null;
            const label = node.closest("label") ?? explicitLabel;
            if (label) targetRect = label.getBoundingClientRect();
          }

          if (targetRect.width + 0.5 >= 24 && targetRect.height + 0.5 >= 24) continue;
          failures.push({
            element: node.tagName.toLowerCase(),
            height: Math.round(targetRect.height * 10) / 10,
            label: node.getAttribute("aria-label") ?? node.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? node.getAttribute("name") ?? "unlabelled",
            width: Math.round(targetRect.width * 10) / 10,
          });
        }
        return failures;
      });

      expect(tapTargetFailures, `${route} should have controls with targets of at least 24x24px`).toEqual([]);
      expect(pageErrors, `${route} should not emit uncaught page errors`).toEqual([]);

      await page.screenshot({
        path: testInfo.outputPath(`route-${screenshotName}.png`),
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      });
      expect(pageErrors, `${route} should remain free of uncaught page errors`).toEqual([]);
    });
  }
});
