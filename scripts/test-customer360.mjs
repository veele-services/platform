import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("Customer 360 uses persistent sources, guarded relationships and exact revisions", async (t) => {
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
    staff = randomUUID(),
    portal = randomUUID(),
    session = randomUUID(),
    staffSession = randomUUID(),
    portalSession = randomUUID(),
    customer = randomUUID(),
    customer2 = randomUUID(),
    object = randomUUID(),
    object2 = randomUUID(),
    doc = randomUUID(),
    task = randomUUID(),
    revision = randomUUID();
  const call = async (sql, args = [], user = manager) => {
    await db.query("savepoint customer_test");
    try {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: user,
          session_id:
            user === staff
              ? staffSession
              : user === portal
                ? portalSession
                : session,
          role: "authenticated",
        }),
      ]);
      const r = await db.query(sql, args);
      await db.query("reset role");
      await db.query("release savepoint customer_test");
      return r.rows;
    } catch (e) {
      await db.query("rollback to savepoint customer_test");
      await db.query("release savepoint customer_test");
      throw e;
    }
  };
  const command = (kind, input, request = randomUUID(), user = manager) =>
    call(
      "select public.customer_command($1,$2,$3,$4) result",
      [tenant, request, kind, input],
      user,
    );
  const list = (filters = {}, user = manager) =>
    call(
      "select public.customer_list($1,$2) result",
      [tenant, filters],
      user,
    ).then((r) => r[0].result);
  const payload = {
    id: customer,
    version: 0,
    name: "FICTITIOUS private customer",
    type: "private",
    status: "lead",
    email: "customer@customer360.test",
    billingEmail: "billing@customer360.test",
    ownerId: manager,
    paymentTerms: 30,
    services: ["Test"],
    visitAddress: {
      street: "Teststraat 1",
      postal_code: "1234 AB",
      city: "Utrecht",
    },
    billingAddress: { street: "Teststraat 2", city: "Amsterdam" },
    contactName: "FICTITIOUS primary",
    contactEmail: "contact@customer360.test",
  };
  try {
    for (const [id, s] of [
      [manager, session],
      [staff, staffSession],
      [portal, portalSession],
    ]) {
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@customer360.test`],
      );
      await db.query(
        "insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",
        [s, id],
      );
    }
    for (const id of [tenant, other]) {
      await db.query(
        "insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS customer tenant')",
        [id, `customer-${id}`],
      );
      await db.query(
        "insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','finance','rapportage'])",
        [id],
      );
    }
    await db.query(
      "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active')",
      [tenant, manager, staff],
    );
    await t.test(
      "five-step customer input is atomic and retry-safe, private customer has no required company number",
      async () => {
        const request = randomUUID();
        await command("customer_save", payload, request);
        await command("customer_save", payload, request);
        assert.equal((await list()).total, 1);
        assert.equal(
          (
            await db.query(
              "select count(*) from public.customer_contacts where customer_id=$1",
              [customer],
            )
          ).rows[0].count,
          "1",
        );
        await assert.rejects(
          command("customer_save", { ...payload, name: "Other" }, request),
          (e) => e.code === "40001",
        );
      },
    );
    await t.test(
      "updates use optimistic versions, address source and customer relationships are retained",
      async () => {
        await command("customer_save", {
          ...payload,
          version: 1,
          status: "active",
        });
        await assert.rejects(
          command("customer_save", { ...payload, version: 1 }),
          (e) => e.code === "40001",
        );
        const c = (
          await db.query("select * from public.customers where id=$1", [
            customer,
          ])
        ).rows[0];
        assert.equal(c.version, "2");
        assert.equal(c.visit_address.city, "Utrecht");
        assert.equal(c.billing_address.city, "Amsterdam");
        assert.equal(c.created_by, manager);
      },
    );
    await command("customer_save", {
      ...payload,
      id: customer2,
      name: "FICTITIOUS secondary",
      contactName: "",
      status: "active",
    });
    for (const [id, c] of [
      [object, customer],
      [object2, customer2],
    ])
      await db.query(
        "insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$4,'FICTITIOUS site','{}')",
        [id, tenant, c, id],
      );
    await t.test(
      "server list filters and stable pages share one scoped source; staff and other tenant are rejected",
      async () => {
        assert.equal((await list({ q: "primary" })).total, 1);
        assert.equal(
          (await list({ city: "Utrecht", type: "private", service: "Test" }))
            .total,
          2,
        );
        assert.equal((await list({ q: "missing" })).total, 0);
        assert.equal((await list({ attention: "objects" })).total, 2);
        const request = randomUUID();
        await db.query(
          "insert into public.requests(id,tenant_id,customer_id,request_number,discipline,description,status) values($1::uuid,$2,$3,$1::uuid::text,'Test','FICTITIOUS follow-up','new')",
          [request, tenant, customer],
        );
        assert.equal((await list({ attention: "requests" })).total, 1);
        assert.equal(
          (await list()).rows.find((row) => row.id === customer).requests,
          1,
        );
        await db.query(
          "update public.requests set archived_at=clock_timestamp() where id=$1",
          [request],
        );
        assert.equal((await list({ attention: "requests" })).total, 0);
        assert.equal(
          (await list()).rows.find((row) => row.id === customer).requests,
          0,
        );
        assert.equal(
          (
            await call(
              "select public.customer_commercial_followup($1,$2) result",
              [tenant, customer],
            )
          )[0].result.length,
          0,
        );
        await assert.rejects(list({}, staff), (e) => e.code === "42501");
        await assert.rejects(
          call("select public.customer_list($1,$2)", [other, {}]),
          (e) => e.code === "42501",
        );
      },
    );
    await t.test(
      "contacts are versioned, primary selection is unique and wrong-customer objects are rejected",
      async () => {
        const id = randomUUID();
        const p = {
          id,
          customerId: customer,
          version: 0,
          fullName: "FICTITIOUS second contact",
          email: "contact2@customer360.test",
          objectIds: [object],
          labels: ["billing"],
          primary: true,
          active: true,
        };
        await command("contact_save", p);
        assert.equal(
          (
            await db.query(
              "select count(*) from public.customer_contacts where customer_id=$1 and is_primary",
              [customer],
            )
          ).rows[0].count,
          "1",
        );
        await assert.rejects(
          command("contact_save", {
            ...p,
            id: randomUUID(),
            objectIds: [object2],
          }),
          (e) => e.code === "23514",
        );
        await command("contact_save", {
          ...p,
          version: 1,
          active: false,
          primary: false,
        });
        await assert.rejects(
          command("contact_save", { ...p, version: 1 }),
          (e) => e.code === "40001",
        );
      },
    );
    await t.test(
      "internal follow-up cannot cross customer or tenant, completion is persisted",
      async () => {
        const id = randomUUID();
        await command("note_save", {
          id,
          customerId: customer,
          kind: "action",
          title: "FICTITIOUS follow-up",
          body: "FICTITIOUS business context",
          ownerId: manager,
          dueOn: "2026-01-01",
          objectId: object,
        });
        assert.equal((await list({ attention: "actions" })).total, 1);
        await assert.rejects(
          command("note_save", {
            id: randomUUID(),
            customerId: customer,
            kind: "note",
            body: "Wrong site",
            objectId: object2,
          }),
          (e) => e.code === "23514",
        );
        await command("note_complete", { id, version: 1 });
        assert.equal((await list({ attention: "actions" })).total, 0);
        await assert.rejects(
          command("customer_delete", { id: customer, version: 2 }),
          (e) => e.code === "23514",
        );
      },
    );
    await db.query(
      "insert into public.customer_documents(id,tenant_id,customer_id,title,storage_path,file_name,mime_type,size_bytes,sha256,created_by) values($1,$2,$3,'FICTITIOUS agreement',$4,'fixture.pdf','application/pdf',12,repeat('a',64),$5)",
      [
        doc,
        tenant,
        customer,
        `${tenant}/${customer}/${randomUUID().replaceAll("-", "")}.pdf`,
        manager,
      ],
    );
    await db.query(
      "insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'TEST-C360','FICTITIOUS task','Test')",
      [task, tenant],
    );
    await db.query(
      "insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,unit,price_cents,vat_basis_points) values($1,$2,$3,1,30,'task',1200,900)",
      [revision, tenant, task],
    );
    const agreement = randomUUID();
    await db.query("insert into public.tenant_branding(tenant_id) values($1)", [
      tenant,
    ]);
    const contract = {
      id: agreement,
      customerId: customer,
      version: 0,
      title: "FICTITIOUS agreement",
      type: "service",
      state: "draft",
      startsOn: "2026-01-01",
      ownerId: manager,
      reviewOn: "2026-01-01",
      lines: [
        {
          objectId: object,
          taskRevisionId: revision,
          scope: "FICTITIOUS scope",
          quantity: "3.125",
          priceCents: 1200,
          limitCents: 4000,
          vatBasisPoints: 900,
          priceBasis: "visit",
          frequency: "Wekelijks",
          unit: "bezoek",
        },
      ],
    };
    await t.test(
      "contract draft uses existing tables; incomplete activation rejected, real evidence required",
      async () => {
        await command("agreement_save", contract);
        await assert.rejects(
          command("agreement_save", {
            ...contract,
            version: 1,
            state: "active",
          }),
          (e) => e.code === "23514",
        );
        await command("agreement_save", {
          ...contract,
          version: 1,
          state: "active",
          acceptedBy: "FICTITIOUS approver",
          acceptedOn: "2026-01-01",
          documentId: doc,
        });
        const a = (
          await db.query(
            "select * from public.customer_agreements where id=$1",
            [agreement],
          )
        ).rows[0];
        assert.equal(a.state, "active");
        assert.equal(a.accepted_by_name, "FICTITIOUS approver");
        await assert.rejects(
          command("agreement_save", { ...contract, version: 2 }),
          (e) => e.code === "40001",
        );
      },
    );
    await t.test(
      "draft successor preserves signed agreement and operational options until activation",
      async () => {
        const next = randomUUID();
        await command("agreement_save", {
          ...contract,
          id: next,
          previousId: agreement,
        });
        const rows = await call(
          "select * from public.object_agreement_options($1,$2)",
          [tenant, object],
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].version, "1");
        await assert.rejects(
          command("agreement_save", {
            ...contract,
            id: randomUUID(),
            previousId: agreement,
          }),
          (e) => e.code === "40001",
        );
      },
    );
    await t.test(
      "shared customer documents require live explicit bindings; no internal fields or files leak",
      async () => {
        await db.query(
          "insert into public.object_customer_bindings(tenant_id,object_id,user_id,active) values($1,$2,$3,true)",
          [tenant, object, portal],
        );
        const portalData = () =>
          call(
            "select public.customer_portal_documents($1) result",
            [tenant],
            portal,
          ).then((r) => r[0].result);
        assert.equal((await portalData()).documents.length, 0);
        await assert.rejects(
          call(
            "select public.customer_file_access($1,$2,$3)",
            [tenant, doc, "document"],
            portal,
          ),
          (e) => e.code === "42501",
        );
        await command("document_metadata", {
          id: doc,
          version: 1,
          category: "agreement",
          visibility: "customer",
        });
        const data = await portalData();
        assert.equal(data.documents.length, 1);
        assert.equal(
          JSON.stringify(data).includes("FICTITIOUS business context"),
          false,
        );
        assert.equal(JSON.stringify(data).includes("storage_path"), false);
        await call(
          "select public.customer_file_access($1,$2,$3)",
          [tenant, doc, "document"],
          portal,
        );
        await db.query(
          "update public.object_customer_bindings set active=false where user_id=$1",
          [portal],
        );
        assert.equal((await portalData()).documents.length, 0);
        await assert.rejects(
          call(
            "select public.customer_file_access($1,$2,$3)",
            [tenant, doc, "document"],
            portal,
          ),
          (e) => e.code === "42501",
        );
      },
    );
    await t.test(
      "history projection excludes raw audit snapshots and is unavailable to staff",
      async () => {
        const h = (
          await call("select public.customer_history($1,$2) result", [
            tenant,
            customer,
          ])
        )[0].result;
        assert.ok(h.length > 0);
        assert.equal(JSON.stringify(h).includes("billing_email"), false);
        await assert.rejects(
          call(
            "select public.customer_history($1,$2)",
            [tenant, customer],
            staff,
          ),
          (e) => e.code === "42501",
        );
      },
    );
    await t.test(
      "preapproved extra work uses exact agreement, enforces cumulative limits and remains subject to review",
      async () => {
        const id = randomUUID(),
          order = randomUUID(),
          request = randomUUID(),
          request2 = randomUUID();
        await command("agreement_save", {
          ...contract,
          id,
          state: "active",
          acceptedBy: "FICTITIOUS approver",
          acceptedOn: "2026-01-01",
          documentId: doc,
          lines: [
            {
              ...contract.lines[0],
              quantity: 3,
              limitCents: 3600,
              extraWork: true,
            },
          ],
        });
        const line = (
          await db.query(
            "select id from public.customer_agreement_lines where agreement_id=$1",
            [id],
          )
        ).rows[0].id;
        await db.query(
          "insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,$1::uuid::text,'Test','planned',now()+interval '1 hour',now()+interval '2 hours',now()+interval '1 hour',now()+interval '2 hours',$5)",
          [order, tenant, customer, object, manager],
        );
        for (const r of [request, request2])
          await call(
            "select public.submit_object_visit_request($1,$2,$3,$4,$5)",
            [
              tenant,
              object,
              order,
              r,
              {
                title: "FICTITIOUS extra",
                body: "Only this concrete visit",
                kind: "extra",
                priority: "normal",
              },
            ],
          );
        const args = [
          tenant,
          request,
          1,
          "contract_extra",
          {
            agreementLineId: line,
            quantity: 2,
            reason: "Existing evidence covers this scope",
          },
        ];
        await call(
          "select public.review_object_visit_request($1,$2,$3,$4,$5)",
          args,
        );
        await call(
          "select public.review_object_visit_request($1,$2,$3,$4,$5)",
          args,
        );
        await assert.rejects(
          call(
            "select public.review_object_visit_request($1,$2,1,'contract_extra',$3)",
            [
              tenant,
              request2,
              {
                agreementLineId: line,
                quantity: 2,
                reason: "Would exceed shared visit limit",
              },
            ],
          ),
          (e) => e.code === "23514",
        );
        const tasks = (
          await db.query(
            "select * from public.work_order_tasks where work_order_id=$1",
            [order],
          )
        ).rows;
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].extra_work_status, "awaiting_review");
        assert.equal(tasks[0].commercial_snapshot.evidenceDocumentId, doc);
        assert.equal(tasks[0].vat_basis_points, 900);
        await db.query(
          "update public.work_order_tasks set completed_at=now(),executed_quantity=2,execution_state='completed' where id=$1",
          [tasks[0].id],
        );
        await call(
          "select public.review_object_visit_request($1,$2,1,'rejected',$3)",
          [tenant, request2, { reason: "Exceeds allowed scope" }],
        );
        await db.query(
          "update public.work_orders set status='completed' where id=$1",
          [order],
        );
        await call("select public.review_work_order($1,'approved',null)", [
          order,
        ]);
        assert.equal(
          (
            await db.query(
              "select extra_work_status from public.work_order_tasks where id=$1",
              [tasks[0].id],
            )
          ).rows[0].extra_work_status,
          "approved",
        );
        // Invoice snapshots must contain billing agreements, never the new internal dossier fields.
        await command("customer_save", {
          ...payload,
          version: 2,
          status: "active",
          paymentTerms: 10,
          referenceRequired: true,
          reference: "",
          preferences: "PRIVATE INTERNAL BUSINESS NOTE",
        });
        await assert.rejects(
          call("select public.create_execution_invoice($1,$2,$3)", [
            tenant,
            randomUUID(),
            JSON.stringify([{ taskId: tasks[0].id, quantity: 2 }]),
          ]),
          (e) => e.code === "23514",
        );
        await command("customer_save", {
          ...payload,
          version: 3,
          status: "active",
          paymentTerms: 10,
          referenceRequired: true,
          reference: "FICTITIOUS-PO",
          costCenter: "FICTITIOUS-COST",
          preferences: "PRIVATE INTERNAL BUSINESS NOTE",
        });
        const invoice = (
          await call("select (public.create_execution_invoice($1,$2,$3)).*", [
            tenant,
            randomUUID(),
            JSON.stringify([{ taskId: tasks[0].id, quantity: 2 }]),
          ])
        )[0];
        assert.equal(
          invoice.customer_snapshot.billing_preferences.reference,
          "FICTITIOUS-PO",
        );
        assert.equal(
          JSON.stringify(invoice.customer_snapshot).includes(
            "PRIVATE INTERNAL",
          ),
          false,
        );
        assert.equal(invoice.customer_snapshot.owner_user_id, undefined);
        assert.equal(
          (
            await db.query(
              "select due_on-issued_on days from public.invoices where id=$1",
              [invoice.id],
            )
          ).rows[0].days,
          10,
        );
        await assert.rejects(
          call("select public.create_execution_invoice($1,$2,$3)", [
            tenant,
            randomUUID(),
            JSON.stringify([{ taskId: tasks[0].id, quantity: 2 }]),
          ]),
          (e) => e.code === "23514",
        );
      },
    );
    await t.test(
      "daily reminders are opt-in, tenant scoped and deduplicated",
      async () => {
        const notify = () =>
          db.query("select public.process_customer_reminders()");
        await notify();
        assert.equal(
          (
            await db.query(
              "select count(*) from public.notifications where tenant_id=$1 and title='Een klantdossier vraagt aandacht'",
              [tenant],
            )
          ).rows[0].count,
          "0",
        );
        await command("customer_save", {
          ...payload,
          version: 4,
          status: "active",
          remindersEnabled: true,
        });
        await notify();
        await notify();
        assert.equal(
          (
            await db.query(
              "select count(*) from public.notifications where tenant_id=$1 and title='Een klantdossier vraagt aandacht'",
              [tenant],
            )
          ).rows[0].count,
          "1",
        );
      },
    );
    await t.test(
      "server pagination has stable ties and live sessions are required",
      async () => {
        for (let i = 0; i < 30; i++)
          await command("customer_save", {
            ...payload,
            id: randomUUID(),
            name: "FICTITIOUS same name",
            contactName: "",
          });
        const first = await list({ q: "same name", page: 1 }),
          second = await list({ q: "same name", page: 2 });
        assert.equal(first.total, 30);
        assert.equal(first.rows.length, 25);
        assert.equal(second.rows.length, 5);
        assert.equal(
          new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
          30,
        );
        assert.deepEqual(
          (await list({ q: "same name", page: 1 })).rows.map((r) => r.id),
          first.rows.map((r) => r.id),
        );
        await db.query(
          "update auth.sessions set not_after=now()-interval '1 second' where id=$1",
          [session],
        );
        await assert.rejects(list(), (e) => e.code === "42501");
      },
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
