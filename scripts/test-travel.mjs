import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("travel: tenant isolation, private addresses, cache leases and version-safe estimates", async (t) => {
  const local = JSON.parse(
    execFileSync("pnpm", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const url = new URL(local.DB_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "59322");
  const db = new pg.Client({ connectionString: local.DB_URL });
  await db.connect();
  await db.query("begin");
  const tenant = randomUUID(),
    other = randomUUID(),
    manager = randomUUID(),
    planner = randomUUID(),
    staff = randomUUID(),
    colleague = randomUUID(),
    customerUser = randomUUID(),
    person = randomUUID(),
    person2 = randomUUID(),
    customer = randomUUID(),
    object = randomUUID(),
    order = randomUUID(),
    assignment = randomUUID(),
    depot = randomUUID();
  const actors = [manager, planner, staff, colleague, customerUser],
    sessions = Object.fromEntries(actors.map((id) => [id, randomUUID()]));
  const address = {
    street_name: "Fictieve teststraat",
    house_number: "12",
    house_letter: "A",
    house_addition: "bis",
    postal_code: "1234AB",
    city: "Testplaats",
    country: "NL",
    street: "Fictieve teststraat 12A bis",
    formatted: "Fictieve teststraat 12A bis, 1234AB Testplaats",
    source: "pdok",
    source_id: randomUUID(),
    bag_id: "1234567890123456",
    longitude: 4.3,
    latitude: 52.1,
    located_at: "2031-01-01T00:00:00Z",
    status: "confirmed",
  };
  const call = async (
    sql,
    args = [],
    actor = manager,
    role = "authenticated",
  ) => {
    await db.query("savepoint auth_call");
    try {
      await db.query(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor, role, session_id: sessions[actor] }),
      ]);
      const r = await db.query(sql, args);
      await db.query("reset role");
      await db.query("release savepoint auth_call");
      return r.rows;
    } catch (e) {
      await db.query("rollback to savepoint auth_call");
      throw e;
    }
  };
  const context = async (actor = manager, target = tenant) =>
    (
      await call(
        "select public.travel_context($1,$2,$3,'2031-01-01',null) c",
        [target, actor, sessions[actor]],
        actor,
        "service_role",
      )
    )[0].c;
  try {
    for (const u of actors) {
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [u, `${u}@fictional.test`],
      );
      await db.query(
        "insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",
        [sessions[u], u],
      );
    }
    for (const id of [tenant, other]) {
      await db.query(
        "insert into public.tenants(id,slug,name) values($1,$2,'Fictitious travel test')",
        [id, `travel-${id}`],
      );
      await db.query(
        "insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel'])",
        [id],
      );
    }
    for (const [u, roles] of [
      [manager, ["tenant_admin", "management", "hr"]],
      [planner, ["planner"]],
      [staff, ["staff"]],
      [colleague, ["staff"]],
    ])
      await db.query(
        "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",
        [tenant, u, roles],
      );
    await db.query(
      "insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'TR-C','Fictitious customer')",
      [customer, tenant],
    );
    await db.query(
      "insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'TR-O','Fictitious work site',$4)",
      [object, tenant, customer, address],
    );
    await db.query(
      "insert into public.travel_depots(id,tenant_id,name,address) values($1,$2,'Fictitious depot',$3)",
      [depot, tenant, address],
    );
    for (const [id, u] of [
      [person, staff],
      [person2, colleague],
    ])
      await db.query(
        "insert into public.personnel(id,tenant_id,user_id,full_name,home_address,standard_vehicle,departure_kind) values($1,$2,$3,'Fictitious employee',$4,'car','home')",
        [
          id,
          tenant,
          u,
          {
            ...address,
            street_name: "PRIVATE HOME",
            street: "PRIVATE HOME 12A bis",
            formatted: "PRIVATE HOME 12A bis",
          },
        ],
      );
    await db.query(
      "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'TR-W','Onderhoud','planned','2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z',$5)",
      [order, tenant, customer, object, manager],
    );
    await db.query(
      "insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z')",
      [assignment, tenant, order, person],
    );
    await t.test(
      "private columns cannot be read directly or via another employee's mobility endpoint",
      async () => {
        await assert.rejects(
          call(
            "select home_address from public.personnel where id=$1",
            [person],
            planner,
          ),
          (e) => e.code === "42501",
        );
        await assert.rejects(
          call(
            "select public.personnel_mobility($1,$2)",
            [tenant, person],
            planner,
          ),
          (e) => e.code === "42501",
        );
        await assert.rejects(
          call(
            "select public.personnel_mobility($1,$2)",
            [tenant, person],
            colleague,
          ),
          (e) => e.code === "42501",
        );
        assert.match(
          JSON.stringify(
            await call(
              "select public.personnel_mobility($1,$2)",
              [tenant, person],
              staff,
            ),
          ),
          /PRIVATE HOME/,
        );
        await assert.rejects(
          call(
            "select public.travel_context($1,$2,$3,'2031-01-01',null)",
            [tenant, staff, sessions[staff]],
            staff,
          ),
          (e) => e.code === "42501",
        );
        await assert.rejects(
          context(manager, other),
          (e) => e.code === "42501",
        );
        await assert.rejects(context(customerUser), (e) => e.code === "42501");
        assert.equal(
          (await context(planner)).people.find((p) => p.id === person)
            .privateAllowed,
          false,
        );
      },
    );
    await t.test(
      "staff sees only own published visits and revocation is immediate",
      async () => {
        assert.equal((await context(staff)).assignments.length, 0);
        await db.query(
          "insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)",
          [tenant, order, assignment, manager, randomUUID()],
        );
        assert.equal((await context(staff)).assignments.length, 1);
        assert.equal((await context(colleague)).assignments.length, 0);
        await db.query(
          "update public.dispatches set revoked_at=now() where assignment_id=$1",
          [assignment],
        );
        assert.equal((await context(staff)).assignments.length, 0);
        await db.query(
          "update auth.sessions set not_after=now()-interval '1 second' where id=$1",
          [sessions[staff]],
        );
        await assert.rejects(context(staff), (e) => e.code === "42501");
        await db.query("update auth.sessions set not_after=null where id=$1", [
          sessions[staff],
        ]);
      },
    );
    await t.test(
      "daily transport overrides, confirmed locations and object arrival stay separate",
      async () => {
        const before = await context();
        await call(
          "insert into public.personnel_travel_days(tenant_id,personnel_id,day,standard_vehicle) values($1,$2,'2031-01-01','bicycle')",
          [tenant, person],
          planner,
        );
        const next = await context();
        assert.ok(next.revision > before.revision);
        assert.equal(
          next.people.find((p) => p.id === person).override.standard_vehicle,
          "bicycle",
        );
        await call(
          "update public.personnel_travel_days set departure_address=$3,departure_kind='custom' where tenant_id=$1 and personnel_id=$2",
          [tenant, person, { ...address, longitude: 4.8 }],
        );
        await assert.rejects(
          call(
            "select departure_address from public.personnel_travel_days where tenant_id=$1",
            [tenant],
            planner,
          ),
          (e) => e.code === "42501",
        );
        await assert.rejects(
          call(
            "select public.travel_day_departure($1,$2,'2031-01-01')",
            [tenant, person],
            planner,
          ),
          (e) => e.code === "42501",
        );
        const own = (
          await call(
            "select public.travel_day_departure($1,$2,'2031-01-01') a",
            [tenant, person],
            staff,
          )
        )[0].a;
        assert.equal(own.longitude, 4.8);
        assert.equal(
          (await context()).people.find((p) => p.id === person).override
            .alternate_departure_address.longitude,
          4.8,
        );
        await call(
          "update public.objects set arrival_location='[4.4,52.2]' where id=$1",
          [object],
          planner,
        );
        const a = (
          await db.query(
            "select address,arrival_location from public.objects where id=$1",
            [object],
          )
        ).rows[0];
        assert.deepEqual(a.address, address);
        assert.deepEqual(a.arrival_location, [4.4, 52.2]);
        await call(
          "update public.objects set address=jsonb_set(address,'{house_addition}','\"2\"') where id=$1",
          [object],
          planner,
        );
        const changed = (
          await db.query(
            "select address,arrival_location,latitude,longitude from public.objects where id=$1",
            [object],
          )
        ).rows[0];
        assert.equal(changed.address.status, "needs_review");
        assert.equal(changed.address.latitude, null);
        assert.equal(changed.arrival_location, null);
        assert.equal(changed.latitude, null);
      },
    );
    await t.test(
      "CAS rejects stale planning; manual and provider fields remain independent",
      async () => {
        const c = await context();
        const leg = {
          assignmentId: assignment,
          personnelId: person,
          direction: "before",
          vehicle: "car",
          minutes: 18,
          metres: 5000,
          seconds: 1080,
          marginMinutes: 7,
          profile: "driving-car",
          signature: "a".repeat(64),
          day: "2031-01-01",
          state: "known",
          calculatedAt: "2031-01-01T08:00Z",
        };
        const store = async (v, rev = c.revision, action = null) =>
          (
            await call(
              "select public.store_travel_estimates($1,$2,$3,$4,$5) ok",
              [tenant, rev, JSON.stringify([v]), action, manager],
              manager,
              "service_role",
            )
          )[0].ok;
        assert.equal(await store(leg, c.revision - 1), false);
        assert.equal(await store(leg), true);
        assert.equal(
          await store(
            {
              ...leg,
              state: "manual",
              seconds: 1800,
              minutes: 30,
              metres: 6000,
              reason: "Fictitious manual test",
            },
            c.revision,
            "set",
          ),
          true,
        );
        const row = (
          await db.query(
            "select * from public.travel_legs where assignment_id=$1",
            [assignment],
          )
        ).rows[0];
        assert.equal(Number(row.basis_seconds), 1080);
        assert.equal(Number(row.basis_distance_metres), 5000);
        assert.equal(Number(row.manual_seconds), 1800);
        assert.deepEqual(row.origin_address, {});
        assert.equal(await store(leg, c.revision), false, "old automatic response cannot overwrite a newer manual decision");
        assert.ok((await context()).revision > c.revision);
        await assert.rejects(
          call(
            "update public.travel_legs set manual_seconds=1 where assignment_id=$1",
            [assignment],
            planner,
          ),
          (e) => e.code === "42501",
        );
        await store(
          { ...leg, state: "pending", seconds: null, minutes: null },
          (await context()).revision,
          "clear",
        );
        assert.equal(
          (
            await db.query(
              "select manual_seconds from public.travel_legs where assignment_id=$1",
              [assignment],
            )
          ).rows[0].manual_seconds,
          null,
        );
      },
    );
    await t.test(
      "travel uses planned times without rewriting actual or projected execution",
      async () => {
        await db.query(
          "update public.work_order_assignments set actual_start_at='2031-01-01T09:12Z',projected_start_at='2031-01-01T09:12Z',projected_end_at='2031-01-01T10:12Z' where id=$1",
          [assignment],
        );
        const c = await context();
        assert.equal(
          new Date(c.assignments[0].start).toISOString(),
          "2031-01-01T09:00:00.000Z",
        );
        assert.equal(
          new Date(c.assignments[0].end).toISOString(),
          "2031-01-01T10:00:00.000Z",
        );
        assert.equal(
          (
            await db.query(
              "select actual_start_at from public.work_order_assignments where id=$1",
              [assignment],
            )
          ).rows[0].actual_start_at.toISOString(),
          "2031-01-01T09:12:00.000Z",
        );
      },
    );
    await t.test(
      "shared route cache is service-only, leases deduplicate and wrong leases cannot publish",
      async () => {
        const key = randomUUID(),
          lease = randomUUID();
        await assert.rejects(
          call("select public.route_cache_read($1)", [[key]], planner),
          (e) => e.code === "42501",
        );
        const claim = async (l) =>
          (
            await call(
              "select public.route_cache_claim($1,'fictional-test','matrix',10,10,$2) c",
              [[key], l],
              manager,
              "service_role",
            )
          )[0].c;
        assert.deepEqual((await claim(lease)).claimed, [key]);
        assert.deepEqual((await claim(randomUUID())).claimed, []);
        await call(
          "select public.route_cache_finish($1,$2,$3,null,30)",
          [key, randomUUID(), { seconds: 1, metres: 1 }],
          manager,
          "service_role",
        );
        assert.equal(
          (
            await db.query(
              "select result from private.route_cache where key=$1",
              [key],
            )
          ).rows[0].result,
          null,
        );
        await call(
          "select public.route_cache_finish($1,$2,$3,null,30)",
          [key, lease, { seconds: 1080, metres: 5000 }],
          manager,
          "service_role",
        );
        assert.deepEqual((await claim(randomUUID())).claimed, []);
        const limited = (
          await call(
            "select public.route_cache_claim($1,'fictional-test','matrix',1,10,$2) c",
            [[randomUUID()], randomUUID()],
            manager,
            "service_role",
          )
        )[0].c;
        assert.equal(limited.limited, true);
      },
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
