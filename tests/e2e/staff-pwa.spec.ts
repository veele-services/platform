import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import sharp from "sharp";
import { authenticateStaff } from "./staff-auth";
import { requireLocalDatabaseUrl } from "./local-target";

const worker = "field-worker@fieldgrid.test";
const accountSettings = "/staff?tab=meer&section=instellingen";
const installDialog = (page: Page) => page.getByRole("dialog", { name: "Installeer Fieldgrid", exact: true });

async function preferences(page: Page) {
  return page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.startsWith("fieldgrid:pwa-install:"))
    .map(([key, raw]) => ({ key, value: JSON.parse(raw) as { phase: string; session?: string } })));
}

async function accountInstallButton(page: Page) {
  const settings = page.locator(".ps-settings-screen");
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Account & toegang", exact: true }).click();
  return settings.getByRole("region", { name: "Personeelsapp installeren", exact: true });
}

async function syntheticInstallEvent(page: Page, outcome: "accepted" | "dismissed") {
  // This simulates the browser API boundary, not an OS installation. The
  // server's real manifest/icon responses are verified separately below.
  await page.evaluate(choice => {
    const target = window as Window & { __pwaPrompts?: Array<{ active: boolean; outcome: string }> };
    target.__pwaPrompts ??= [];
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: () => {
        target.__pwaPrompts!.push({ active: navigator.userActivation.isActive, outcome: choice });
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: choice }),
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error("The staff install controller did not capture the native install event");
  }, outcome);
}

test("bestaande medewerker krijgt na de volgende echte login precies één herinnering, met installeren daarna via instellingen", async ({ page }) => {
  test.setTimeout(90_000);
  await authenticateStaff(page, worker, accountSettings);
  const settingsInstall = await accountInstallButton(page);
  await expect.poll(async () => (await preferences(page)).map(item => item.value.phase)).toEqual(["waiting"]);
  const initial = (await preferences(page))[0];
  expect(initial.key).toMatch(/^fieldgrid:pwa-install:[a-f0-9]{64}$/);
  expect(initial.value.session).toMatch(/^[a-f0-9]{64}$/);
  await expect(installDialog(page)).toBeHidden();

  // A new render of the authenticated page must not be mistaken for a new
  // login. Focus invokes the same router.refresh used by realtime updates.
  const refresh = page.waitForResponse(response => response.request().headers().rsc === "1" && new URL(response.url()).pathname === "/staff");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refresh;
  await expect(installDialog(page)).toBeHidden();
  expect((await preferences(page))[0]).toEqual(initial);
  await page.reload();
  await accountInstallButton(page);
  await expect(installDialog(page)).toBeHidden();
  expect((await preferences(page))[0]).toEqual(initial);

  // This helper creates another independently verified Supabase auth session;
  // preserving localStorage models the next login on the same browser/device.
  await authenticateStaff(page, worker, accountSettings);
  const reminder = installDialog(page);
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText("Eenmalige herinnering");
  await expect(reminder).toContainText("Dit is de laatste automatische herinnering");
  await expect.poll(async () => (await preferences(page))[0]?.value.phase).toBe("done");
  await reminder.getByRole("button", { name: "Voor nu overslaan", exact: true }).click();
  await expect(reminder).toBeHidden();
  await page.reload();
  await accountInstallButton(page);
  await expect(reminder).toBeHidden();
  await authenticateStaff(page, worker, accountSettings);
  await accountInstallButton(page);
  await expect(reminder).toBeHidden();

  await settingsInstall.getByRole("button", { name: "App installeren", exact: true }).click();
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText("Op dit apparaat");
  await expect(reminder).not.toContainText("Eenmalige herinnering");
  await reminder.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(reminder).toBeHidden();
});

test("native Android-installatie vraagt pas na de klik, behandelt annuleren en herkent appinstalled", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateStaff(page, worker, accountSettings);
  const settingsInstall = await accountInstallButton(page);
  await syntheticInstallEvent(page, "dismissed");
  expect(await page.evaluate(() => (window as Window & { __pwaPrompts?: unknown[] }).__pwaPrompts)).toEqual([]);
  await settingsInstall.getByRole("button", { name: "App installeren", exact: true }).click();
  const dialog = installDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Je browser opent het installatievenster");
  await expect(dialog.getByRole("button", { name: "App installeren", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("staff-pwa-native-390.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "App installeren", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Je kunt de app later installeren");
  await expect(dialog.getByRole("button", { name: "App installeren", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __pwaPrompts?: unknown[] }).__pwaPrompts)).toEqual([{ active: true, outcome: "dismissed" }]);
  await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();

  await syntheticInstallEvent(page, "accepted");
  await settingsInstall.getByRole("button", { name: "App installeren", exact: true }).click();
  await dialog.getByRole("button", { name: "App installeren", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(settingsInstall.getByRole("button", { name: "Installatie bekijken", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __pwaPrompts?: unknown[] }).__pwaPrompts)).toEqual([
    { active: true, outcome: "dismissed" }, { active: true, outcome: "accepted" },
  ]);
  await authenticateStaff(page, worker, accountSettings);
  await accountInstallButton(page);
  await expect(dialog).toBeHidden();
});

test("iPhone-installatie geeft echte Deel-instructies en geen nagebootste native installatieknop", async ({ browser }, info) => {
  // UA/touch emulation exercises the iOS presentation branch. It does not
  // claim to install a webapp on physical Safari/iOS hardware.
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "nl-NL", timezoneId: "Europe/Amsterdam",
  });
  const page = await context.newPage();
  try {
    await authenticateStaff(page, worker, accountSettings);
    const settingsInstall = await accountInstallButton(page);
    await syntheticInstallEvent(page, "accepted");
    await settingsInstall.getByRole("button", { name: "App installeren", exact: true }).click();
    const dialog = installDialog(page);
    await expect(dialog.getByRole("heading", { name: "Installeren op iPhone of iPad", exact: true })).toBeVisible();
    await expect(dialog).toContainText("Deel");
    await expect(dialog).toContainText("Zet op beginscherm");
    await expect(dialog).toContainText("Voeg toe");
    await expect(dialog.getByRole("button", { name: "App installeren", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __pwaPrompts?: unknown[] }).__pwaPrompts)).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("staff-pwa-ios-instructions-390.png"), animations: "disabled" });
    await dialog.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally { await context.close(); }
});

