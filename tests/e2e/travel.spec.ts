import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { requireLocalDatabaseUrl } from "./local-target";
import { authenticateWorkspace } from "./login-auth";
import { randomUUID } from "node:crypto";
test.use({ trace: "off", screenshot: "off", video: "off" });
const day = "2032-05-10",
  person = "e1000000-0000-4000-8000-000000000001",
  customer = "e2000000-0000-4000-8000-000000000001";
const objects = [randomUUID(), randomUUID()],
  orders = [randomUUID(), randomUUID()],
  assignments = [randomUUID(), randomUUID()];
let db: pg.Client, tenant: string, old: Record<string, unknown>;
const address = {
  street_name: "FICTIEF Testplein",
  house_number: "12",
  house_letter: "A",
  house_addition: "bis",
  postal_code: "1234AB",
  city: "Testplaats",
  country: "NL",
  street: "FICTIEF Testplein 12A bis",
  formatted: "FICTIEF Testplein 12A bis, 1234AB Testplaats",
  source: "pdok",
  source_id: "aa000000-0000-4000-8000-000000000001",
  bag_id: "9999999999999999",
  longitude: 4.313,
  latitude: 52.079,
  located_at: "2031-01-01T00:00:00Z",
  status: "confirmed",
};
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
  old = (
    await db.query(
      "select home_address,standard_vehicle,departure_kind,return_to_departure from public.personnel where id=$1",
      [person],
    )
  ).rows[0];
  await db.query(
    "update public.personnel set home_address=$2,standard_vehicle='car',departure_kind='home',return_to_departure=false where id=$1",
    [
      person,
      {
        ...address,
        longitude: 4.3,
        street_name: "FICTIEF PRIVÉ",
        street: "FICTIEF PRIVÉ 12A bis",
      },
    ],
  );
  for (let i = 0; i < 2; i++) {
    await db.query(
      "insert into public.objects(id,tenant_id,customer_id,object_number,name,address,travel_margin_minutes,arrival_instruction) values($1,$2,$3,$4,$5,$6,7,'Fictieve ingang achterom')",
      [
        objects[i],
        tenant,
        customer,
        `TRAVEL-${i}`,
        `FICTIEF reisobject ${i + 1}`,
        { ...address, longitude: 4.4 + i / 10 },
      ],
    );
    const start = `${day}T${i ? "07:40" : "06:00"}:00Z`,
      end = `${day}T${i ? "08:30" : "07:30"}:00Z`;
    await db.query(
      "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$5,'Onderhoud','released',$6,$7,$6,$7,$8)",
      [
        orders[i],
        tenant,
        customer,
        objects[i],
        `FICTIEF-REIS-${i + 1}`,
        start,
        end,
        owner,
      ],
    );
    await db.query(
      "insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',$5,$6,$5,$6)",
      [assignments[i], tenant, orders[i], person, start, end],
    );
    await db.query(
      "insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",
      [tenant, orders[i], assignments[i], owner, randomUUID()],
    );
  }
});
test.afterAll(async () => {
  if (!db) return;
  try {
    await db.query(
      "delete from public.personnel_travel_days where tenant_id=$1 and personnel_id=$2 and day=$3",
      [tenant, person, day],
    );
    await db.query("delete from public.work_orders where id=any($1)", [orders]);
    await db.query(
      "delete from public.object_history where object_id=any($1)",
      [objects],
    );
    await db.query("delete from public.objects where id=any($1)", [objects]);
    if (old)
      await db.query(
        "update public.personnel set home_address=$2,standard_vehicle=$3,departure_kind=$4,return_to_departure=$5 where id=$1",
        [
          person,
          old.home_address,
          old.standard_vehicle,
          old.departure_kind,
          old.return_to_departure,
        ],
      );
    await db.query(
      "delete from public.customers where tenant_id=$1 and name='FICTIEF autofill acceptatie'",
      [tenant],
    );
  } finally {
    await db.end();
  }
});
async function login(
  page: Page,
  path: string,
  email = "platform-admin@fieldgrid.test",
) {
  await authenticateWorkspace(page, email, path);
  await expect(page).not.toHaveURL(/\/login/);
}
test("PDOK address selection, exact suffixes, stale response protection and mobile persistence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/app/klanten");
  await page.getByRole("button", { name: "Nieuwe klant" }).click();
  const modal = page.getByRole("dialog", { name: "Nieuwe klant" });
  await modal.getByLabel("Klantnaam").fill("FICTIEF autofill acceptatie");
  await modal.getByRole("button", { name: "Volgende" }).click();
  const address = modal.locator(".address-input").filter({ has: page.locator('[name="visitAddress"]') });
  const search = address.getByRole("combobox", { name: "Straatnaam" });
  await expect(address.getByRole("combobox")).toHaveCount(2);
  for (const label of ["Huisnummer", "Huisletter", "Toevoeging", "Woonplaats", "Landcode"]) {
    const input = address.getByLabel(label, { exact: true });
    await expect(input).not.toHaveAttribute("role", "combobox");
    await expect(input).not.toHaveAttribute("aria-autocomplete", "list");
  }
  let addressRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/addresses")) addressRequests++;
  });
  let finishOld!: () => void;
  const oldFinished = new Promise<void>((resolve) => {
    finishOld = resolve;
  });
  await page.route("**/api/addresses", async (route) => {
    if (route.request().postDataJSON().query !== "Oude zoekopdracht")
      return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route
      .fulfill({
        json: {
          suggestions: [
            { id: randomUUID(), label: "FICTIEF VEROUDERD RESULTAAT" },
          ],
        },
      })
      .catch(() => {});
    finishOld();
  });
  const oldRequest = page.waitForRequest(
    (r) =>
      r.url().endsWith("/api/addresses") &&
      r.postDataJSON().query === "Oude zoekopdracht",
  );
  await search.fill("Oude zoekopdracht");
  await oldRequest;
  await search.fill("Testplein 12");
  await expect(
    page.getByRole("option", { name: /FICTIEF Testplein/ }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await oldFinished;
  await expect(
    page.getByRole("option", { name: "FICTIEF VEROUDERD RESULTAAT" }),
  ).toHaveCount(0);
  await expect(address.getByLabel("Huisletter", { exact: true })).toHaveValue(
    "A",
  );
  await expect(address.getByLabel("Toevoeging", { exact: true })).toHaveValue(
    "bis",
  );
  await expect(
    address.getByText("Locatie beschikbaar voor routeberekening"),
  ).toBeVisible();
  const requestsBeforeManualEdits = addressRequests;
  await address.getByLabel("Huisnummer", { exact: true }).fill("13");
  expect(
    JSON.parse(await address.locator('[name="visitAddress"]').inputValue())
      .latitude,
  ).toBeNull();
  await expect(address.getByText(/Adres controleren:/)).toBeVisible();
  await expect(address.getByLabel("Zoekmethode")).toHaveCount(0);
  await expect(address.getByLabel("Zoek een adres")).toHaveCount(0);
  await address.getByLabel("Huisnummer", { exact: true }).fill("12");
  await address.getByLabel("Huisletter", { exact: true }).fill("B");
  await address.getByLabel("Huisletter", { exact: true }).fill("A");
  await address.getByLabel("Toevoeging", { exact: true }).fill("achter");
  await address.getByLabel("Toevoeging", { exact: true }).fill("bis");
  await address.getByLabel("Woonplaats", { exact: true }).fill("Testplaats");
  await address.getByLabel("Landcode", { exact: true }).focus();
  await page.waitForTimeout(500);
  expect(addressRequests).toBe(requestsBeforeManualEdits);
  await expect(page.getByRole("listbox", { name: "Adresresultaten" })).toHaveCount(0);
  const postcodeRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/addresses") && request.postDataJSON().query?.startsWith("1234"),
  );
  await address.getByRole("combobox", { name: "Postcode", exact: true }).fill("1234 AB");
  await postcodeRequest;
  await expect(page.getByRole("option", { name: /FICTIEF Testplein/ })).toBeVisible();
  await address.getByLabel("Huisnummer", { exact: true }).focus();
  await expect(page.getByRole("listbox", { name: "Adresresultaten" })).toHaveCount(0);
  await address.getByRole("combobox", { name: "Postcode", exact: true }).focus();
  await page.getByRole("option", { name: /FICTIEF Testplein/ }).click();
  await expect(address.getByLabel("Huisnummer", { exact: true })).toHaveValue(
    "12",
  );
  await expect
    .poll(() => modal.evaluate((e) => e.scrollWidth <= e.clientWidth))
    .toBe(true);
  await modal.getByRole("button", { name: "Volgende" }).click();
  await modal.getByRole("button", { name: "Volgende" }).click();
  await modal.getByRole("button", { name: "Volgende" }).click();
  await modal.getByRole("button", { name: "Klant aanmaken" }).click();
  await expect(modal).not.toBeVisible();
  const saved = (
    await db.query(
      "select billing_address, visit_address from public.customers where tenant_id=$1 and name='FICTIEF autofill acceptatie'",
      [tenant],
    )
  ).rows[0];
  expect(saved.visit_address).toEqual(saved.billing_address);
  expect(saved.billing_address).toMatchObject({
    house_number: "12",
    house_letter: "A",
    house_addition: "bis",
    longitude: 4.313,
    latitude: 52.079,
    status: "confirmed",
  });
});
test("planboard basic travel, exact shortage, daily bicycle override, manual fallback and staff privacy", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, `/app/planning?day=${day}`);
  await expect(
    page.getByRole("button", {
      name: "Reistijd 25 minuten, 15 minuten tekort",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reistijd 25 minuten, 15 minuten tekort" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "15 minuten te weinig tijd om de volgende afspraak te bereiken.",
    ),
  ).toBeVisible();
  await expect(dialog.getByText("Fictieve ingang achterom")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Handmatige reistijd", exact: true })
    .click();
  await dialog.getByLabel("Handmatige basisreistijd (minuten)").fill("10");
  await dialog
    .getByLabel("Reden", { exact: true })
    .fill("FICTIEVE handmatige testwaarde");
  await dialog
    .getByRole("button", { name: "Handmatige reistijd opslaan" })
    .click();
  await expect(dialog.getByText(/Handmatige reistijd actief/)).toBeVisible();
  await page.keyboard.press("Escape");
  const row = page
    .locator(".pb-person-name")
    .filter({ hasText: "Robin de Vries" });
  await row.getByRole("button", { name: "Auto", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator('select[name="vehicle"]')
    .selectOption("bicycle");
  await page.getByRole("button", { name: "Daginstellingen opslaan" }).click();
  await expect(row.getByText("Fiets · dagafwijking")).toBeVisible();
  const legs = await page.evaluate(async (day) => {
    const r = await fetch("/api/routes/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "day", day }),
    });
    return (await r.json()).legs;
  }, day);
  expect(
    legs.find(
      (l: { assignmentId: string }) => l.assignmentId === assignments[0],
    ),
  ).toMatchObject({ vehicle: "bicycle", minutes: 25 });
  expect(
    legs.find(
      (l: { assignmentId: string }) => l.assignmentId === assignments[1],
    ),
  ).toMatchObject({ state: "manual_review", minutes: null });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.context().clearCookies();
  await login(page, "/staff", "field-worker@fieldgrid.test");
  const own = await page.evaluate(async (day) => {
    const r = await fetch("/api/routes/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "day", day }),
    });
    return await r.json();
  }, day);
  expect(own.canManage).toBe(false);
  expect(
    own.legs.every((l: { personnelId: string }) => l.personnelId === person),
  ).toBe(true);
  expect(own.legs[0].origin).toEqual([4.3, 52.079]);
});
test("object arrival marker coordinates stay separate from official address", async ({
  page,
}) => {
  await login(page, `/app/objecten/${objects[0]}`);
  await page.getByLabel("Gebruik adreslocatie").uncheck();
  await page.getByLabel("Breedtegraad aankomst").fill("52.081");
  await page.getByLabel("Lengtegraad aankomst").fill("4.415");
  await page
    .getByRole("button", { name: "Aankomstinstellingen opslaan" })
    .click();
  await expect(page.getByText("Aankomstlocatie opgeslagen")).toBeVisible();
  const o = (
    await db.query(
      "select address,arrival_location from public.objects where id=$1",
      [objects[0]],
    )
  ).rows[0];
  expect(o.address.longitude).toBe(4.4);
  expect(o.arrival_location).toEqual([4.415, 52.081]);
  await page
    .getByRole("button", { name: "Gebruik adreslocatie", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aankomstinstellingen opslaan" })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "select arrival_location from public.objects where id=$1",
            [objects[0]],
          )
        ).rows[0].arrival_location,
    )
    .toBeNull();
});

