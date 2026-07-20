import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessibilityRoutes = ["/", "/diensten", "/offerte", "/contact", "/portaal"];

for (const route of accessibilityRoutes) {
  test(`${route} renders without serious accessibility violations`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const response = await page.goto(route, { waitUntil: "networkidle" });

    expect(response?.status(), `${route} should return a successful response`).toBeLessThan(400);
    await expect(page.locator("h1")).toBeVisible();
    expect(pageErrors).toEqual([]);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blockingViolations = results.violations.filter(({ impact }) =>
      impact === "serious" || impact === "critical",
    );

    expect(blockingViolations).toEqual([]);
  });
}

test("contact form exposes consent and a useful unconfigured error", async ({ page }) => {
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "not_configured",
        message: "Het formulier is nog niet gekoppeld. Neem rechtstreeks contact met ons op.",
      }),
    });
  });
  await page.goto("/contact");

  const form = page.locator("form");
  await form.getByLabel("Naam").fill("Test Gebruiker");
  await form.getByLabel("E-mailadres").fill("test@example.invalid");
  await form.getByLabel("Uw vraag").fill("Dit is een veilige geautomatiseerde testaanvraag.");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Verstuur aanvraag" }).click();

  await expect(form.getByRole("alert")).toContainText("nog niet gekoppeld");
});
