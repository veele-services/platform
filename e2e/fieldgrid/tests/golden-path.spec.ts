import { expect, test, type Page, type Response } from "@playwright/test";
import { readFile } from "node:fs/promises";

const tenantAHost = "tenant-a.runtime.fieldgrid.test";
const tenantBHost = "tenant-b.runtime.fieldgrid.test";
const platformHost = "platform.fieldgrid.nl";
const suspendedHost = "suspended.runtime.fieldgrid.test";
const unknownHost = "unknown.runtime.fieldgrid.test";
const tenantAAssignmentId = "70000000-0000-4000-8000-000000000001";
const tenantBAssignmentId = "70000000-0000-4000-8000-000000000002";
const quoteAcceptanceAssignmentId = "91000000-0000-4000-8000-000000000001";
const cancellationInvoiceId = "91000000-0000-4000-8000-000000000003";
const recoveryOutboxPath = "/tmp/fieldgrid-phase2b-playwright-outbox.jsonl";

function backofficeUrl(path: string, host = tenantAHost) {
  return `http://${host}:9321${path}`;
}

function personnelUrl(path: string, host = tenantAHost) {
  return `http://${host}:9322${path}`;
}

function customerUrl(path: string, host = tenantAHost) {
  return `http://${host}:9323${path}`;
}

async function useIdentity(page: Page, userId: string, host = tenantAHost) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "fieldgrid_e2e_auth_user",
      value: userId,
      domain: host,
      path: "/",
    },
  ]);
}

async function expectRealApp(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).not.toContainText("Fieldgrid E2E");
}

async function expectDeniedOrLogin(page: Page, response: Response | null) {
  const status = response?.status() ?? 0;
  if ([401, 403, 404, 302, 307].includes(status) || /login/.test(page.url()))
    return;
  await expect(page.locator("body")).toContainText(
    /Toegang geweigerd|Geen toegang|Geen platformtoegang|Geen actieve organisatietoegang|Pagina niet gevonden|Unauthorized|Forbidden|Niet ingelogd/i,
  );
}

async function recoveryCodeFor(email: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const content = await readFile(recoveryOutboxPath, "utf8").catch(
          () => "",
        );
        const messages = content
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        const message = messages
          .reverse()
          .find(
            (candidate) =>
              Array.isArray(candidate.to) && candidate.to.includes(email),
          );
        code = message
          ? (/\b\d{8}\b/u.exec(
              `${message.text ?? ""} ${message.html ?? ""}`,
            )?.[0] ?? null)
          : null;
        return code;
      },
      {
        message: `recovery code for ${email} should reach the local outbox`,
        timeout: 15_000,
      },
    )
    .not.toBeNull();
  if (!code)
    throw new Error("Recovery code missing from the ephemeral test outbox.");
  return code;
}

test.describe.configure({ mode: "serial" });

test("1. Backoffice", async ({ page }) => {
  test.setTimeout(60_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000102");
  await page.goto(backofficeUrl("/"));
  await expectRealApp(page);
  await page.goto(backofficeUrl("/customers"));
  await expect(page.locator("main")).toContainText("Runtime Customer A");
  await expect(page.locator("main")).not.toContainText("Runtime Customer B");
  await page.goto(backofficeUrl("/assignments"));
  await expect(page.locator("main")).toContainText("Runtime Assignment A");
  await expect(page.locator("main")).not.toContainText("Runtime Assignment B");
  await page.goto(backofficeUrl("/planning"));
  await expect(page.locator("main")).toContainText(/Planbord|Werkbon-wachtrij/);
  await expect(page.locator("main")).toContainText(
    /Personnel A, Runtime|Runtime Personnel A/,
  );
  await expect(page.locator("main")).not.toContainText(
    /Runtime Assignment B|RTB-A001|Personnel B/i,
  );
});

test("2. Platform administration", async ({ page }) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000002", platformHost);
  await page.goto(backofficeUrl("/platform", platformHost));
  await expectRealApp(page);
  await expect(page.locator("main")).toContainText(
    /Platform|Tenant|Organisatie|Beheer/,
  );
  await useIdentity(page, "20000000-0000-4000-8000-000000000102", platformHost);
  const denied = await page.goto(backofficeUrl("/platform", platformHost));
  await expectDeniedOrLogin(page, denied);
  await expect(page.locator("body")).not.toContainText("Runtime Customer B");
});