test("MapLibre worker and draggable arrival marker work without changing the official address", async ({
  page,
}) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "fictional-map-background",
            type: "background",
            paint: { "background-color": "#edf2f5" },
          },
        ],
      },
    }),
  );
  await login(page, `/app/objecten/${objects[0]}`);
  await page
    .getByRole("button", { name: "Locatie controleren op kaart" })
    .click();
  const marker = page.locator(".maplibregl-marker");
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  const before = await page.getByLabel("Lengtegraad aankomst").inputValue();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 45,
    box!.y + box!.height / 2 + 25,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Gebruik adreslocatie")).not.toBeChecked();
  await expect(page.getByLabel("Lengtegraad aankomst")).not.toHaveValue(before);
  await page
    .getByRole("button", { name: "Aankomstinstellingen opslaan" })
    .click();
  await expect(page.getByText("Aankomstlocatie opgeslagen")).toBeVisible();
  expect(
    (
      await db.query(
        "select address->>'longitude' lng from public.objects where id=$1",
        [objects[0]],
      )
    ).rows[0].lng,
  ).toBe("4.4");
});

test("address suggestions stay clickable outside an object wizard scroll container", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/app/objecten");
  await page.getByRole("button", { name: "Nieuw object", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Nieuw object" });
  await modal.locator('select[name="customerId"]').selectOption(customer);
  await modal.getByLabel("Objectnaam").fill("FICTIEF niet opgeslagen");
  await modal.getByRole("button", { name: "Volgende" }).click();
  await modal
    .getByRole("combobox", { name: "Straatnaam" })
    .fill("Testplein 12");
  await page.getByRole("option", { name: /FICTIEF Testplein/ }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("Huisletter", { exact: true })).toHaveValue(
    "A",
  );
  await expect(
    modal.getByText("Locatie beschikbaar voor routeberekening"),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Sluiten" }).click();
});

test("reisinformatie starts collapsed and shows one employee's route at a time", async ({page}) => {
  const secondPerson = randomUUID(), secondAssignment = randomUUID();
  try {
    await db.query(
      "insert into public.personnel(id,tenant_id,employee_number,full_name,standard_vehicle,departure_kind,home_address) values($1,$2,$3,'FICTIEF Tweede reiziger','car','home',$4)",
      [secondPerson, tenant, `TRAVEL-${secondPerson}`, {...address, street_name: "FICTIEF Tweede vertrekplek", street: "FICTIEF Tweede vertrekplek 12A bis", longitude: 4.3}],
    );
    await db.query(
      "insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'released',$5,$6,$5,$6)",
      [secondAssignment, tenant, orders[0], secondPerson, `${day}T06:00:00Z`, `${day}T07:30:00Z`],
    );
    await page.setViewportSize({width: 390, height: 844});
    await login(page, `/app/planning?day=${day}`);
    await page.getByRole("button", {name: "Acties voor werkbon FICTIEF-REIS-1", exact: true}).first().click();
    await page.getByRole("button", {name: "Bekijk werkbon", exact: true}).click();
    const panel = page.getByRole("dialog", {name: "FICTIEF reisobject 1", exact: true});
    const travel = panel.locator(".pb-travel");
    const summary = travel.locator("summary");
    await expect(travel).not.toHaveAttribute("open");
    await expect(summary).toHaveText("Reisinformatie");
    await expect(travel.getByRole("button", {name: "Bekijk route", exact: true})).not.toBeVisible();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(travel).toHaveAttribute("open", "");
    const employee = travel.getByLabel("Medewerker", {exact: true});
    await expect(employee).toBeVisible();
    await employee.selectOption(person);
    await expect(travel.locator(".travel-card")).toHaveCount(1);
    await expect(travel.getByText(/FICTIEF PRIVÉ/)).toBeVisible();
    await employee.selectOption(secondPerson);
    await expect(travel.locator(".travel-card")).toHaveCount(1);
    await expect(travel.getByText(/FICTIEF Tweede vertrekplek/)).toBeVisible();
    await expect(travel.getByText(/FICTIEF PRIVÉ/)).toHaveCount(0);
    await expect(travel.getByRole("button", {name: "Bekijk route", exact: true})).toBeEnabled();
    await travel.getByRole("button", {name: "Handmatige reistijd", exact: true}).click();
    await expect(travel.getByLabel("Handmatige basisreistijd (minuten)")).toBeVisible();
    await travel.getByLabel("Handmatige basisreistijd (minuten)").fill("12");
    await travel.getByLabel("Reden", {exact: true}).fill("FICTIEVE reistijd voor tweede medewerker");
    await travel.getByRole("button", {name: "Handmatige reistijd opslaan", exact: true}).click();
    await expect(travel.getByText(/Handmatige reistijd actief/)).toBeVisible();
    expect(Number((await db.query("select manual_seconds from public.travel_legs where assignment_id=$1 and direction='before'", [secondAssignment])).rows[0].manual_seconds)).toBe(720);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 900});
      await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await summary.click();
    await expect(travel).not.toHaveAttribute("open");
    await page.getByRole("button", {name: "Details sluiten", exact: true}).click();
    await page.getByRole("button", {name: "Acties voor werkbon FICTIEF-REIS-1", exact: true}).first().click();
    await page.getByRole("button", {name: "Bekijk werkbon", exact: true}).click();
    await expect(page.getByRole("dialog", {name: "FICTIEF reisobject 1", exact: true}).locator(".pb-travel")).not.toHaveAttribute("open");
  } finally {
    await db.query("delete from public.work_order_assignments where id=$1", [secondAssignment]);
    await db.query("delete from public.personnel where id=$1", [secondPerson]);
  }
});
