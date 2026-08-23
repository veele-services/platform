import { expect, test, type Page } from "@playwright/test";

const tenantAHost = "tenant-a.runtime.fieldgrid.test";
const tenantBHost = "tenant-b.runtime.fieldgrid.test";
const tenantAAdmin = "20000000-0000-4000-8000-000000000102";
const tenantBAdmin = "20000000-0000-4000-8000-000000000202";
const workflowRunId = process.env.FIELDGRID_WORKFLOW_RUN_ID;
if (!workflowRunId) {
  throw new Error("FIELDGRID_WORKFLOW_RUN_ID is verplicht; gebruik de Fieldgrid Playwright-runner voor reproduceerbaar bewijs.");
}
const runMarker = workflowRunId
  .replaceAll(/[^a-zA-Z0-9-]/gu, "-")
  .slice(-20);
const customerName = `Workflowbot Klant ${runMarker}`;
const objectName = `Workflowbot Object ${runMarker}`;
const personnelFirstName = "Workflowbot";
const personnelLastName = `Medewerker-${runMarker}`;
const personnelName = `${personnelFirstName} ${personnelLastName}`;
const assignmentTitle = `Workflowbot werkbon ${runMarker}`;

function backofficeUrl(path: string, host = tenantAHost) {
  return `http://${host}:9321/admin${path}`;
}

async function useIdentity(page: Page, userId: string, host: string) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "fieldgrid_e2e_auth_user",
      value: userId,
      domain: host,
      path: "/admin",
    },
  ]);
}

test("FG-WORKFLOW-BOT klant, object, personeel en werkbon doorlopen tenantveilig", async ({ page }) => {
  test.info().annotations.push({
    type: "fieldgrid.journey-id",
    description: "workflow.customer-object-personnel-work-order",
  });
  test.setTimeout(120_000);
  await useIdentity(page, tenantAAdmin, tenantAHost);

  await page.goto(backofficeUrl("/customers"));
  await page.getByRole("button", { name: "Nieuwe klant" }).first().click();
  const customerSheet = page.getByRole("dialog", { name: "Nieuwe klant" });
  await customerSheet.getByLabel(/^Naam/).fill(customerName);
  await customerSheet.getByLabel("Contactpersoon").fill("Nora Workflowbot");
  await customerSheet.getByLabel("E-mail").fill(`workflowbot-customer-${runMarker}@example.test`);
  await customerSheet.getByLabel("Direct uitnodigen voor klantportaal").uncheck();
  await customerSheet.getByRole("button", { name: "Klant aanmaken" }).click();
  await expect(customerSheet).toBeHidden();
  await expect(page.locator("main")).toContainText(customerName);

  await page.goto(backofficeUrl("/objects"));
  await page.getByRole("button", { name: "Nieuw object" }).first().click();
  const objectSheet = page.getByRole("dialog", { name: "Nieuw object" });
  await objectSheet.getByRole("combobox", { name: "Klant selecteren" }).click();
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
  await objectSheet.getByRole("textbox", { name: "Naam *", exact: true }).fill(objectName);
  await objectSheet.getByLabel("Straat & huisnummer").fill("Teststraat 8");
  await objectSheet.getByLabel("Stad").fill("Amsterdam");
  await objectSheet.getByRole("button", { name: "Object aanmaken" }).click();
  await expect(objectSheet).toBeHidden();
  await expect(page.locator("main")).toContainText(objectName);

  await page.goto(backofficeUrl("/personnel"));
  await page.getByRole("button", { name: "Nieuw personeelslid" }).first().click();
  const personnelSheet = page.getByRole("dialog", { name: "Nieuw personeelslid" });
  await personnelSheet.getByLabel(/^Voornaam/).fill(personnelFirstName);
  await personnelSheet.getByLabel(/^Achternaam/).fill(personnelLastName);
  await personnelSheet.getByLabel(/^E-mail/).fill(`workflowbot-personnel-${runMarker}@example.test`);
  await personnelSheet.getByRole("button", { name: "Personeelslid aanmaken" }).click();
  await expect(personnelSheet).toBeHidden();
  await expect(page.locator("main")).toContainText(personnelName);

  await page.goto(backofficeUrl("/assignments"));
  await page.getByRole("button", { name: "Nieuwe opdracht" }).first().click();
  const assignmentSheet = page.getByRole("dialog", { name: "Nieuwe opdracht" });
  await assignmentSheet.getByLabel(/^Titel/).fill(assignmentTitle);
  await assignmentSheet.getByRole("combobox", { name: "Klant *", exact: true }).click();
  await page.getByRole("option", { name: customerName, exact: true }).click();
  await expect(assignmentSheet.getByLabel("Object")).toBeEnabled();
  await assignmentSheet.getByLabel("Object").click();
  await page.getByRole("option", { name: objectName, exact: true }).click();
  await assignmentSheet.getByRole("button", { name: "Opdracht aanmaken" }).click();
  await expect(assignmentSheet).toBeHidden();
  await page.goto(backofficeUrl(`/assignments?search=${encodeURIComponent(assignmentTitle)}`));
  await expect(page.locator("main")).toContainText(assignmentTitle);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("main")).toContainText(assignmentTitle);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await useIdentity(page, tenantBAdmin, tenantBHost);
  for (const [path, expected, forbidden] of [
    ["/customers", "Runtime Customer B", customerName],
    ["/objects", "Runtime Object B", objectName],
    ["/personnel", "Runtime Personnel B", personnelName],
    ["/assignments", "Runtime Assignment B", assignmentTitle],
  ] as const) {
    const response = await page.goto(backofficeUrl(path, tenantBHost));
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/u);
    await expect(page.locator("main")).toContainText(expected);
    await expect(page.locator("main")).not.toContainText(forbidden);
  }
});
