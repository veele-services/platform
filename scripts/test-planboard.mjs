import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("planboard: real PostgreSQL authorization, transactions, races and integration", async (t) => {
  const local = JSON.parse(
    execFileSync("pnpm", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const url = new URL(local.DB_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "59322");
  const admin = new pg.Client({ connectionString: local.DB_URL });
  await admin.connect();
  const tenant = randomUUID(),
    otherTenant = randomUUID(),
    user = randomUUID(),
    secondPlanner = randomUUID(),
    staff = randomUUID();
  const customer = randomUUID(),
    object = randomUUID(),
    people = [randomUUID(), randomUUID(), randomUUID()],
    otherPerson = randomUUID();
  const day = "2031-01-15",
    start = `${day}T07:03:00Z`,
    end = `${day}T08:33:00Z`;
  const call = async (sql, args = [], actor = user) => {
    const client = new pg.Client({ connectionString: local.DB_URL });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout='10s'");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor, session_id: actor, role: "authenticated" }),
      ]);
      const result = await client.query(sql, args);
      await client.query("commit");
      return result.rows;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.end();
    }
  };
  const version = async (id) =>
    (
      await admin.query("select version from public.work_orders where id=$1", [
        id,
      ])
    ).rows[0].version;
  const order = async (extra = {}) => {
    const id = randomUUID();
    await admin.query(
      "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,created_by,required_personnel,day_instructions) values($1,$2,$3,$4,$5,'Onderhoud',$6,$7,$8)",
      [
        id,
        tenant,
        customer,
        object,
        `TEST-${id}`,
        user,
        extra.required ?? 1,
        extra.instructions ?? "",
      ],
    );
    return id;
  };
  const proposal = async (id, crew = [people[0]], s = start, e = end) => ({
    id,
    version: await version(id),
    mutation: randomUUID(),
    start: s,
    end: e,
    assignments: crew.map((personnelId) => ({ personnelId, start: s, end: e })),
    warnings: [],
  });
  const mutate = async (p, actor = user) =>
    (
      await call(
        "select public.change_work_order_planning($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb) as result",
        [
          p.tenant ?? tenant,
          p.id,
          p.version,
          p.mutation,
          p.start,
          p.end,
          JSON.stringify(p.assignments),
          p.warnings,
          p.undo ?? null,
          p.appointment ? JSON.stringify(p.appointment) : null,
        ],
        actor,
      )
    )[0].result;
  const board = async (
    view = "all",
    search = "",
    status = "",
    page = 1,
    chosenDay = day,
  ) =>
    (
      await call("select public.get_planboard($1,$2,$3,$4,$5,$6) as result", [
        tenant,
        chosenDay,
        view,
        search,
        status,
        page,
      ])
    )[0].result;
  const sqlCode = (code) => (error) => error.code === code;
  try {
    for (const id of [user, secondPlanner, staff]) {
      await admin.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        `${id}@fieldgrid.test`,
      ]);
      await admin.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$1,now(),now())",[id]);
    }
    for (const id of [tenant, otherTenant]) {
      await admin.query(
        "insert into public.tenants(id,slug,name) values($1,$2,'Planboard test')",
        [id, `planning-${id}`],
      );
      await admin.query(
        "insert into public.tenant_settings(tenant_id) values($1)",
        [id],
      );
    }
    for (const id of [user, secondPlanner])
      await admin.query(
        "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['planner']::public.app_role[],'active')",
        [tenant, id],
      );
    await admin.query(
      "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",
      [tenant, staff],
    );
    for (const [index, id] of people.entries())
      await admin.query(
        "insert into public.personnel(id,tenant_id,full_name,employee_number,user_id) values($1,$2,$3,$4,$5)",
        [
          id,
          tenant,
          `Planner medewerker ${index + 1}`,
          `PL-${index}`,
          index === 0 ? staff : null,
        ],
      );
    await admin.query(
      "insert into public.personnel(id,tenant_id,full_name) values($1,$2,'Andere organisatie')",
      [otherPerson, otherTenant],
    );
    await admin.query(
      "insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'PLAN-K','Planbordklant')",
      [customer, tenant],
    );
    await admin.query(
      "insert into public.objects(id,tenant_id,customer_id,object_number,name,address,access_instructions) values($1,$2,$3,'PLAN-O','Planbordobject','{}','PRIVATE-ACCESS-CANARY')",
      [object, tenant, customer],
    );

    await t.test(
      "minute precision, multiple people, history, idempotency, undo and actual/financial isolation",
      async () => {
        const id = await order({ required: 2 });
        const p = await proposal(id, [people[0], people[1]]);
        const first = await mutate(p);
        assert.equal(first.ok, true);
        assert.equal((await mutate(p)).replayed, true);
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.planning_changes where work_order_id=$1",
              [id],
            )
          ).rows[0].n,
          1,
        );
        const move = await proposal(
          id,
          [people[0], people[1]],
          `${day}T09:07:00Z`,
          `${day}T10:37:00Z`,
        );
        assert.equal((await mutate(move)).ok, true);
        const stored = (
          await admin.query("select * from public.work_orders where id=$1", [
            id,
          ])
        ).rows[0];
        assert.equal(
          stored.projected_end_at.toISOString(),
          `${day}T10:37:00.000Z`,
        );
        assert.equal(stored.actual_start_at, null);
        assert.equal(stored.actual_end_at, null);
        await assert.rejects(
          mutate({ ...p, mutation: randomUUID() }),
          sqlCode("40001"),
        );
        const restore = { ...(await proposal(id, [])), undo: move.mutation };
        assert.equal((await mutate(restore)).ok, true);
        assert.equal(
          (
            await admin.query(
              "select projected_start_at from public.work_orders where id=$1",
              [id],
            )
          ).rows[0].projected_start_at.toISOString(),
          `${day}T07:03:00.000Z`,
        );
        const replace = await proposal(id, [people[0], people[2]]);
        assert.equal((await mutate(replace)).ok, true);
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.work_order_assignments where work_order_id=$1 and status='cancelled'",
              [id],
            )
          ).rows[0].n,
          1,
        );
        const remove = await proposal(id, [people[0]]);
        const confirmation = await mutate(remove);
        assert.equal(confirmation.ok, false);
        assert.equal(confirmation.warnings[0].key, "staffing");
        assert.equal(
          (await mutate({ ...remove, warnings: ["staffing"] })).ok,
          true,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.work_orders where id=$1",
              [id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.invoice_lines where work_order_id=$1",
              [id],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.time_entries where tenant_id=$1",
              [tenant],
            )
          ).rows[0].n,
          0,
        );
        await admin.query(
          "update public.work_orders set status='cancelled' where id=$1",
          [id],
        );
      },
    );
    await t.test(
      "arrival vs full execution window and explicit, audited deviation confirmation",
      async () => {
        const id = await order(),
          slot = randomUUID();
        await admin.query(
          "insert into public.appointment_slots(id,tenant_id,starts_at,ends_at) values($1,$2,$3,$4)",
          [slot, tenant, `${day}T08:00Z`, `${day}T09:00Z`],
        );
        await admin.query(
          "update public.work_orders set appointment_slot_id=$2,customer_window_kind='arrival' where id=$1",
          [id, slot],
        );
        const p = await proposal(
          id,
          [people[0]],
          `${day}T08:20:00Z`,
          `${day}T09:50:00Z`,
        );
        assert.equal((await mutate(p)).ok, true);
        const next = await proposal(id, [people[0]], p.start, p.end);
        next.appointment = {
          requestedDate: "2031-01-16",
          windowKind: "execution",
          requiredPersonnel: 1,
          instructions: "Alleen vandaag: extra aandacht voor de entree.",
        };
        const result = await mutate(next);
        assert.equal(result.ok, false);
        assert.deepEqual(result.warnings.map((w) => w.key).sort(), [
          "customer-window",
          "requested-date",
        ]);
        assert.equal(await version(id), next.version); // no partial metadata writes on warning
        assert.equal(
          (
            await mutate({
              ...next,
              warnings: result.warnings.map((w) => w.key),
            })
          ).ok,
          true,
        );
        const audit = (
          await admin.query(
            "select confirmed_warnings from public.planning_changes where id=$1",
            [next.mutation],
          )
        ).rows[0];
        assert.equal(audit.confirmed_warnings.length, 2);
        const fresh = await board();
        assert.equal(
          fresh.board.find((w) => w.id === id).instructions,
          next.appointment.instructions,
        );
        assert.equal(
          JSON.stringify(fresh).includes("PRIVATE-ACCESS-CANARY"),
          false,
        );
        await admin.query(
          "update public.work_orders set status='cancelled' where id=$1",
          [id],
        );
      },
    );
    await t.test(
      "half-open adjacency, hard leave, inactive personnel, duplicate selection and other tenant IDs",
      async () => {
        const id = await order();
        assert.equal((await mutate(await proposal(id))).ok, true);
        const next = await order();
        assert.equal(
          (
            await mutate(
              await proposal(next, [people[0]], end, `${day}T09:33:00Z`),
            )
          ).ok,
          true,
        );
        const blocked = await order();
        await assert.rejects(mutate(await proposal(blocked)), sqlCode("23P01"));
        await admin.query(
          "insert into public.availability(tenant_id,personnel_id,starts_at,ends_at,kind,note) values($1,$2,$3,$4,'leave','PRIVATE-HR-CANARY')",
          [tenant, people[1], start, end],
        );
        await assert.rejects(
          mutate(await proposal(blocked, [people[1]])),
          sqlCode("23P01"),
        );
        assert.equal(
          JSON.stringify(await board()).includes("PRIVATE-HR-CANARY"),
          false,
        );
        await assert.rejects(
          mutate(await proposal(blocked, [otherPerson])),
          sqlCode("42501"),
        );
        await assert.rejects(
          mutate(await proposal(blocked, [people[2], people[2]])),
          sqlCode("23514"),
        );
        await admin.query(
          "update public.personnel set status='former' where id=$1",
          [people[2]],
        );
        await assert.rejects(
          mutate(await proposal(blocked, [people[2]])),
          sqlCode("23514"),
        );
        await admin.query(
          "update public.personnel set status='active' where id=$1",
          [people[2]],
        );
        await admin.query(
          "update public.work_orders set status='cancelled' where id=any($1)",
          [[id, next]],
        );
      },
    );
    await t.test(
      "two planners cannot concurrently book different orders for the same person",
      async () => {
        const first = await order(),
          second = await order();
        const a = await proposal(
            first,
            [people[0]],
            "2031-02-01T08:03:00Z",
            "2031-02-01T09:33:00Z",
          ),
          b = await proposal(second, [people[0]], a.start, a.end);
        const results = await Promise.allSettled([
          mutate(a),
          mutate(b, secondPlanner),
        ]);
        assert.equal(
          results.filter((r) => r.status === "fulfilled" && r.value.ok).length,
          1,
        );
        assert.equal(
          results.filter(
            (r) => r.status === "rejected" && r.reason.code === "23P01",
          ).length,
          1,
        );
      },
    );
    await t.test(
      "undo revalidates overlap and never overwrites later changes",
      async () => {
        const id = await order(),
          a = "2031-02-02T08:00:00Z",
          b = "2031-02-02T09:00:00Z";
        assert.equal(
          (await mutate(await proposal(id, [people[0]], a, b))).ok,
          true,
        );
        const moved = await proposal(
          id,
          [people[0]],
          "2031-02-02T10:00:00Z",
          "2031-02-02T11:00:00Z",
        );
        assert.equal((await mutate(moved)).ok, true);
        const occupied = await order();
        assert.equal(
          (
            await mutate(
              await proposal(occupied, [people[0]], a, b),
              secondPlanner,
            )
          ).ok,
          true,
        );
        await assert.rejects(
          mutate({ ...(await proposal(id, [])), undo: moved.mutation }),
          sqlCode("23P01"),
        );
        const oldVersion = await version(id);
        await admin.query(
          "update public.work_orders set day_instructions='Nieuwere afspraak' where id=$1",
          [id],
        );
        await assert.rejects(
          mutate({
            ...(await proposal(id, [])),
            version: oldVersion,
            undo: moved.mutation,
          }),
          sqlCode("40001"),
        );
      },
    );
    await t.test(
      "authorizes every read/write, protects versions against raw REST updates and validates customer/object",
      async () => {
        const id = await order(),
          p = await proposal(id);
        await assert.rejects(mutate({ ...p, version: null }), sqlCode("23514"));
        await assert.rejects(
          mutate({ ...p, mutation: null }),
          sqlCode("23514"),
        );
        assert.equal(
          (
            await admin.query(
              "select has_function_privilege('anon','public.get_planboard(uuid,date,text,text,text,integer)','execute') allowed",
            )
          ).rows[0].allowed,
          false,
        );
        assert.equal(
          (
            await call(
              "select count(*)::int n from public.planning_changes",
              [],
              staff,
            )
          )[0].n,
          0,
        );
        await assert.rejects(mutate(p, staff), sqlCode("42501"));
        await assert.rejects(
          mutate({ ...p, tenant: otherTenant }),
          sqlCode("42501"),
        );
        await assert.rejects(
          call("select public.get_planboard($1,$2)", [otherTenant, day]),
          sqlCode("42501"),
        );
        await assert.rejects(
          call("select public.get_planboard($1,$2)", [tenant, day], staff),
          sqlCode("42501"),
        );
        await assert.rejects(
          call(
            "update public.work_orders set projected_start_at=$2 where id=$1",
            [id, start],
          ),
          sqlCode("42501"),
        );
        const wrong = randomUUID();
        await admin.query(
          "insert into public.customers(id,tenant_id,name,customer_number) values($1,$2,'Other customer','PLAN-WRONG')",
          [wrong, tenant],
        );
        await assert.rejects(
          admin.query(
            "update public.work_orders set customer_id=$2 where id=$1",
            [id, wrong],
          ),
          sqlCode("23514"),
        );
        for (const status of ["in_progress", "completed", "cancelled"]) {
          await admin.query(
            "update public.work_orders set status=$2,planned_start_at=$3,planned_end_at=$4,projected_start_at=$3,projected_end_at=$4 where id=$1",
            [id, status, start, end],
          );
          await assert.rejects(mutate(await proposal(id)), sqlCode("23514"));
        }
      },
    );
    await t.test(
      "released crews retain individual staff transitions and finish the shared execution only once",
      async () => {
        await admin.query(
          "update public.personnel set user_id=$2 where id=$1",
          [people[1], secondPlanner],
        );
        // Planning rights alone intentionally cannot operate the staff app.
        // This assigned crew member explicitly also holds the execution role.
        await admin.query(
          "update public.tenant_memberships set roles=array_append(roles,'staff'::public.app_role) where tenant_id=$1 and user_id=$2 and not ('staff'=any(roles))",
          [tenant, secondPlanner],
        );
        const now = new Date();
        now.setUTCSeconds(0, 0);
        const finish = new Date(now.getTime() + 90 * 60000);
        const id = await order({
          required: 2,
          instructions: "Eenmalige daginstructie",
        });
        await admin.query(
          "insert into public.work_order_tasks(tenant_id,work_order_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,'PLAN-TASK','Controle',90,'task',2500,2100)",
          [tenant, id],
        );
        assert.equal(
          (
            await mutate(
              await proposal(
                id,
                [people[0], people[1]],
                now.toISOString(),
                finish.toISOString(),
              ),
            )
          ).ok,
          true,
        );
        for (const pid of people.slice(0, 2))
          await call("select public.dispatch_work_order($1,$2,$3,$4)", [
            id,
            pid,
            await version(id),
            randomUUID(),
          ]);
        const step = async (action, actor) =>
          call(
            "select public.transition_work_order($1,$2,$3,$4)",
            [id, action, await version(id), randomUUID()],
            actor,
          );
        await step("open", staff);
        await step("travel", staff);
        await step("start", staff);
        await step("open", secondPlanner);
        await step("travel", secondPlanner);
        await step("start", secondPlanner);
        await admin.query(
          "update public.work_order_tasks set completed_at=clock_timestamp() where work_order_id=$1",
          [id],
        );
        await step("stop", staff);
        let w = (
          await admin.query(
            "select status,actual_end_at from public.work_orders where id=$1",
            [id],
          )
        ).rows[0];
        assert.equal(w.status, "in_progress");
        assert.equal(w.actual_end_at, null);
        await step("stop", secondPlanner);
        w = (
          await admin.query(
            "select status,actual_end_at from public.work_orders where id=$1",
            [id],
          )
        ).rows[0];
        assert.equal(w.status, "completed");
        assert.ok(w.actual_end_at);
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.time_entries e join public.work_order_assignments a on a.id=e.assignment_id where a.work_order_id=$1 and e.ends_at is not null",
              [id],
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from public.work_order_tasks where work_order_id=$1",
              [id],
            )
          ).rows[0].n,
          1,
        );
        await assert.rejects(mutate(await proposal(id)), sqlCode("23514"));
      },
    );
    await t.test(
      "server filters count full results across pages and keep undated/desired date context",
      async () => {
        for (let i = 0; i < 56; i++) {
          const id = await order();
          await admin.query(
            "update public.work_orders set work_order_number=$2 where id=$1",
            [id, `PAGING-${String(i).padStart(3, "0")}`],
          );
        }
        const first = await board("unassigned", "PAGING"),
          second = await board("unassigned", "PAGING", "", 2);
        assert.equal(first.total, 56);
        assert.equal(first.orders.length, 50);
        assert.equal(second.total, 56);
        assert.equal(second.orders.length, 6);
        assert.equal(
          new Set([...first.orders, ...second.orders].map((w) => w.id)).size,
          56,
        );
        assert.equal((await board("completed", "PAGING", "planned")).total, 0);
        const id = first.orders[0].id;
        await admin.query(
          "update public.work_orders set requested_date='2031-01-16' where id=$1",
          [id],
        );
        assert.equal((await board("unassigned", "PAGING")).total, 55);
        assert.equal(
          (await board("unassigned", "PAGING", "", 1, "2031-01-16")).total,
          56,
        );
      },
    );
  } finally {
    try {
      await admin.query(
        "delete from public.planning_changes where tenant_id=any($1)",
        [[tenant, otherTenant]],
      );
      await admin.query(
        "delete from public.audit_events where tenant_id=any($1)",
        [[tenant, otherTenant]],
      );
      await admin.query(
        "delete from public.work_orders where tenant_id=any($1)",
        [[tenant, otherTenant]],
      );
      await admin.query("delete from public.objects where tenant_id=any($1)", [
        [tenant, otherTenant],
      ]);
      await admin.query(
        "delete from public.customers where tenant_id=any($1)",
        [[tenant, otherTenant]],
      );
      await admin.query("delete from public.tenants where id=any($1)", [
        [tenant, otherTenant],
      ]);
      await admin.query("delete from auth.users where id=any($1)", [
        [user, secondPlanner, staff],
      ]);
    } finally {
      await admin.end();
    }
  }
});
