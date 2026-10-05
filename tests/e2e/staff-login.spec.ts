import { expect, test } from "@playwright/test";
import { signInStaffWithEmailOtp } from "./staff-auth";

const STAFF_EMAIL = "field-worker@fieldgrid.test";

// One-use codes must never enter a trace, screenshot, video or test output.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("staff logt in met echte e-mail-OTP terwijl backoffice wachtwoordlogin behoudt", async ({ page }) => {
  await page.goto("/login?next=%2Fapp");
  await expect(page.getByLabel("Wachtwoord", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inlogcode versturen" })).toHaveCount(0);

  await page.goto("/login?next=%2Fstaff");
  await expect(page.getByRole("heading", { name: "Inloggen personeelsapp" })).toBeVisible();
  await expect(page.getByLabel("Wachtwoord", { exact: true })).toHaveCount(0);

  // One real message per attempt leaves room for the configured single CI
  // retry under the intentionally low local limit of two auth emails/hour.
  await signInStaffWithEmailOtp(page, STAFF_EMAIL);
  await expect(page.locator(".personnel-app")).toBeVisible();
});
