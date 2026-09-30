import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Only disposable fixtures in the isolated local Supabase project, never staging.
const day = "2031-03-04",
  people = [randomUUID(), randomUUID()],
  orders = [randomUUID(), randomUUID()];
let db: pg.Client, tenant: string;
let hiddenPeople: Array<{ id: string; status: string }> = [];
test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).toBe("59322");
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  tenant = (
    await db.query("select id from public.tenants where slug='fieldgrid-e2e'")
  ).rows[0].id;
  const owner = (
    await db.query(
      "select id from auth.users where email='platform-admin@fieldgrid.test'",
    )
  ).rows[0].id;
  hiddenPeople = (
    await db.query(
      "select id,status from public.personnel where tenant_id=$1 and status='active'",
      [tenant],
    )
  ).rows;
  await db.query(
    "update public.personnel set status='inactive' where id=any($1)",
    [hiddenPeople.map((p) => p.id)],
  );
  for (const [i, id] of people.entries())
    await db.query(
      "insert into public.personnel(id,tenant_id,full_name,employee_number) values($1,$2,$3,$4)",
      [id, tenant, ["Ada Planbord", "Bram Planbord"][i], `E2E-PLAN-${i}`],
    );
  for (const [i, id] of orders.entries()) {
    await db.query(
      "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,created_by,day_instructions) values($1,$2,'e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',$3,'Onderhoud',$4,$5)",
      [
        id,
        tenant,
        `PB-90-${i + 1}`,
        owner,
        i ? "Alleen deze uitvoering: entree controleren." : "",
      ],
    );
    await db.query(
      "insert into public.work_order_tasks(tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,'PB90','Onderhoud',90,'task',1000,2100)",
      [tenant, id],
    );
  }
  await db.query(
    "update public.work_orders set planned_start_at=$2,projected_start_at=$2,planned_end_at=$3,projected_end_at=$3 where id=$1",
    [orders[0], `${day}T07:03Z`, `${day}T08:33Z`],
  );
  await db.query(
    "insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,projected_start_at,planned_end_at,projected_end_at) values($1,$2,$3,$4,$4,$5,$5)",
    [tenant, orders[0], people[0], `${day}T07:03Z`, `${day}T08:33Z`],
  );
});
test.afterAll(async () => {
  if (!db) return;
  try {
    await db.query(
      "delete from public.planning_changes where work_order_id=any($1)",
      [orders],
    );
    await db.query("delete from public.audit_events where entity_id=any($1)", [
      orders,
    ]);
    await db.query("delete from public.work_orders where id=any($1)", [orders]);
    await db.query("delete from public.personnel where id=any($1)", [people]);
    for (const person of hiddenPeople)
      await db.query("update public.personnel set status=$2 where id=$1", [
        person.id,
        person.status,
      ]);
  } finally {
    await db.end();
  }
});
async function open(page: Page) {
  await page.goto(
    `/login?next=${encodeURIComponent(`/app/planning?day=${day}`)}`,
  );
  await page.getByLabel("E-mailadres").fill("platform-admin@fieldgrid.test");
  await page.getByLabel("Wachtwoord").fill("Fieldgrid-E2E-2026");
  await page.getByRole("button", { name: /Inloggen/ }).click();
  await expect(
    page.getByRole("heading", { name: "Planbord", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Planningsdag").fill(day);
  await expect(page.locator(`[data-order-id="${orders[0]}"]`)).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /Gegevens vernieuwen/ }),
  ).toHaveCount(0);
}
test("planbord past op alle doelbreedtes, scrolt onafhankelijk en portalt de bonacties", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const board = page.locator(".pb-board"),
    avatar = page.getByRole("button", { name: "Personeel: Ada Planbord" });
  const before = await avatar.boundingBox();
  await board.evaluate((el) => {
    el.scrollLeft = 230;
  });
  await expect
    .poll(async () => (await avatar.boundingBox())!.x)
    .toBeCloseTo(before!.x, 0);
  await board.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page
    .getByRole("button", { name: "Acties voor werkbon PB-90-1" })
    .click();
  await expect(
    page.getByRole("button", { name: "Bekijk werkbon", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".pb-action-menu")
      .evaluate((el) => el.closest(".pb-board")),
  ).toBeNull();
  await page.keyboard.press("Escape");
  for (const width of [320, 375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const shell = document.querySelector(".workspace-shell")!;
          return (
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight &&
            shell.scrollWidth <= shell.clientWidth &&
            shell.scrollLeft === 0
          );
        }),
      )
      .toBe(true);
    await expect(page.getByLabel("Bonnenweergave")).toBeVisible();
    expect((await board.boundingBox())!.height).toBeGreaterThan(240);
    await board.evaluate((el) => {
      el.scrollLeft = innerWidth < 768 ? 174 : 0;
    });
    await page.getByRole("heading", { name: "Planbord", exact: true }).click();
    await expect(page).toHaveScreenshot(`day-planboard-${width}.png`, {
      fullPage: true,
    });
  }
  const list = page.locator(".pb-list"),
    old = (await list.boundingBox())!.height;
  await page.getByRole("separator", { name: "Hoogte bonnenlijst" }).focus();
  await page.keyboard.press("ArrowUp");
  expect((await list.boundingBox())!.height).toBeGreaterThan(old);
  const expanded = (await list.boundingBox())!.height;
  await page.getByRole("button", { name: "Bonnenlijst inklappen" }).click();
  expect((await list.boundingBox())!.height).toBe(52);
  await page.getByRole("button", { name: "Bonnenlijst uitklappen" }).click();
  expect((await list.boundingBox())!.height).toBe(expanded);
});
test("bonnenweergave en filters zijn onafhankelijk en tellen de juiste resultaten", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Bonnenweergave").selectOption("all");
  await expect(page.locator(".pb-filter-button b")).toHaveCount(0);
  await page.getByRole("button", { name: "Zoeken & filteren" }).click();
  const pop = page.locator(".pb-filter-popover");
  await expect(pop.locator("select")).toHaveCount(1);
  await pop.getByLabel("Zoeken", { exact: true }).fill("PB-90");
  await expect(page.locator(".pb-count")).toHaveText("2 bonnen");
  await expect(page.locator(".pb-filter-button b")).toHaveText("1");
  await pop.getByLabel("Uitvoeringsstatus").selectOption("completed");
  await expect(page.locator(".pb-count")).toHaveText("0 bonnen");
  await expect(page.locator(".pb-filter-button b")).toHaveText("2");
  await pop.getByRole("button", { name: "Wis filters" }).click();
  await expect(page.getByLabel("Bonnenweergave")).toHaveValue("all");
  await expect(page.locator(".pb-filter-button b")).toHaveCount(0);
  await pop.getByLabel("Zoeken", { exact: true }).fill("PB-90-2");
  await expect(
    pop.getByRole("button", { name: "Toon 1 bon", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(page.locator(".pb-filter-button b")).toHaveText("1");
  await page.reload();
  await expect(page.getByLabel("Bonnenweergave")).toHaveValue("all");
  await expect(page.locator(".pb-count")).toHaveText("1 bon");
});
test("minuutsleepactie, annuleren, opslaan, undo en exacte mobiele invoer gebruiken dezelfde uitvoering", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const card = page.locator(`[data-order-id="${orders[0]}"]`);
  let rect = (await card.boundingBox())!;
  const ppm = rect.width / 90;
  await page.mouse.move(rect.x + 18, rect.y + 28);
  await page.mouse.down();
  await page.mouse.move(rect.x + 18 + 124 * ppm, rect.y + 28, { steps: 10 });
  await expect(page.locator(".pb-drag-preview").first()).toContainText(
    "10:07–11:37",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(card).toContainText("08:03–09:33");
  rect = (await card.boundingBox())!;
  await page.mouse.move(rect.x + 18, rect.y + 28);
  await page.mouse.down();
  await page.mouse.move(rect.x + 18 + 124 * ppm, rect.y + 28, { steps: 10 });
  await page.mouse.up();
  await expect(card).toContainText("10:07–11:37");
  await page.reload();
  await expect(card).toContainText("10:07–11:37");
  await page.getByRole("button", { name: "Ongedaan maken" }).click();
  await expect(card).toContainText("08:03–09:33");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByLabel("Bonnenweergave").selectOption("unassigned");
  await page
    .getByRole("row")
    .filter({ hasText: "PB-90-2" })
    .getByRole("button", { name: "Plan", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Noordhaven Kantoor" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Begin", { exact: true }).fill(`${day}T08:03`);
  await panel.getByLabel("Einde", { exact: true }).fill(`${day}T09:33`);
  await panel.getByLabel("Bram Planbord", { exact: false }).check();
  await panel.getByLabel("Benodigde medewerkers").fill("2");
  await panel
    .getByLabel("Instructies voor deze uitvoering", { exact: false })
    .fill("Vandaag extra aandacht voor de entree.");
  await panel.getByRole("button", { name: "Planning opslaan" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Controleer de afwijking",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("1 medewerker(s) ontbreken");
  await expect(confirmation).toContainText("08:03");
  await confirmation.getByRole("button", { name: "Plan toch" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(`[data-order-id="${orders[1]}"]`)).toContainText(
    "08:03–09:33",
  );
  expect(
    (
      await db.query(
        "select day_instructions from public.work_orders where id=$1",
        [orders[1]],
      )
    ).rows[0].day_instructions,
  ).toBe("Vandaag extra aandacht voor de entree.");
});

test("bonnen kunnen van medewerker wisselen, resizen en via de lijst opnieuw worden ingepland", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const card = page.locator(`[data-order-id="${orders[0]}"]`);
  let rect = (await card.boundingBox())!;
  const ppm = rect.width / 90;
  const dragTo = async (x: number, y: number) => {
    const r = (await card.boundingBox())!;
    await page.mouse.move(r.x + 18, r.y + 28);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
  };
  await dragTo(rect.x + 18 + 124 * ppm, rect.y + 28);
  await expect(card).toContainText("10:07–11:37");
  rect = (await card.boundingBox())!;
  const rowHeight = (await page.locator(".pb-person-row").first().boundingBox())!.height;
  await dragTo(rect.x + 18, rect.y + 28 + rowHeight);
  await expect
    .poll(async () => (await card.boundingBox())?.y ?? -1)
    .toBeCloseTo(rect.y + rowHeight, 0);
  await expect(page.getByRole("status")).not.toContainText("Planning opslaan");
  expect(
    (
      await db.query(
        "select personnel_id from public.work_order_assignments where work_order_id=$1 and status<>'cancelled'",
        [orders[0]],
      )
    ).rows[0].personnel_id,
  ).toBe(people[1]);

  const handle = (await card.locator(".pb-resize").boundingBox())!;
  rect = (await card.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width + 7 * ppm,
    handle.y + handle.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(card).toContainText("10:07–11:44");

  const list = (await page.locator(".pb-list").boundingBox())!;
  await dragTo(list.x + 180, list.y + 90);
  const confirmation = page.getByRole("dialog", {
    name: "Controleer de afwijking",
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Plan toch" }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Bonnenweergave").selectOption("unassigned");
  const grip = page.getByRole("button", { name: "Sleep PB-90-1", exact: true });
  await grip.scrollIntoViewIfNeeded();
  const origin = (await grip.boundingBox())!;
  const board = (await page.locator(".pb-board").boundingBox())!;
  await page.mouse.move(
    origin.x + origin.width / 2,
    origin.y + origin.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(board.x + 1 + 230 + 241 * ppm, board.y + 40 + 36, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(card).toContainText("11:01–12:38");
  expect(
    (
      await db.query(
        "select count(*)::int n from public.work_orders where id=$1",
        [orders[0]],
      )
    ).rows[0].n,
  ).toBe(1);
});