test("een reeds geïnstalleerde standalone-app toont geen automatische installatieherinneringen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "nl-NL", timezoneId: "Europe/Amsterdam" });
  await context.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = original(query);
      if (query === "(display-mode: standalone)") Object.defineProperty(media, "matches", { value: true });
      return media;
    };
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  const page = await context.newPage();
  try {
    await authenticateStaff(page, worker, accountSettings);
    const settingsInstall = await accountInstallButton(page);
    await expect(settingsInstall).toContainText("Je gebruikt de geïnstalleerde app");
    await expect.poll(async () => (await preferences(page))[0]?.value.phase).toBe("done");
    await authenticateStaff(page, worker, accountSettings);
    await accountInstallButton(page);
    await expect(installDialog(page)).toBeHidden();
    await settingsInstall.getByRole("button", { name: "Installatie bekijken", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "App geïnstalleerd", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "App installeren", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test("installatievoorkeuren blijven per account gescheiden op hetzelfde apparaat", async ({ page }) => {
  test.setTimeout(90_000);
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const newcomer = "new-field-worker@fieldgrid.test";
  let original: { id: string; tenant_id: string; completed: string | null } | undefined;
  try {
    original = (await db.query("select p.id,p.tenant_id,p.onboarding_completed_at::text as completed from public.personnel p join auth.users u on u.id=p.user_id join public.tenants t on t.id=p.tenant_id where t.slug='fieldgrid-e2e' and u.email=$1", [newcomer])).rows[0];
    expect(original).toBeDefined();
    await db.query("update public.personnel set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where tenant_id=$1 and id=$2", [original!.tenant_id, original!.id]);
    await authenticateStaff(page, worker, accountSettings);
    await accountInstallButton(page);
    await expect.poll(async () => (await preferences(page)).length).toBe(1);
    const firstKey = (await preferences(page))[0].key;
    await authenticateStaff(page, worker, accountSettings);
    await expect(installDialog(page)).toBeVisible();
    await installDialog(page).getByRole("button", { name: "Voor nu overslaan", exact: true }).click();
    await authenticateStaff(page, newcomer, accountSettings);
    await accountInstallButton(page);
    await expect.poll(async () => (await preferences(page)).length).toBe(2);
    await expect(installDialog(page)).toBeHidden();
    const items = await preferences(page);
    expect(items.find(item => item.key === firstKey)?.value.phase).toBe("done");
    expect(items.find(item => item.key !== firstKey)?.value.phase).toBe("waiting");
    expect(items.every(item => /^fieldgrid:pwa-install:[a-f0-9]{64}$/.test(item.key))).toBe(true);
    await authenticateStaff(page, newcomer, accountSettings);
    await expect(installDialog(page)).toBeVisible();
    await installDialog(page).getByRole("button", { name: "Voor nu overslaan", exact: true }).click();
    await authenticateStaff(page, worker, accountSettings);
    await accountInstallButton(page);
    await expect(installDialog(page)).toBeHidden();
  } finally {
    if (original) await db.query("update public.personnel set onboarding_completed_at=$3 where tenant_id=$1 and id=$2", [original.tenant_id, original.id, original.completed]);
    await db.end();
  }
});

test("anonieme personeelslogin publiceert een installeerbaar manifest, rastericonen en Apple-startschermmetadata", async ({ page, request }) => {
  await page.goto("/login?next=%2Fstaff");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/staff/manifest.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Fieldgrid");
  const touch = page.locator('link[rel="apple-touch-icon"]').first();
  await expect(touch).toHaveAttribute("sizes", "180x180");
  const manifestResponse = await request.get("/staff/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["cache-control"]).toContain("no-store");
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Fieldgrid");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/staff");
  expect(manifest.id).toBe("/staff");
  for (const size of [192, 512]) for (const purpose of ["any", "maskable"]) {
    const icon = manifest.icons.find((item: { sizes: string; purpose: string }) => item.sizes === `${size}x${size}` && item.purpose === purpose);
    expect(icon).toBeDefined();
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const metadata = await sharp(await response.body()).metadata();
    expect([metadata.width, metadata.height]).toEqual([size, size]);
  }
  const appleIcon = await request.get((await touch.getAttribute("href"))!);
  expect(appleIcon.status()).toBe(200);
  const appleMetadata = await sharp(await appleIcon.body()).metadata();
  expect([appleMetadata.width, appleMetadata.height]).toEqual([180, 180]);
  const splash = page.locator('link[rel="apple-touch-startup-image"][media*="device-width: 390px"][media*="orientation: portrait"]');
  await expect(splash).toHaveCount(1);
  const splashResponse = await request.get((await splash.getAttribute("href"))!);
  expect(splashResponse.status()).toBe(200);
  expect(splashResponse.headers()["cache-control"]).toContain("no-store");
  const splashMetadata = await sharp(await splashResponse.body()).metadata();
  expect([splashMetadata.width, splashMetadata.height]).toEqual([1170, 2532]);
});
