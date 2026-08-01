import { expect, test, type Page, type Response } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tenantAHost = "tenant-a.runtime.fieldgrid.test";
const tenantBHost = "tenant-b.runtime.fieldgrid.test";
const platformHost = "platform.runtime.fieldgrid.test";
const suspendedHost = "suspended.runtime.fieldgrid.test";
const unknownHost = "unknown.runtime.fieldgrid.test";
const tenantAAssignmentId = "70000000-0000-4000-8000-000000000001";
const tenantBAssignmentId = "70000000-0000-4000-8000-000000000002";
const quoteAcceptanceAssignmentId = "91000000-0000-4000-8000-000000000001";
const cancellationInvoiceId = "91000000-0000-4000-8000-000000000003";
const partialPaymentInvoiceId = "90000000-0000-4000-8000-000000000003";
const recoveryOutboxPath = "/tmp/fieldgrid-phase2b-playwright-outbox.jsonl";
const offlineTaskId = "90000000-0000-4000-8000-000000000006";
const e2eDateKey = process.env.FIELDGRID_E2E_DATE_KEY;
if (!e2eDateKey || !/^\d{4}-\d{2}-\d{2}$/u.test(e2eDateKey)) {
  throw new Error("FIELDGRID_E2E_DATE_KEY must use YYYY-MM-DD.");
}

function backofficeUrl(path: string, host = tenantAHost) {
  const suffix = path === "/" ? "" : path;
  return `http://${host}:9321/admin${suffix}`;
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
    ...["/admin", "/personeel", "/klant"].map((path) => ({
      name: "fieldgrid_e2e_auth_user",
      value: userId,
      domain: host,
      path,
    })),
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
  await page.goto(
    personnelUrl(
      `/personeel/opdrachten?date=${encodeURIComponent(e2eDateKey)}`,
    ),
  );
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

test("FG-P2D-AVAILABILITY personnel update and backoffice consistency", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000104");
  await page.goto(personnelUrl("/personeel/beschikbaarheid"));
  await expectRealApp(page);
  const edit = page.getByRole("button", {
    name: /Beschikbaarheid (?:bewerken|invullen)|Vul beschikbaarheid in/,
  });
  await edit.click();
  await page.getByLabel("Van").last().fill("08:00");
  await page.getByLabel("Tot").last().fill("17:00");
  await page.getByRole("button", { name: "Beschikbaarheid opslaan" }).click();
  await expect(page.locator("main")).toContainText(
    /Beschikbaarheid opgeslagen|08:00 - 17:00/,
  );

  await useIdentity(page, "20000000-0000-4000-8000-000000000102");
  await page.goto(backofficeUrl("/planning"));
  await expect(page.locator("main")).toContainText(
    /Runtime Personnel A|Personnel A, Runtime/,
  );
  await expect(page.locator("main")).toContainText(/Beschikbaar|beschikbaar/);
});

test("Customer payment journeys use exact outstanding and one durable provider request", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000105");
  await page.goto(customerUrl(`/klant/facturen/${partialPaymentInvoiceId}`));
  await expect(page.locator("main")).toContainText(/€\s*71,00/u);
  await page.getByRole("button", { name: "Nu betalen" }).click();
  await expect(page).toHaveURL(
    /127\.0\.0\.1:9325\/checkout\/tr_fieldgrid_e2e_0001/u,
  );
  await expect(page.locator("body")).toContainText("Beveiligde testcheckout");

  let proof = await (
    await request.get("http://127.0.0.1:9325/payment-provider-proof")
  ).json();
  expect(proof.createAttempts).toBe(1);
  expect(proof.uniquePayments).toBe(1);
  expect(proof.payments[0].amount).toEqual({ currency: "EUR", value: "71.00" });
  expect(proof.payments[0].metadata.sourceType).toBe("invoice");

  await page.goto(customerUrl(`/klant/facturen/${partialPaymentInvoiceId}`));
  await page.getByRole("button", { name: "Nu betalen" }).click();
  await expect(page).toHaveURL(/tr_fieldgrid_e2e_0001/u);
  proof = await (
    await request.get("http://127.0.0.1:9325/payment-provider-proof")
  ).json();
  expect(proof.createAttempts).toBe(1);
  expect(proof.uniquePayments).toBe(1);
});

