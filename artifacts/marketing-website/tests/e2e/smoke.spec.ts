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

test("contact form submits an idempotent allowlisted Fieldgrid payload", async ({
  page,
}) => {
  let captured:
    | {
        url: string;
        idempotencyKey: string | undefined;
        body: Record<string, unknown>;
      }
    | undefined;

  await page.route("**/api/website-forms/*/submissions", async (route) => {
    const request = route.request();
    captured = {
      url: request.url(),
      idempotencyKey: request.headers()["idempotency-key"],
      body: request.postDataJSON() as Record<string, unknown>,
    };
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        accepted: true,
        reference: "11111111-1111-4111-8111-111111111111",
        replayed: false,
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

  await expect(form.getByRole("status")).toContainText(
    "Uw aanvraag is ontvangen",
  );
  expect(captured?.url).toMatch(
    /\/api\/website-forms\/11111111-1111-4111-8111-111111111111\/submissions$/u,
  );
  expect(captured?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
  expect(captured?.body).toEqual({
    data: {
      name: "Test Gebruiker",
      email: "test@example.invalid",
      phone: "",
      company: "",
      subject: "Contactaanvraag",
      message: "Dit is een veilige geautomatiseerde testaanvraag.",
    },
    _submissionId: captured?.idempotencyKey,
    _companyWebsite: "",
  });
});
