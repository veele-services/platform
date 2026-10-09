import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  actionTimeout: 15000,
});
test.setTimeout(240000);

async function fitsViewport(page: Page, dialog: Locator) {
  await dialog.evaluate(async (node) => {
    await Promise.all(
      node.getAnimations().map((a) => a.finished.catch(() => {})),
    );
  });
  await expect
    .poll(() =>
      dialog.evaluate((node) => node.contains(document.activeElement)),
    )
    .toBe(true);
  await expect
    .poll(() =>
      dialog.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}
async function audience(dialog: Locator, tenantName: string, groups: string[]) {
  await dialog
    .getByRole("combobox", { name: "Tenantbereik", exact: true })
    .selectOption("selected");
  for (const group of groups)
    await dialog.getByRole("checkbox", { name: group, exact: true }).check();
  await dialog.getByRole("checkbox", { name: tenantName, exact: true }).check();
}
async function closeDialog(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sluiten", exact: true })
    .click();
}

test("idee → interne beoordeling → roadmap → gerichte release, veilige bestanden en vier responsive portalen", async ({
  page,
  browser,
}, info) => {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const admin = createClient(
    requireLocalApiUrl().href,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const tenant = randomUUID(),
    customer = randomUUID(),
    contact = randomUUID(),
    marker = randomUUID().slice(0, 8),
    tenantName = `Producttest ${marker}`,
    email = `product-${marker}@fieldgrid.test`;
  const ideaTitle = `Idee ${marker}`,
    roadmapTitle = `Ontwikkeling ${marker}`,
    releaseTitle = `Release ${marker}`,
    publicPart = `Algemene verbetering ${marker}`,
    staffPart = `Personeelsverbetering ${marker}`;
  const colleague = await browser.newContext(),
    staffContext = await browser.newContext(),
    customerContext = await browser.newContext();
  let customerUser = "",
    ideaId = "",
    releaseId = "";
  try {
    const owner = (
        await db.query(
          "select id from auth.users where email='platform-admin@fieldgrid.test'",
        )
      ).rows[0].id,
      worker = (
        await db.query(
          "select id from auth.users where email='field-worker@fieldgrid.test'",
        )
      ).rows[0].id;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "Fieldgrid-E2E-2026",
    });
    if (created.error) throw new Error("Local product customer fixture failed");
    customerUser = created.data.user.id;
    await db.query(
      "insert into public.tenants(id,slug,name) values($1,$2,$3)",
      [tenant, `product-${marker}`, tenantName],
    );
    await db.query(
      "insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','klantportaal','tickets'])",
      [tenant],
    );
    await db.query("insert into public.tenant_branding(tenant_id) values($1)", [
      tenant,
    ]);
    for (const [user, role] of [
      [owner, "management"],
      [worker, "staff"],
    ])
      await db.query(
        "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",
        [tenant, user, role],
      );
    await db.query(
      "insert into public.personnel(tenant_id,user_id,employee_number,full_name,email,status,onboarding_step,onboarding_completed_at) values($1,$2,'PRODUCT-TEST','Fictieve medewerker','field-worker@fieldgrid.test','active',5,now())",
      [tenant, worker],
    );
    await db.query(
      "insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'PRODUCT-CUSTOMER','Fictieve klant')",
      [customer, tenant],
    );
    await db.query(
      "insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'Fictieve klantgebruiker',$4)",
      [contact, tenant, customer, email],
    );
    await db.query(
      "insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,onboarding_completed_at,created_by) values($1,$2,$3,$4,true,now(),$5)",
      [tenant, customer, customerUser, contact, owner],
    );
    for (const context of [
      page.context(),
      colleague,
      staffContext,
      customerContext,
    ])
      await context.addCookies([
        {
          name: "fieldgrid_tenant_id",
          value: tenant,
          url: "http://127.0.0.1:3000",
        },
      ]);
    await authenticateWorkspace(
      page,
      "platform-admin@fieldgrid.test",
      "/app/updates",
    );
    await expect(
      page.getByRole("heading", { name: "Roadmap & updates", exact: true }),
    ).toBeVisible();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("button", { name: "Idee indienen", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Idee indienen",
        exact: true,
      });
      await fitsViewport(page, dialog);
      await page.screenshot({
        path: info.outputPath(`product-idea-${width}.png`),
      });
      await dialog
        .getByRole("button", { name: "Annuleren", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Idee indienen", exact: true })
      .click();
    const idea = page.getByRole("dialog", {
      name: "Idee indienen",
      exact: true,
    });
    await idea.getByLabel("Titel", { exact: true }).fill(ideaTitle);
    await idea
      .getByLabel("Onderdeel / categorie", { exact: true })
      .fill("Planning");
    await idea
      .getByLabel("Wat wil je verbeteren?", { exact: true })
      .fill(`PRIVATE INPUT ${marker}: betere planning van onze organisatie`);
    await idea.getByLabel("Bijlage / screenshot (optioneel)").setInputFiles({
      name: "screenshot.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1UAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await idea
      .getByRole("button", { name: "Idee indienen", exact: true })
      .click();
    const own = page.getByRole("dialog", { name: ideaTitle, exact: true });
    await expect(own).toContainText("Ontvangen");
    await expect(
      own.getByRole("link", { name: "screenshot.png" }),
    ).toBeVisible();
    ideaId = (
      await db.query(
        "select id from private.product_ideas where tenant_id=$1",
        [tenant],
      )
    ).rows[0].id;
    const fileUrl = await own
      .getByRole("link", { name: "screenshot.png" })
      .getAttribute("href");
    expect((await page.request.get(fileUrl!)).status()).toBe(200);
    await closeDialog(page);
    const management = await colleague.newPage();
    await authenticateWorkspace(
      management,
      "platform-admin@fieldgrid.test",
      `/app/updates?idea=${ideaId}`,
    );
    await expect(
      management.getByRole("dialog", { name: ideaTitle, exact: true }),
    ).toContainText("PRIVATE INPUT");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/platform/productbeheer");
    await expect(
      page
        .locator(".fg-sidebar")
        .getByRole("link", { name: "Productbeheer", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: ideaTitle, exact: true }).click();
    const review = page.getByRole("dialog", { name: ideaTitle, exact: true });
    await expect(review).toContainText("Concept");
    await review
      .getByLabel("Interne notitie toevoegen", { exact: true })
      .fill(`INTERNAL NOTE ${marker}`);
    await review
      .getByRole("button", { name: "Intern opslaan", exact: true })
      .click();
    await expect(review).toContainText(`INTERNAL NOTE ${marker}`);
    await review
      .getByRole("button", { name: "Nieuw roadmapitem maken", exact: true })
      .click();
    const roadmap = page.getByRole("dialog", {
      name: "Algemene ontwikkeling maken",
      exact: true,
    });
    await expect(roadmap.getByLabel("Titel", { exact: true })).toBeEmpty();
    await roadmap.getByLabel("Titel", { exact: true }).fill(roadmapTitle);
    await roadmap
      .getByLabel("Onderdeel / categorie", { exact: true })
      .fill("Planning");
    await roadmap
      .getByLabel("Korte omschrijving", { exact: true })
      .fill("Algemene verbetering voor onze portalen");
    await roadmap
      .getByRole("combobox", { name: "Voortgang", exact: true })
      .selectOption("development");
    await roadmap.getByRole("button", { name: "Opslaan", exact: true }).click();
    const development = page.getByRole("dialog", {
      name: roadmapTitle,
      exact: true,
    });
    await expect(development).toContainText("Concept");
    await management.reload();
    await expect(
      management.getByRole("dialog", { name: ideaTitle, exact: true }),
    ).not.toContainText(`INTERNAL NOTE ${marker}`);
    await expect(
      management.getByRole("dialog", { name: ideaTitle, exact: true }),
    ).not.toContainText(roadmapTitle);
    await development
      .getByRole("button", { name: "Bewerken", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Ontwikkeling bewerken",
      exact: true,
    });
    await audience(editor, tenantName, ["Management", "Personeel", "Klanten"]);
    await editor.getByRole("button", { name: "Opslaan", exact: true }).click();
    await page
      .getByRole("dialog", { name: roadmapTitle, exact: true })
      .getByRole("button", { name: "Publiceren", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Publicatie bevestigen", exact: true })
      .getByRole("button", { name: "Bevestigen", exact: true })
      .click();
    await closeDialog(page);
    await page.getByRole("tab", { name: "Releases", exact: true }).click();
    await page
      .getByRole("button", { name: "Nieuwe release", exact: true })
      .click();
    const release = page.getByRole("dialog", {
      name: "Release bewerken",
      exact: true,
    });
    await release.getByLabel("Titel", { exact: true }).fill(releaseTitle);
    await release
      .getByLabel("Versienummer of releasenaam")
      .fill(`test-${marker}`);
    await release
      .getByLabel("Algemene introductie")
      .fill("Gedeelde informatie voor alle toegestane gebruikers");
    await audience(release, tenantName, ["Management", "Personeel", "Klanten"]);
    await release.getByRole("button", { name: "Opslaan", exact: true }).click();
    const releaseDetail = page.getByRole("dialog", {
      name: releaseTitle,
      exact: true,
    });
    await releaseDetail
      .getByRole("button", { name: "Onderdeel toevoegen", exact: true })
      .click();
    const part = page.getByRole("dialog", {
      name: "Releaseonderdeel bewerken",
      exact: true,
    });
    await part.getByLabel("Titel", { exact: true }).fill(publicPart);
    await part
      .getByLabel("Onderdeel / categorie", { exact: true })
      .fill("Planning");
    await part
      .getByLabel("Uitleg", { exact: true })
      .fill("Dit onderdeel is voor de volledige releasedoelgroep.");
    await part
      .getByRole("checkbox", { name: "Staging registreren", exact: true })
      .check();
    await part
      .getByRole("combobox", { name: "Beschikbaar voor", exact: true })
      .selectOption("all");
    await part.getByRole("button", { name: "Opslaan", exact: true }).click();
    await releaseDetail
      .getByRole("button", { name: "Onderdeel toevoegen", exact: true })
      .click();
    const onlyStaff = page.getByRole("dialog", {
      name: "Releaseonderdeel bewerken",
      exact: true,
    });
    await onlyStaff.getByLabel("Titel", { exact: true }).fill(staffPart);
    await onlyStaff
      .getByLabel("Onderdeel / categorie", { exact: true })
      .fill("Personeel");
    await onlyStaff
      .getByLabel("Uitleg", { exact: true })
      .fill("Dit onderdeel is uitsluitend voor personeel.");
    await onlyStaff
      .getByRole("combobox", { name: "Doelgroep van onderdeel", exact: true })
      .selectOption("restrict");
    await audience(onlyStaff, tenantName, ["Personeel"]);
    await onlyStaff
      .getByRole("button", { name: "Opslaan", exact: true })
      .click();
    const publicPartCard = releaseDetail
      .locator(".product-release-part")
      .filter({
        has: page.getByRole("heading", { name: publicPart, exact: true }),
      });
    await publicPartCard.getByLabel("Bijlage toevoegen").setInputFiles({
      name: "release-screenshot.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1UAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await publicPartCard
      .getByRole("button", { name: "Bijlage opslaan", exact: true })
      .click();
    const releaseFileLink = publicPartCard.getByRole("link", {
      name: "release-screenshot.png",
      exact: true,
    });
    await expect(releaseFileLink).toBeVisible();
    const releaseFileUrl = (await releaseFileLink.getAttribute("href"))!;
    expect((await page.request.get(releaseFileUrl)).status()).toBe(200);
    releaseId = (
      await db.query("select id from private.product_releases where title=$1", [
        releaseTitle,
      ])
    ).rows[0].id;
    const staff = await staffContext.newPage();
    await authenticateWorkspace(
      staff,
      "field-worker@fieldgrid.test",
      "/staff/updates",
    );
    expect(
      (
        await staff.request.get(
          `/api/product?workspace=staff&section=releases&id=${releaseId}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await staff.request.get(
          releaseFileUrl.replace("workspace=platform", "workspace=staff"),
        )
      ).status(),
    ).toBe(404);
    await releaseDetail
      .getByRole("button", { name: "Voorbeeld als ontvanger", exact: true })
      .click();
    const preview = page.getByRole("dialog", {
      name: "Voorbeeld als ontvanger",
      exact: true,
    });
    await preview
      .getByRole("combobox", { name: "Organisatie", exact: true })
      .selectOption(tenant);
    await preview
      .getByRole("combobox", { name: "Doelgroep", exact: true })
      .selectOption("customer");
    await preview
      .getByRole("button", { name: "Voorbeeld tonen", exact: true })
      .click();
    await expect(preview.locator(".product-preview")).toContainText(publicPart);
    await expect(preview.locator(".product-preview")).not.toContainText(
      staffPart,
    );
    await closeDialog(page);
    await page.getByRole("button", { name: releaseTitle, exact: true }).click();
    await releaseDetail
      .getByRole("button", { name: "Publiceren", exact: true })
      .click();
    const publish = page.getByRole("dialog", {
      name: "Publicatie bevestigen",
      exact: true,
    });
    await expect(
      publish.getByRole("button", { name: "Bevestigen", exact: true }),
    ).toBeDisabled();
    await publish.getByRole("checkbox", { name: /Ik heb inhoud/ }).check();
    await publish
      .getByRole("checkbox", { name: /Doelgroep informeren/ })
      .check();
    await publish
      .getByRole("button", { name: "Bevestigen", exact: true })
      .click();
    await expect(releaseDetail).toContainText("Gepubliceerd");
    releaseId = (
      await db.query("select id from private.product_releases where title=$1", [
        releaseTitle,
      ])
    ).rows[0].id;
    await management.goto(`/app/updates?release=${releaseId}`);
    const managerRelease = management.getByRole("dialog", {
      name: releaseTitle,
      exact: true,
    });
    await expect(managerRelease).toContainText(publicPart);
    await expect(managerRelease).not.toContainText(staffPart);
    await expect(managerRelease).toContainText("Op staging te testen");
    await expect(managerRelease).toContainText(
      "Niet als beschikbaar geregistreerd",
    );
    await staff.goto(`/staff/updates?release=${releaseId}`);
    const staffRelease = staff.getByRole("dialog", {
      name: releaseTitle,
      exact: true,
    });
    await expect(staffRelease).toContainText(staffPart);
    expect(
      (
        await staff.request.get(
          releaseFileUrl.replace("workspace=platform", "workspace=staff"),
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await staff.request.get(
          `/api/product?workspace=staff&section=ideas&id=${ideaId}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await staff.request.get(
          fileUrl!.replace("workspace=backoffice", "workspace=staff"),
        )
      ).status(),
    ).toBe(404);
    const client = await customerContext.newPage();
    await authenticateWorkspace(
      client,
      email,
      `/klant/updates?release=${releaseId}`,
    );
    const customerRelease = client.getByRole("dialog", {
      name: releaseTitle,
      exact: true,
    });
    await expect(customerRelease).toContainText(publicPart);
    await expect(customerRelease).not.toContainText(staffPart);
    const customerFileUrl = releaseFileUrl.replace(
      "workspace=platform",
      "workspace=customer",
    );
    expect((await client.request.get(customerFileUrl)).status()).toBe(200);
    for (const width of [1440, 768, 390]) {
      await client.setViewportSize({ width, height: 900 });
      await fitsViewport(client, customerRelease);
      await client.screenshot({
        path: info.outputPath(`product-customer-${width}.png`),
      });
    }
    await db.query(
      "update public.customer_portal_accounts set active=false where tenant_id=$1",
      [tenant],
    );
    await client.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      client.getByRole("heading", {
        name: "Je toegang is gewijzigd",
        exact: true,
      }),
    ).toBeVisible();
    await expect(customerRelease).toBeHidden();
    expect((await client.request.get(customerFileUrl)).status()).toBe(404);
    expect(
      (
        await client.request.get(
          `/api/product?workspace=customer&section=releases&id=${releaseId}`,
        )
      ).status(),
    ).toBe(403);
  } finally {
    const ideas = (
        await db.query(
          "select id from private.product_ideas where tenant_id=$1",
          [tenant],
        )
      ).rows.map((r) => r.id),
      roadmaps = (
        await db.query(
          "select id from private.product_roadmap where title=$1",
          [roadmapTitle],
        )
      ).rows.map((r) => r.id),
      releases = (
        await db.query(
          "select id from private.product_releases where title=$1",
          [releaseTitle],
        )
      ).rows.map((r) => r.id),
      changes = (
        await db.query(
          "select id from private.product_changes where release_id=any($1::uuid[])",
          [releases],
        )
      ).rows.map((r) => r.id),
      ids = [...ideas, ...roadmaps, ...releases, ...changes];
    const paths = (
      await db.query(
        "select path from private.product_files where entity_id=any($1::uuid[])",
        [ids],
      )
    ).rows.map((r) => r.path);
    if (paths.length)
      await admin.storage.from("product-documents").remove(paths);
    await db.query("begin");
    await db.query("set local session_replication_role='replica'");
    for (const table of [
      "product_notes",
      "product_audit",
      "product_files",
      "product_events",
    ])
      await db.query(
        `delete from private.${table} where entity_id=any($1::uuid[])`,
        [ids],
      );
    for (const table of ["product_messages", "product_idea_history"])
      await db.query(
        `delete from private.${table} where idea_id=any($1::uuid[])`,
        [ideas],
      );
    await db.query(
      "delete from private.product_receipts where result->>'id'=any($1::text[])",
      [ids],
    );
    await db.query(
      "delete from private.product_changes where release_id=any($1::uuid[])",
      [releases],
    );
    await db.query(
      "delete from private.product_ideas where id=any($1::uuid[])",
      [ideas],
    );
    await db.query(
      "delete from private.product_roadmap where id=any($1::uuid[])",
      [roadmaps],
    );
    await db.query(
      "delete from private.product_releases where id=any($1::uuid[])",
      [releases],
    );
    const tables = (
      await db.query(
        "select distinct table_schema,table_name from information_schema.columns where column_name='tenant_id' and table_schema in ('public','private')",
      )
    ).rows;
    for (const { table_schema: s, table_name: n } of tables)
      await db.query(`delete from "${s}"."${n}" where tenant_id=$1`, [tenant]);
    await db.query("delete from public.tenants where id=$1", [tenant]);
    await db.query("commit");
    if (customerUser) await admin.auth.admin.deleteUser(customerUser);
    await db.end();
    await colleague.close();
    await staffContext.close();
    await customerContext.close();
  }
});