test("Customer collection journey sends the exact locked invoice balances", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000105");
  await page.goto(customerUrl("/klant/facturen"));
  await page.getByRole("button", { name: "Samen betalen" }).click();
  const collectionDialog = page.getByRole("dialog", {
    name: "Facturen samen betalen",
  });
  await expect(collectionDialog).toBeVisible();
  for (const invoiceNumber of ["RTA-INV-001", "RTA-CANCEL-INV-001"]) {
    await collectionDialog
      .getByText(invoiceNumber, { exact: true })
      .locator("xpath=ancestor::label")
      .getByRole("checkbox")
      .uncheck();
  }
  await collectionDialog
    .getByRole("button", { name: "Geselecteerde facturen betalen" })
    .click();
  await expect(page).toHaveURL(
    /127\.0\.0\.1:9325\/checkout\/tr_fieldgrid_e2e_0002/u,
  );

  const proof = await (
    await request.get("http://127.0.0.1:9325/payment-provider-proof")
  ).json();
  expect(proof.createAttempts).toBe(2);
  expect(proof.uniquePayments).toBe(2);
  expect(proof.payments[1].amount).toEqual({ currency: "EUR", value: "36.30" });
  expect(proof.payments[1].metadata.sourceType).toBe("invoice_collection");
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
  await expect(page.locator("main")).toContainText(
    "€ 250,00 akkoord gegeven.",
    {
      timeout: 15_000,
    },
  );
  await expect(page.locator("main")).toContainText("Geen offertes gevonden");

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
  test.setTimeout(60_000);
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
  await expect(page).toHaveURL(/\/klant\/reset-wachtwoord/u, {
    timeout: 15_000,
  });

  await page.locator('input[name="password"]').fill("Fieldgrid!Phase2B42");
  await page.locator('input[name="passwordTwo"]').fill("Fieldgrid!Phase2B42");
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page).toHaveURL(
    /\/klant\/login\?message=Wachtwoord\+succesvol\+gewijzigd/u,
    { timeout: 15_000 },
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
  await expect(page).toHaveURL(/\/personeel\/reset-wachtwoord/u, {
    timeout: 15_000,
  });

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
  test.setTimeout(120_000);
  await useIdentity(page, "20000000-0000-4000-8000-000000000102", tenantAHost);
  let response = await page.goto(customerUrl("/klant"), {
    waitUntil: "domcontentloaded",
  });
  await expectDeniedOrLogin(page, response);

  await useIdentity(page, "20000000-0000-4000-8000-000000000102", tenantAHost);
  let rootCookieHeader = "";
  const captureRootRequest = (request: import("@playwright/test").Request) => {
    if (request.url() === `http://${tenantAHost}:9321/`) {
      rootCookieHeader = request.headers()["cookie"] ?? "";
    }
  };
  page.on("request", captureRootRequest);
  response = await page.goto(`http://${tenantAHost}:9321/`, {
    waitUntil: "domcontentloaded",
  });
  page.off("request", captureRootRequest);
  expect(response?.status()).toBe(404);
  expect(rootCookieHeader).not.toContain("fieldgrid_e2e_auth_user");
  await expect(page.locator("body")).not.toContainText(
    /Planbord|Runtime Customer A/u,
  );

  await useIdentity(page, "20000000-0000-4000-8000-000000000202", tenantAHost);
  response = await page.goto(backofficeUrl("/customers"), {
    waitUntil: "domcontentloaded",
  });
  await expectDeniedOrLogin(page, response);
  await expect(page.locator("body")).not.toContainText("Runtime Customer A");
  await useIdentity(page, "20000000-0000-4000-8000-000000000102", unknownHost);
  response = await page.goto(backofficeUrl("/", unknownHost), {
    waitUntil: "domcontentloaded",
  });
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, "20000000-0000-4000-8000-000000000106", tenantAHost);
  response = await page.goto(personnelUrl("/personeel/opdrachten"), {
    waitUntil: "domcontentloaded",
  });
  await expectDeniedOrLogin(page, response);
  await useIdentity(
    page,
    "20000000-0000-4000-8000-000000000401",
    suspendedHost,
  );
  const suspendedAssetPattern = `http://${suspendedHost}:9321/admin/_next/static/chunks/main-app.js*`;
  let suspendedAssetIntercepted = false;
  let releaseSuspendedAsset = () => undefined;
  const suspendedAssetRelease = new Promise<void>((resolve) => {
    releaseSuspendedAsset = resolve;
  });
  let markSuspendedAssetHandled = () => undefined;
  const suspendedAssetHandled = new Promise<void>((resolve) => {
    markSuspendedAssetHandled = resolve;
  });
  await page.route(suspendedAssetPattern, async (route) => {
    suspendedAssetIntercepted = true;
    try {
      await suspendedAssetRelease;
      await route.continue();
    } finally {
      markSuspendedAssetHandled();
    }
  });
  try {
    response = await page.goto(backofficeUrl("/", suspendedHost), {
      waitUntil: "domcontentloaded",
    });
    await expect.poll(() => suspendedAssetIntercepted).toBe(true);
    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(backofficeUrl("/", suspendedHost));
    await expect(
      page.getByRole("heading", { name: "Geen actieve organisatietoegang" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /Runtime Customer A|Runtime Customer B|Runtime Assignment A|Runtime Assignment B/u,
    );
    await expectDeniedOrLogin(page, response);
  } finally {
    releaseSuspendedAsset();
    if (suspendedAssetIntercepted) await suspendedAssetHandled;
    await page.unroute(suspendedAssetPattern);
  }
  await useIdentity(page, "20000000-0000-4000-8000-000000000104", tenantAHost);
  response = await page.goto(
    personnelUrl(`/personeel/opdrachten/${tenantBAssignmentId}`),
    { waitUntil: "domcontentloaded" },
  );
  await expectDeniedOrLogin(page, response);
  await expect(page.locator("body")).not.toContainText("Runtime Assignment B");
});

