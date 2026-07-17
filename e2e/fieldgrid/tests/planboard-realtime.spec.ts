import { expect, test } from "@playwright/test";

const backofficeUrl = process.env.FIELDGRID_BACKOFFICE_URL ?? "http://127.0.0.1:3000";

test.describe("planning board realtime collaboration", () => {
  test.skip(!process.env.FIELDGRID_RUN_REALTIME_E2E, "Set FIELDGRID_RUN_REALTIME_E2E=1 with seeded auth state to run realtime planboard checks.");

  test("multi-context users see the same scheduled move and no duplicate drop result", async ({ browser }) => {
    const plannerA = await browser.newContext({ storageState: process.env.FIELDGRID_BACKOFFICE_STORAGE_STATE });
    const plannerB = await browser.newContext({ storageState: process.env.FIELDGRID_BACKOFFICE_STORAGE_STATE });
    const pageA = await plannerA.newPage();
    const pageB = await plannerB.newPage();

    await pageA.goto(`${backofficeUrl}/planning?board=1`);
    await pageB.goto(`${backofficeUrl}/planning?board=1`);

    await expect(pageA.getByRole("button", { name: /Openstaande werkbonnen/i })).toBeVisible();
    await expect(pageB.getByText(/Planbord met|Beste kandidaten/i)).toBeVisible();

    await pageA.getByRole("button", { name: /Openstaande werkbonnen/i }).click();
    const firstOpenAssignment = pageA.getByRole("button", { name: /Selecteer open werkbon/i }).first();
    await expect(firstOpenAssignment).toBeVisible();
    const assignmentLabel = await firstOpenAssignment.getAttribute("aria-label");
    await firstOpenAssignment.press("Enter");

    const targetTimeline = pageA.getByRole("region", { name: /Planningtijdlijn/i }).first();
    await expect(targetTimeline).toBeVisible();
    await pageA.getByRole("button", { name: /^Plan$/i }).first().click();

    await expect(pageB.getByLabel(assignmentLabel ?? "", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText(/Gepland|Werkelijk gestart|Werkelijk gereed/i).first()).toBeVisible();

    await plannerA.close();
    await plannerB.close();
  });
});