test("3. Personnel PWA", async ({ page }) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000104");
  await page.goto(personnelUrl("/personeel/opdrachten"));
  await expectRealApp(page);
  await expect(page.locator("main")).toContainText(
    /Runtime Assignment A|RTA-A001/,
  );
  await expect(page.locator("main")).not.toContainText(
    /Runtime Assignment B|RTB-A001/,
  );
  await page.goto(personnelUrl(`/personeel/opdrachten/${tenantAAssignmentId}`));
  await expect(page.locator("main")).toContainText(
    /Runtime Assignment A|RTA-A001|Taak|Taken/,
  );
  await page.goto(personnelUrl("/personeel/uren"));
  await expect(page.locator("main")).toContainText(/Uren|Rapport|Werkbon/i);
});

test("4. Customer PWA", async ({ page }) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000105");
  await page.goto(customerUrl("/klant/opdrachten"));
  await expectRealApp(page);
  await expect(page.locator("main")).toContainText(
    /Runtime Assignment A|RTA-A001/,
  );
  await expect(page.locator("main")).not.toContainText(
    /Runtime Assignment B|RTB-A001|internal-only/i,
  );
  await page.goto(customerUrl("/klant/rapporten"));
  await expect(page.locator("main")).toContainText(
    /Runtime approved report A|Rapport|Goedgekeurd/,
  );
  await page.goto(customerUrl("/klant/facturen"));
  await expect(page.locator("main")).toContainText(
    /RTA-INV-001|Factuur|Invoice/,
  );
});

test("Customer accepts a sent quote through the canonical lifecycle", async ({
  page,
}) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000105");
  await page.goto(customerUrl("/klant/offertes?filter=action_required"));
  await expectRealApp(page);
  await expect(page.locator("main")).toContainText("RTA-OFF-001");
  await page.getByRole("button", { name: "Goedkeuren" }).first().click();
  await page.getByRole("button", { name: "Ja, goedkeuren" }).first().click();
  await expect(page.getByText("Offerte goedgekeurd").first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(
    customerUrl(`/klant/opdrachten/${quoteAcceptanceAssignmentId}`),
  );
  await expect(page.locator("main")).toContainText(/Planbaar|Goedgekeurd/i);
  await page.goto(customerUrl("/klant/offertes?filter=approved"));
  await expect(page.locator("main")).toContainText("RTA-OFF-001");
  await expect(page.locator("main")).toContainText("Goedgekeurd");
});

test("Backoffice cancels a sent invoice and shows the durable result", async ({
  page,
}) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000102");
  await page.goto(backofficeUrl(`/invoices/${cancellationInvoiceId}`));
  await expectRealApp(page);
  await expect(page.locator("main")).toContainText("RTA-CANCEL-INV-001");
  await page.getByRole("button", { name: "Annuleren", exact: true }).click();
  await page
    .getByLabel("Reden")
    .fill("Playwright gecorrigeerde factuur vereist");
  await page.getByRole("button", { name: "Factuur annuleren" }).click();
  await expect(page.locator("main")).toContainText("Geannuleerd", {
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.locator("main")).toContainText("Geannuleerd");
  await expect(
    page.getByRole("button", { name: "Annuleren", exact: true }),
  ).toHaveCount(0);
});

test("5. Customer credential recovery", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(customerUrl("/klant/wachtwoord-vergeten"));

  await page
    .getByLabel("E-mailadres")
    .fill("missing-customer@tenant-a.runtime.fieldgrid.test");
  await page.getByRole("button", { name: "Herstelcode versturen" }).click();
  await expect(page.getByText(/Controleer uw inbox/i)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Andere e-mail gebruiken" }).click();

  const email = "customer@tenant-a.runtime.fieldgrid.test";
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Herstelcode versturen" }).click();
  await expect(page.getByText(/Controleer uw inbox/i)).toBeVisible({
    timeout: 15_000,
  });
  const code = await recoveryCodeFor(email);
  await page.getByLabel("Herstelcode").fill(code);
  await page.getByRole("button", { name: "Code controleren" }).click();
  await expect(page).toHaveURL(/\/klant\/reset-wachtwoord/u);

  await page.locator('input[name="password"]').fill("Fieldgrid!Phase2B42");
  await page.locator('input[name="passwordTwo"]').fill("Fieldgrid!Phase2B42");
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page).toHaveURL(
    /\/klant\/login\?message=Wachtwoord\+succesvol\+gewijzigd/u,
  );
});