test("9. Offline work-order mutation chain survives refresh and converges after reconnect", async ({
  page,
  context,
}) => {
  test.info().annotations.push({
    type: "fieldgrid.journey-id",
    description: "phase2.offline.mutation-chain",
  });
  test.setTimeout(60_000);
  const startedAt = new Date().toISOString();
  await page.addInitScript(() => {
    const observations: unknown[] = [];
    const queueSnapshots: unknown[] = [];
    Object.defineProperty(window, "__fieldgridOfflineSyncObservations", {
      configurable: true,
      value: observations,
    });
    Object.defineProperty(window, "__fieldgridOfflineQueueSnapshots", {
      configurable: true,
      value: queueSnapshots,
    });
    window.addEventListener("veele:offline-sync-observation", (event) => {
      observations.push((event as CustomEvent).detail);
    });
    window.addEventListener("veele:offline-work-order-queue", () => {
      queueSnapshots.push(
        JSON.parse(
          localStorage.getItem(
            "veele-personeel-offline-work-order-actions-v1",
          ) ?? "[]",
        ),
      );
    });
  });
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
  await page.waitForLoadState("networkidle");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Onderweg" }).click();
  await page.getByRole("button", { name: "Onderweg melden" }).click();
  await expect(
    page.getByText(/Onderweg melden is offline opgeslagen/i),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Runtime offline checklist task" })
    .click();
  await expect(
    page.getByText(/Taakwijziging is offline opgeslagen/i),
  ).toBeVisible();
  await expect(page).toHaveURL(
    personnelUrl(
      `/personeel/opdrachten/${tenantAAssignmentId}?tab=werkzaamheden`,
    ),
  );

  const queueKey = "veele-personeel-offline-work-order-actions-v1";
  const queuedActionCount = async () => {
    try {
      return await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "[]").length,
        queueKey,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /execution context was destroyed|most likely because of a navigation/iu.test(
          error.message,
        )
      ) {
        return -1;
      }
      throw error;
    }
  };
  const queued = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    queueKey,
  );
  expect(queued).toHaveLength(2);
  expect(queued[0]).toMatchObject({
    type: "mark-assignment-en-route",
    assignmentId: tenantAAssignmentId,
    status: "pending",
  });
  expect(queued[1]).toMatchObject({
    type: "set-task-completion",
    assignmentId: tenantAAssignmentId,
    status: "pending",
  });
  expect(queued[0].idempotencyKey).toEqual(expect.any(String));
  expect(queued[1].idempotencyKey).toEqual(expect.any(String));
  expect(queued[0].expectedParticipantVersion).toEqual(expect.any(Number));
  expect(queued[1].expectedParticipantVersion).toBe(
    queued[0].expectedParticipantVersion,
  );
  expect(queued[1].dependsOnMutationId).toBe(queued[0].idempotencyKey);
  const initialVersion = Number(queued[0].expectedParticipantVersion);
  const mutationIds = queued.map((action: { idempotencyKey: unknown }) =>
    String(action.idempotencyKey),
  );
  for (const mutationId of mutationIds) {
    expect(mutationId).toMatch(/^personnel-pwa:[A-Za-z0-9-]{16,128}$/u);
  }
  const passCountBeforeReconnect = await page.evaluate(
    () =>
      (
        (window as Window & { __fieldgridOfflineSyncObservations?: unknown[] })
          .__fieldgridOfflineSyncObservations ?? []
      ).filter((entry) => (entry as { type?: string }).type === "pass-started")
        .length,
  );

  let releaseFirstAttempt = () => undefined;
  const firstAttemptRelease = new Promise<void>((resolve) => {
    releaseFirstAttempt = resolve;
  });
  let markFirstAttemptStarted = () => undefined;
  const firstAttemptStarted = new Promise<void>((resolve) => {
    markFirstAttemptStarted = resolve;
  });
  let clientAttemptCount = 0;
  let activeClientAttempts = 0;
  let maximumActiveClientAttempts = 0;
  const requestBodies: string[] = [];

  // The first real server-action request is held behind a deterministic
  // barrier. Reconnect/focus/visibility/service-worker triggers are emitted
  // while the synchronization pass is provably active. The request then
  // reaches the deterministic E2E database adapter, which returns one
  // structured 40001 failure before allowing the stable retry through.
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = route.request().postData() ?? "";
    requestBodies.push(body);
    clientAttemptCount += 1;
    activeClientAttempts += 1;
    maximumActiveClientAttempts = Math.max(
      maximumActiveClientAttempts,
      activeClientAttempts,
    );
    try {
      if (clientAttemptCount === 1) {
        markFirstAttemptStarted();
        await firstAttemptRelease;
        await route.continue();
        return;
      }
      await route.continue();
    } finally {
      activeClientAttempts -= 1;
    }
  });

  await context.setOffline(false);
  await firstAttemptStarted;
  await expect.poll(queuedActionCount).toBe(2);
  const heldQueue = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
    queueKey,
  );
  expect(heldQueue[0]).toMatchObject({
    idempotencyKey: mutationIds[0],
    status: "syncing",
  });
  const firstStillDurable = heldQueue.some(
    (action: { idempotencyKey?: string }) =>
      action.idempotencyKey === mutationIds[0],
  );
  expect(firstStillDurable).toBe(true);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const observationsDuringAttempt = await page.evaluate(
    () =>
      (window as Window & { __fieldgridOfflineSyncObservations?: unknown[] })
        .__fieldgridOfflineSyncObservations ?? [],
  );
  const triggerWasRecordedDuringActivePass = observationsDuringAttempt.some(
    (entry) => {
      const observation = entry as {
        type?: string;
        requestedGeneration?: number;
        completedGeneration?: number;
      };
      return (
        observation.type === "requested" &&
        Number(observation.requestedGeneration) >
          Number(observation.completedGeneration)
      );
    },
  );
  expect(triggerWasRecordedDuringActivePass).toBe(true);

  releaseFirstAttempt();
  await expect.poll(queuedActionCount, { timeout: 20_000 }).toBe(0);
  await page.unroute("**/*");

  expect(clientAttemptCount).toBe(3);
  expect(maximumActiveClientAttempts).toBe(1);
  expect(requestBodies).toHaveLength(3);
  expect(
    requestBodies.filter((body) => body.includes(mutationIds[0])).length,
  ).toBe(2);
  expect(
    requestBodies.filter((body) => body.includes(mutationIds[1])).length,
  ).toBe(1);

  const queueSnapshots = (await page.evaluate(
    () =>
      (window as Window & { __fieldgridOfflineQueueSnapshots?: unknown[] })
        .__fieldgridOfflineQueueSnapshots ?? [],
  )) as Array<
    Array<{
      attempts?: number;
      idempotencyKey?: string;
      lastErrorClassification?: string;
      lastErrorDiagnosticId?: string;
      lastErrorRetryable?: boolean;
      lastErrorSqlState?: string;
      status?: string;
    }>
  >;
  const transientQueueState = queueSnapshots
    .flat()
    .find(
      (action) =>
        action.idempotencyKey === mutationIds[0] &&
        action.status === "retry_wait" &&
        action.lastErrorClassification === "transient",
    );
  expect(transientQueueState).toMatchObject({
    attempts: 1,
    idempotencyKey: mutationIds[0],
    lastErrorClassification: "transient",
    lastErrorRetryable: true,
    lastErrorSqlState: "40001",
    status: "retry_wait",
  });
  expect(transientQueueState?.lastErrorDiagnosticId).toMatch(
    /^offline-[0-9a-f-]{36}$/iu,
  );

  const observations = await page.evaluate(
    () =>
      (window as Window & { __fieldgridOfflineSyncObservations?: unknown[] })
        .__fieldgridOfflineSyncObservations ?? [],
  );
  const startedPasses = observations.filter(
    (entry) => (entry as { type?: string }).type === "pass-started",
  ) as Array<{ generation: number; triggers: string[] }>;
  const reconnectPasses = startedPasses.slice(passCountBeforeReconnect);
  expect(reconnectPasses.length).toBeGreaterThanOrEqual(2);
  const coalescedReconnectPass = reconnectPasses.find((pass) =>
    ["online", "focus", "visibility"].every((trigger) =>
      pass.triggers.includes(trigger),
    ),
  );
  expect(coalescedReconnectPass).toBeTruthy();

  const databaseUrl = process.env.DATABASE_URL;
  expect(
    databaseUrl,
    "DATABASE_URL is required for canonical offline evidence",
  ).toBeTruthy();
  const sql = `
    select json_build_object(
      'canonicalReceiptCount', count(*) filter (where operation_id in ('${mutationIds[0]}', '${mutationIds[1]}')),
      'completedCanonicalReceiptCount', count(*) filter (
        where operation_id in ('${mutationIds[0]}', '${mutationIds[1]}') and canonical_response is not null and completed_at is not null
      ),
      'canonicalVersions', coalesce(json_agg(
        coalesce((canonical_response->>'participantVersion')::bigint, (canonical_response->>'version')::bigint)
        order by created_at
      ) filter (where operation_id in ('${mutationIds[0]}', '${mutationIds[1]}')), '[]'::json),
      'taskCompletionRowCount', (
        select count(*) from assignment_tasks
        where id = '${offlineTaskId}' and completed_at is not null
      )
    )::text
    from offline_operation_receipts;
  `;
  const databaseProof = JSON.parse(
    execFileSync(
      "psql",
      [
        databaseUrl!,
        "--no-psqlrc",
        "--tuples-only",
        "--no-align",
        "--command",
        sql,
      ],
      { encoding: "utf8" },
    ).trim(),
  ) as {
    canonicalReceiptCount: number;
    completedCanonicalReceiptCount: number;
    canonicalVersions: number[];
    taskCompletionRowCount: number;
  };
  expect(databaseProof).toEqual({
    canonicalReceiptCount: 2,
    completedCanonicalReceiptCount: 2,
    canonicalVersions: [initialVersion + 1, initialVersion + 1],
    taskCompletionRowCount: 1,
  });

  // A document reload must converge to the durable canonical result without
  // recreating the queue or replaying the mutation.
  await page.reload();
  await expect(page.getByText(/^1 van \d+ afgerond$/u)).toBeVisible();
  await expect.poll(queuedActionCount).toBe(0);

  const exactGitHead = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const evidence = {
    schemaVersion: "2.0.0",
    exactGitHead,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "passed",
    mandatoryJourneySkipped: false,
    offlineTransitionObserved: true,
    queueBeforeReconnect: queued.length,
    activeAttemptHeld: true,
    firstStillDurable,
    triggerDuringActiveSync: triggerWasRecordedDuringActivePass,
    coalescedFollowUpPass: Boolean(coalescedReconnectPass),
    synchronizationPassCount: reconnectPasses.length,
    clientAttemptCount,
    maximumActiveClientAttempts,
    queueAfterReconnect: await queuedActionCount(),
    mutationIdSha256: createHash("sha256").update(mutationIds[0]).digest("hex"),
    sequentialMutationIdSha256: mutationIds.map((mutationId) =>
      createHash("sha256").update(mutationId).digest("hex"),
    ),
    entityStream: String(queued[0].entityStreamKey),
    initialVersion,
    canonicalVersions: databaseProof.canonicalVersions,
    dependencyAdvanced:
      databaseProof.canonicalVersions[0] === initialVersion + 1,
    transientFailure: {
      sqlState: transientQueueState?.lastErrorSqlState,
      classification: transientQueueState?.lastErrorClassification,
      retryable: transientQueueState?.lastErrorRetryable,
      retryAttempt: transientQueueState?.attempts,
      mutationIdSha256: createHash("sha256")
        .update(String(transientQueueState?.idempotencyKey))
        .digest("hex"),
      diagnosticIdSha256: createHash("sha256")
        .update(String(transientQueueState?.lastErrorDiagnosticId))
        .digest("hex"),
    },
    canonicalReceiptCount: databaseProof.canonicalReceiptCount,
    completedCanonicalReceiptCount:
      databaseProof.completedCanonicalReceiptCount,
    serverMutationCount: databaseProof.canonicalReceiptCount,
    taskCompletionRowCount: databaseProof.taskCompletionRowCount,
    reloadConverged: true,
    duplicateExecutionCount: Math.max(
      databaseProof.taskCompletionRowCount - 1,
      0,
    ),
    duplicateReceiptCount: Math.max(
      databaseProof.canonicalReceiptCount - mutationIds.length,
      0,
    ),
  };
  const artifactDir = join(process.cwd(), "artifacts", "fieldgrid-playwright");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, "offline-reconnect-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );

  // The next serial journey owns the same deterministic assignment fixture.
  // Restore that fixture only after all offline runtime evidence is captured.
  execFileSync("node", ["e2e/fieldgrid/fixtures/seed-e2e-fixtures.mjs"], {
    env: process.env,
    stdio: "pipe",
  });
});
