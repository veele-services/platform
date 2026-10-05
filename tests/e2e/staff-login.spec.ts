import { expect, test } from "@playwright/test";
import { signInStaffWithEmailOtp } from "./staff-auth";

const STAFF_EMAIL = "field-worker@fieldgrid.test";

// One-use codes must never enter a trace, screenshot, video or test output.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("alle werkruimtes gebruiken hetzelfde OTP-formulier; personeel logt in met een echte achtcijferige e-mailcode", async ({ page }) => {
  for (const workspace of ["/app", "/staff", "/klant", "/platform"]) {
    await page.goto(`/login?next=${encodeURIComponent(workspace)}`);
    await expect(page.getByLabel("Wachtwoord", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Wachtwoord vergeten?", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inlogcode versturen", exact: true })).toBeVisible();
    await expect(page.getByLabel("E-mailadres", { exact: true })).toBeVisible();
  }

  await page.goto("/login?next=%2Fstaff");
  await expect(page.getByRole("heading", { name: "Inloggen personeelsapp" })).toBeVisible();
  await expect(page.getByLabel("Wachtwoord", { exact: true })).toHaveCount(0);

  // Auth artifacts remain disabled: the real one-use code exists only in the
  // mailbox and the unrecorded browser long enough to verify this login.
  await signInStaffWithEmailOtp(page, STAFF_EMAIL);
  await expect(page.locator(".personnel-app")).toBeVisible();
});
