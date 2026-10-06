import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";

// Fixture authentication must never end up in a browser trace or video.
test.use({ trace: "off", screenshot: "off", video: "off" });

// Only disposable fixtures in the isolated local Supabase project, never staging.
const day = "2031-03-04",
  people = [randomUUID(), randomUUID()],
  orders = [randomUUID(), randomUUID()];
let db: pg.Client, tenant: string;
let hiddenPeople: Array<{ id: string; status: string }> = [];
test.beforeAll(async () => {
  const url = requireLocalDatabaseUrl();
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
async function expectPlanboardReady(page: Page) {
  // The initial server projection may be followed by preference hydration and
  // travel loading. Wait for the actual UI state, not an arbitrary delay.
  await expect(page.locator(".pb-board:visible")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".pb-state:visible")).toHaveText(
    /^2 medewerkers · .*Europe\/Amsterdam$/,
  );
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page.locator(".pb-board:visible")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".pb-alert")).toHaveCount(0);
}
async function open(page: Page) {
  await authenticateWorkspace(page, "platform-admin@fieldgrid.test", `/app/planning?day=${day}`);
  await expect(
    page.getByRole("heading", { name: "Planbord", exact: true }),
  ).toBeVisible();
  await page.getByRole("main").getByLabel("Planningsdag").fill(day);
  await expect(page.getByRole("main").locator(`[data-order-id="${orders[0]}"]`)).toBeVisible();
  await expectPlanboardReady(page);
}
test("planbord past op alle doelbreedtes, scrolt onafhankelijk en portalt de bonacties", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const board = page.locator(".pb-board:visible"),
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
    await expect(page.getByRole("combobox", { name: "Bonnenweergave", exact: true })).toBeVisible();
    expect((await board.boundingBox())!.height).toBeGreaterThan(240);
    await board.evaluate((el) => {
      el.scrollLeft = innerWidth < 768 ? 174 : 0;
    });
    await page.getByRole("heading", { name: "Planbord", exact: true }).click();
    await expectPlanboardReady(page);
    await expect(page).toHaveScreenshot(`day-planboard-${width}.png`, {
      fullPage: true,
    });
  }
  const list = page.locator(".pb-list:visible"),
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
  await page.getByRole("combobox", { name: "Bonnenweergave", exact: true }).selectOption("all");
  const filters = page.getByRole("button", { name: /^Zoeken en filteren/ });
  await expect(filters).toHaveAccessibleName("Zoeken en filteren");
  await filters.click();
  const pop = page.locator(".pb-filter-popover");
  await expect(pop.locator("select")).toHaveCount(1);
  await pop.getByLabel("Zoeken", { exact: true }).fill("PB-90");
  await expect(page.locator(".pb-count:visible")).toHaveText("2 bonnen");
  await expect(filters).toHaveAccessibleName("Zoeken en filteren, 1 actief");
  await pop.getByLabel("Uitvoeringsstatus").selectOption("completed");
  await expect(page.locator(".pb-count:visible")).toHaveText("0 bonnen");
  await expect(filters).toHaveAccessibleName("Zoeken en filteren, 2 actief");
  await pop.getByRole("button", { name: "Wis filters" }).click();
  await expect(page.getByRole("combobox", { name: "Bonnenweergave", exact: true })).toHaveValue("all");
  await expect(filters).toHaveAccessibleName("Zoeken en filteren");
  await pop.getByLabel("Zoeken", { exact: true }).fill("PB-90-2");
  await expect(
    pop.getByRole("button", { name: "Toon 1 bon", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(filters).toHaveAccessibleName("Zoeken en filteren, 1 actief");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Bonnenweergave", exact: true })).toHaveValue("all");
  await expect(page.locator(".pb-count:visible")).toHaveText("2 bonnen");
  await expect(filters).toHaveAccessibleName("Zoeken en filteren");
});
test("minuutsleepactie, annuleren, opslaan, undo en exacte mobiele invoer gebruiken dezelfde uitvoering", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const card = page.getByRole("main").locator(`[data-order-id="${orders[0]}"]`);
  let rect = (await card.boundingBox())!;
  const ppm = rect.width / 90;
  await page.mouse.move(rect.x + 18, rect.y + 28);
  await page.mouse.down();
  await page.mouse.move(rect.x + 18 + 124 * ppm, rect.y + 28, { steps: 10 });
  await expect(page.locator(".pb-drag-preview:visible").first()).toContainText(
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
  await page.getByRole("combobox", { name: "Bonnenweergave", exact: true }).selectOption("unassigned");
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
  await expect(page.getByRole("main").locator(`[data-order-id="${orders[1]}"]`)).toContainText(
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
  const card = page.getByRole("main").locator(`[data-order-id="${orders[0]}"]`);
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
  const rowHeight = (await page.locator(".pb-person-row:visible").first().boundingBox())!.height;
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

  const list = (await page.locator(".pb-list:visible").boundingBox())!;
  await dragTo(list.x + 180, list.y + 90);
  const confirmation = page.getByRole("dialog", {
    name: "Controleer de afwijking",
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Plan toch" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("combobox", { name: "Bonnenweergave", exact: true }).selectOption("unassigned");
  const grip = page.getByRole("button", { name: "Sleep PB-90-1", exact: true });
  await grip.scrollIntoViewIfNeeded();
  const origin = (await grip.boundingBox())!;
  const board = (await page.locator(".pb-board:visible").boundingBox())!;
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

test.describe("status per medewerker", () => {
  test("eigen statuskleuren, live voortgang en toegankelijke legenda naast de titel", async ({ page }) => {
    test.setTimeout(90000);
    const orderId = randomUUID(), assignments = [randomUUID(), randomUUID()];
    orders.push(orderId);
    await db.query(
      "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,created_by,required_personnel,status,planning_state,planned_start_at,projected_start_at,planned_end_at,projected_end_at) select $1,tenant_id,customer_id,object_id,'PB-CREW-STATES',discipline,created_by,2,'travelling','final',$3,$3,$4,$4 from public.work_orders where id=$2",
      [orderId, orders[0], `${day}T09:00Z`, `${day}T10:00Z`],
    );
    for (const [index, id] of assignments.entries()) {
      await db.query(
        "insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,projected_start_at,planned_end_at,projected_end_at) values($1,$2,$3,$4,$5,$6,$6,$7,$7)",
        [id, tenant, orderId, people[index], index ? "released" : "travelling", `${day}T09:00Z`, `${day}T10:00Z`],
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const first = page.getByRole("main").locator(`[data-assignment-id="${assignments[0]}"]`);
    const second = page.getByRole("main").locator(`[data-assignment-id="${assignments[1]}"]`);
    await expect(first).toHaveAttribute("data-status", "travelling");
    await expect(first).toHaveAccessibleName(/Ada Planbord.*Onderweg/);
    await expect(second).toHaveAttribute("data-status", "released");
    await expect(second).toHaveAccessibleName(/Bram Planbord.*Nog niet gezien/);
    await expect(first.locator("small")).toHaveText("Onderweg");
    await expect(second.locator("small")).toHaveText("Nog niet gezien");
    const colors = async (locator: typeof first) => locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderLeftColor };
    });
    const firstColors = await colors(first);
    expect(await colors(second)).not.toEqual(firstColors);
    // Existing revision notifications must also refresh a colleague's status
    // when the aggregate work order still says 'travelling'.
    await db.query("update public.work_order_assignments set status='seen',seen_at=clock_timestamp() where id=$1", [assignments[1]]);
    await expect(second).toHaveAttribute("data-status", "seen", { timeout: 30000 });
    await expect(second.locator("small")).toHaveText("Gezien");
    await expect(first).toHaveAttribute("data-status", "travelling");
    expect(await colors(first)).toEqual(firstColors);
    expect((await db.query("select status from public.work_orders where id=$1", [orderId])).rows[0].status).toBe("travelling");

    const trigger = page.getByRole("button", { name: "Legenda statuskleuren" });
    const legend = page.getByRole("dialog", { name: "Legenda statuskleuren" });
    const titleRect = (await page.getByRole("heading", { name: "Planbord", exact: true }).boundingBox())!;
    expect((await trigger.boundingBox())!.x).toBeGreaterThan(titleRect.x + titleRect.width);
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("Iedere medewerker heeft een eigen voortgang");
    for (const card of [first, second]) {
      const status = await card.getAttribute("data-status");
      expect(await colors(legend.locator(`.pb-legend-swatch[data-status="${status}"]`))).toEqual(await colors(card));
    }
    await expect(legend).toHaveScreenshot("planboard-status-legend.png");
    await page.keyboard.press("Escape");
    await expect(legend).not.toBeVisible();
    await expect(trigger).toBeFocused();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await trigger.click();
      await expect(legend).toBeVisible();
      const rect = (await legend.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(900);
      expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(width <= 600 ? 44 : 28);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(legend).not.toBeVisible();
    }
  });
});