test("6. Personnel credential recovery", async ({ page }) => {
  await page.context().clearCookies();
  const email = "personnel@tenant-a.runtime.fieldgrid.test";
  await page.goto(personnelUrl("/personeel/wachtwoord-vergeten"));
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Herstelcode versturen" }).click();
  await expect(page.getByText(/Controleer (?:je|uw) inbox/i)).toBeVisible({
    timeout: 15_000,
  });
  const code = await recoveryCodeFor(email);
  await page.getByLabel("Herstelcode").fill(code);
  await page.getByRole("button", { name: "Code controleren" }).click();
  await expect(page).toHaveURL(/\/personeel\/reset-wachtwoord/u);

  await page.locator('input[name="password"]').fill("Fieldgrid!Phase2B43");
  await page.locator('input[name="passwordTwo"]').fill("Fieldgrid!Phase2B43");
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page).toHaveURL(
    /\/personeel\/login\?message=Wachtwoord\+succesvol\+gewijzigd/u,
  );
});

test("7. Recovery provider invalidates sessions and never receives a code as password", async ({
  request,
}) => {
  const response = await request.get(
    "http://127.0.0.1:9325/recovery-provider-proof",
  );
  expect(response.ok()).toBe(true);
  const proof = await response.json();
  expect(proof.passwordUpdates).toBe(2);
  expect(proof.sessionInvalidations).toBe(2);
  expect(proof.legacyCodePasswordDetected).toBe(false);
  expect(proof.updatedUsers).toEqual([
    "20000000-0000-4000-8000-000000000104",
    "20000000-0000-4000-8000-000000000105",
  ]);
});

test("8. Negative guards", async ({ page }) => {
  await useIdentity(page, "20000000-0000-4000-8000-000000000202", tenantAHost);
  let response = await page.goto(backofficeUrl("/customers"));
  await expectDeniedOrLogin(page, response);
  await expect(page.locator("body")).not.toContainText("Runtime Customer A");
  await useIdentity(page, "20000000-0000-4000-8000-000000000102", unknownHost);
  response = await page.goto(backofficeUrl("/", unknownHost));
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, "20000000-0000-4000-8000-000000000106", tenantAHost);
  response = await page.goto(personnelUrl("/personeel/opdrachten"));
  await expectDeniedOrLogin(page, response);
  await useIdentity(
    page,
    "20000000-0000-4000-8000-000000000401",
    suspendedHost,
  );
  response = await page.goto(backofficeUrl("/", suspendedHost));
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, "20000000-0000-4000-8000-000000000104", tenantAHost);
  response = await page.goto(
    personnelUrl(`/personeel/opdrachten/${tenantBAssignmentId}`),
  );
  await expectDeniedOrLogin(page, response);
  await expect(page.locator("body")).not.toContainText("Runtime Assignment B");
});

test("9. Offline work-order mutation survives refresh and converges after reconnect", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000104");
  await page.goto(
    personnelUrl(
      `/personeel/opdrachten/${tenantAAssignmentId}?tab=werkzaamheden`,
    ),
  );
  await expectRealApp(page);
  await expect(
    page.getByRole("button", { name: "Runtime offline checklist task" }),
  ).toBeVisible();

  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Runtime offline checklist task" })
    .click();
  await expect(
    page.getByText(/Taakwijziging is offline opgeslagen/i),
  ).toBeVisible();

  const queueKey = "veele-personeel-offline-work-order-actions-v1";
  const queued = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    queueKey,
  );
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({
    type: "set-task-completion",
    assignmentId: tenantAAssignmentId,
    status: "pending",
  });
  expect(queued[0].idempotencyKey).toEqual(expect.any(String));
  expect(queued[0].expectedParticipantVersion).toEqual(expect.any(Number));

  // Reconnect while writes are unavailable, then reload the real app. The
  // durable browser queue must survive the document lifecycle.
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await context.setOffline(false);
  await page.reload();
  await expectRealApp(page);
  await expect
    .poll(async () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "[]").length,
        queueKey,
      ),
    )
    .toBe(1);

  // Restore the network and emit a new reconnect event. The same mutation ID
  // is replayed once, removed only after the canonical server result succeeds.
  await page.unroute("**/*");
  await context.setOffline(true);
  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "[]").length,
          queueKey,
        ),
      {
        timeout: 20_000,
      },
    )
    .toBe(0);
  await page.reload();
  await expect(page.getByText(/^1 van \d+ afgerond$/u)).toBeVisible();
});
