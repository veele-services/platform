import { expect, test } from "@playwright/test";

const visualRoutes = [
  ["home", "/"],
  ["dienst", "/schoonmaak/kantoorschoonmaak"],
  ["locatie", "/den-haag"],
  ["formulier", "/offerte"],
] as const;

for (const [name, route] of visualRoutes) {
  test(`${name} visual baseline`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
