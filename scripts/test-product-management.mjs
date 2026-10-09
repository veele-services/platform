import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("Product management: private ideas, recipient projections and transactional announcements", async (t) => {
  const db = await workOrderTestDatabase();
  await db.query("begin");
  const tenants = { a: randomUUID(), b: randomUUID() };
  const users = Object.fromEntries(
    [
      "admin",
      "manager",
      "colleague",
      "foreign",
      "staff",
      "customer",
      "hybrid",
      "outsider",
    ].map((k) => [k, randomUUID()]),
  );
  const sessions = Object.fromEntries(
    Object.keys(users).map((k) => [k, randomUUID()]),
  );
  const call = async (
    sql,
    args = [],
    who = "manager",
    role = "authenticated",
  ) => {
    await db.query("savepoint product_test");
    try {
      await db.query(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ role, sub: users[who], session_id: sessions[who] }),
      ]);
      const r = await db.query(sql, args);
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query("release savepoint product_test");
      return r.rows[0]?.data ?? r.rows;
    } catch (e) {
      await db.query("rollback to savepoint product_test");
      await db.query("release savepoint product_test");
      throw e;
    }
  };
  const query = (
    op,
    payload = {},
    who = "manager",
    tenant = tenants.a,
    ctx = "backoffice",
  ) =>
    call(
      "select public.product_query($1,$2,$3,$4) data",
      [tenant, ctx, op, payload],
      who,
    );
  const command = (
    op,
    payload,
    who = "admin",
    tenant = null,
    ctx = "platform",
    key = randomUUID(),
  ) =>
    call(
      "select public.product_command($1,$2,$3,$4,$5) data",
      [tenant, ctx, op, payload, key],
      who,
    );
  const platform = (op, p = {}) => query(op, p, "admin", null, "platform");
  const denied = (p) => assert.rejects(p, (e) => e.code === "42501");
  const all = {
    scope: "all",
    tenants: [],
    groups: ["management", "staff", "customer"],
  };
  const selected = (tenant, groups = ["management"]) => ({
    scope: "selected",
    tenants: [tenant],
    groups,
  });
  const internal = { scope: "internal", tenants: [], groups: [] };
  const ideaInput = {
    title: "FICTITIOUS private idea",
    category: "Planning",
    problem: "PRIVATE IDEA CANARY for our organisation",
    suggestion: "PRIVATE SUGGESTION CANARY",
    benefit: "PRIVATE BENEFIT CANARY",
  };
  const roadmapInput = {
    title: "FICTITIOUS general improvement",
    summary: "General description, reviewed by platform",
    body: "General improvement description",
    category: "Planning",
    progress: "development",
    priority: "high",
    responsible: users.admin,
    planning: "Indicatief volgend kwartaal",
    audience: internal,
    availability: [],
  };
  let idea, roadmap, release, file, foreignIdea;
  const detail = (kind, id) => platform(kind, { id });
  const eventCount = async () =>
    Number(
      (await db.query("select count(*) from private.product_events")).rows[0]
        .count,
    );
  const revision = async (table, id) =>
    Number(
      (
        await db.query(
          `select revision from private.product_${table} where id=$1`,
          [id],
        )
      ).rows[0].revision,
    );
  const publication = async (
    kind,
    id,
    inform = false,
    key = randomUUID(),
    op = "publish",
  ) =>
    command(
      op,
      {
        kind,
        id,
        revision: await revision(
          kind === "roadmap" ? "roadmap" : "releases",
          id,
        ),
        checked: true,
        inform,
      },
      "admin",
      null,
      "platform",
      key,
    );
  const change = async (
    audience,
    title = "FICTITIOUS inherited update",
    roadmapId = null,
  ) =>
    command("save_change", {
      releaseId: release.id,
      revision: await revision("releases", release.id),
      title,
      body: title + " explanation",
      kind: "improved",
      category: "Planning",
      roadmapId,
      audience,
      availability: [],
    });
  try {
    for (const [k, user] of Object.entries(users)) {
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [user, `${user}@product-fixture.invalid`],
      );
      await db.query(
        "insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",
        [sessions[k], user],
      );
    }
    await db.query("insert into public.platform_admins(user_id) values($1)", [
      users.admin,
    ]);
    for (const tenant of Object.values(tenants)) {
      await db.query(
        "insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS product tenant')",
        [tenant, `product-${tenant}`],
      );
      await db.query(
        "insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['personeel','klantportaal','planning'])",
        [tenant],
      );
      await db.query(
        "insert into public.tenant_branding(tenant_id) values($1)",
        [tenant],
      );
    }
    for (const [tenant, who, roles] of [
      [tenants.a, "manager", ["management"]],
      [tenants.a, "colleague", ["management"]],
      [tenants.b, "foreign", ["management"]],
      [tenants.a, "hybrid", ["management", "staff"]],
      [tenants.b, "hybrid", ["staff"]],
      [tenants.a, "staff", ["staff"]],
    ])
      await db.query(
        "insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3::public.app_role[],'active')",
        [tenant, users[who], roles],
      );
    for (const [tenant, who] of [
      [tenants.a, "staff"],
      [tenants.a, "hybrid"],
      [tenants.b, "hybrid"],
    ])
      await db.query(
        "insert into public.personnel(tenant_id,user_id,employee_number,full_name,email,status) values($1,$2,$3,'FICTITIOUS staff',$4,'active')",
        [
          tenant,
          users[who],
          randomUUID(),
          `${users[who]}@product-fixture.invalid`,
        ],
      );
    const customer = randomUUID(),
      contact = randomUUID();
    await db.query(
      "insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$1::uuid::text,'FICTITIOUS customer')",
      [customer, tenants.a],
    );
    await db.query(
      "insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email) values($1,$2,$3,'FICTITIOUS contact',$4)",
      [
        contact,
        tenants.a,
        customer,
        `${users.customer}@product-fixture.invalid`,
      ],
    );
    await db.query(
      "insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,created_by) values($1,$2,$3,$4,true,$5)",
      [tenants.a, customer, users.customer, contact, users.manager],
    );
    await t.test(
      "1. submission derives tenant/actor, deduplicates retries and uses different platform and tenant labels",
      async () => {
        const key = randomUUID();
        idea = await command(
          "submit_idea",
          ideaInput,
          "manager",
          tenants.a,
          "backoffice",
          key,
        );
        assert.deepEqual(
          await command(
            "submit_idea",
            ideaInput,
            "manager",
            tenants.a,
            "backoffice",
            key,
          ),
          idea,
        );
        assert.equal((await detail("idea", idea.id)).state, "draft");
        assert.equal((await query("idea", { id: idea.id })).state, "received");
        await assert.rejects(
          command(
            "submit_idea",
            { ...ideaInput, tenantId: tenants.b },
            "manager",
            tenants.a,
            "backoffice",
          ),
          (e) => e.code === "23514",
        );
        await assert.rejects(
          command(
            "submit_idea",
            { ...ideaInput, title: "different" },
            "manager",
            tenants.a,
            "backoffice",
            key,
          ),
          (e) => e.code === "23505",
        );
        assert.equal(
          (
            await db.query(
              "select count(*) from private.product_ideas where tenant_id=$1",
              [tenants.a],
            )
          ).rows[0].count,
          "1",
        );
      },
    );
    await t.test(
      "2. same-tenant management can follow and reply, regardless of the submitter",
      async () => {
        const own = await query("idea", { id: idea.id }, "colleague");
        await command(
          "reply",
          {
            id: idea.id,
            revision: own.revision,
            body: "FICTITIOUS colleague supplement",
          },
          "colleague",
          tenants.a,
          "backoffice",
        );
        assert.equal(
          (await query("idea", { id: idea.id })).messages[0].body,
          "FICTITIOUS colleague supplement",
        );
      },
    );
    await t.test(
      "3. foreign lists, detail, search, file and forged tenant access fail closed",
      async () => {
        assert.equal(
          (await query("ideas", { search: "PRIVATE" }, "foreign", tenants.b))
            .total,
          0,
        );
        await denied(query("idea", { id: idea.id }, "foreign", tenants.b));
        await denied(query("ideas", {}, "foreign", tenants.a));
        file = await command(
          "file_intent",
          {
            id: idea.id,
            kind: "idea",
            name: "PRIVATE screenshot.png",
            mime: "image/png",
            size: 10,
          },
          "manager",
          tenants.a,
          "backoffice",
        );
        await denied(
          query("upload", { id: file.fileId }, "foreign", tenants.b),
        );
        await denied(query("file", { id: file.fileId }, "foreign", tenants.b));
        await assert.rejects(
          command(
            "reply",
            { id: idea.id, revision: 2, body: "forged" },
            "foreign",
            tenants.b,
            "backoffice",
          ),
          (e) => e.code === "40001",
        );
      },
    );
    await t.test(
      "4. staff/customers cannot submit, query ideas or read private records",
      async () => {
        for (const [who, ctx] of [
          ["staff", "staff"],
          ["customer", "customer"],
        ]) {
          await denied(command("submit_idea", ideaInput, who, tenants.a, ctx));
          await denied(query("ideas", {}, who, tenants.a, ctx));
          await denied(query("idea", { id: idea.id }, who, tenants.a, ctx));
          await denied(query("file", { id: file.fileId }, who, tenants.a, ctx));
        }
        for (const ctx of [null, "", "forged-portal"]) {
          await denied(
            command("submit_idea", ideaInput, "outsider", tenants.a, ctx),
          );
          await denied(query("ideas", {}, "outsider", tenants.a, ctx));
          await denied(query("access", {}, "manager", tenants.a, ctx));
        }
      },
    );
    await t.test(
      "5. internal notes never enter tenant DTOs, searches or notification payloads",
      async () => {
        const before = await eventCount();
        await command("note", {
          kind: "idea",
          id: idea.id,
          body: "PRIVATE INTERNAL NOTE CANARY",
        });
        assert.equal((await detail("idea", idea.id)).notes.length, 1);
        assert.equal(
          JSON.stringify(await query("idea", { id: idea.id })).includes(
            "PRIVATE INTERNAL",
          ),
          false,
        );
        assert.equal(
          (await query("ideas", { search: "INTERNAL NOTE" })).total,
          0,
        );
        assert.equal(await eventCount(), before);
        assert.equal(
          (
            await db.query(
              "select count(*) from private.notification_requests where payload::text like '%PRIVATE INTERNAL%'",
            )
          ).rows[0].count,
          "0",
        );
      },
    );
    await t.test(
      "6. conversion creates a separate private roadmap and preserves the original idea",
      async () => {
        roadmap = await command("convert_idea", {
          ...roadmapInput,
          id: idea.id,
          revision: await revision("ideas", idea.id),
        });
        const d = await detail("roadmap_item", roadmap.id);
        assert.equal(d.publication, "draft");
        assert.equal(JSON.stringify(d).includes("PRIVATE SUGGESTION"), false);
        await denied(query("roadmap_item", { id: roadmap.id }));
        assert.equal((await query("idea", { id: idea.id })).roadmap, null);
        assert.equal((await query("idea", { id: idea.id })).state, "followup");
      },
    );
    await t.test(
      "7. draft release and child attachments remain inaccessible through direct endpoints",
      async () => {
        release = await command("save_release", {
          version: "fixture-1",
          title: "FICTITIOUS mixed release",
          intro: "General information for all groups",
          audience: all,
        });
        const ch = await change(null, "FICTITIOUS shared update", roadmap.id);
        const intent = await command("file_intent", {
          id: ch.fileId,
          kind: "change",
          name: "draft.png",
          mime: "image/png",
          size: 10,
        });
        await denied(query("release", { id: release.id }));
        await denied(query("file", { id: intent.fileId }));
        assert.equal((await query("releases")).total, 0);
      },
    );
    await t.test(
      "8. tenant AND group apply together, including multi-tenant roles and invalid empty selection",
      async () => {
        await command("save_roadmap", {
          ...roadmapInput,
          id: roadmap.id,
          revision: await revision("roadmap", roadmap.id),
          audience: selected(tenants.b, ["management"]),
        });
        await publication("roadmap", roadmap.id);
        await denied(
          query(
            "roadmap_item",
            { id: roadmap.id },
            "hybrid",
            tenants.b,
            "backoffice",
          ),
        );
        await denied(
          query(
            "roadmap_item",
            { id: roadmap.id },
            "hybrid",
            tenants.b,
            "staff",
          ),
        );
        await denied(
          query("roadmap_item", { id: roadmap.id }, "hybrid", tenants.a),
        );
        assert.ok(
          await query("roadmap_item", { id: roadmap.id }, "foreign", tenants.b),
        );
        for (const audience of [
          { scope: "selected", tenants: [], groups: ["management"] },
          { scope: "all", tenants: [], groups: [] },
          { scope: "selected", tenants: [null], groups: ["management"] },
          { scope: "all", tenants: [], groups: [null] },
          { scope: "all", tenants: [], groups: ["management", null] },
        ])
          await assert.rejects(
            command("save_release", {
              version: "invalid",
              title: "Invalid audience",
              intro: "",
              audience,
            }),
            (e) => e.code === "23514",
          );
      },
    );
    await t.test(
      "9. mixed release filters parts and metadata, and receiver preview uses the same projection",
      async () => {
        await change(
          selected(tenants.a, ["management"]),
          "MANAGEMENT ONLY CANARY",
        );
        await change(selected(tenants.a, ["staff"]), "STAFF ONLY CANARY");
        await change(selected(tenants.a, ["customer"]), "CUSTOMER ONLY CANARY");
        await change(internal, "INTERNAL CHANGE CANARY");
        const preview = await platform("preview", {
          id: release.id,
          kind: "releases",
          tenantId: tenants.a,
          group: "staff",
        });
        assert.equal(preview.item.changes.length, 2);
        await denied(query("preview", { tenantId: tenants.a, group: "staff" }));
        await publication("release", release.id);
        for (const [who, ctx, allowed] of [
          ["manager", "backoffice", "MANAGEMENT"],
          ["staff", "staff", "STAFF"],
          ["customer", "customer", "CUSTOMER"],
        ]) {
          const d = await query(
            "release",
            { id: release.id },
            who,
            tenants.a,
            ctx,
          );
          assert.equal(d.changes.length, 2);
          assert.equal(d.changes[1].title, allowed + " ONLY CANARY");
          assert.equal(JSON.stringify(d).includes("INTERNAL CHANGE"), false);
          assert.equal(d.changes[0].roadmap, null);
          assert.deepEqual(
            (
              await platform("preview", {
                id: release.id,
                kind: "releases",
                tenantId: tenants.a,
                group: ctx,
              })
            ).item,
            d,
          );
        }
      },
    );
    await t.test(
      "10. releases without visible parts disappear from totals, categories and searches",
      async () => {
        const hidden = await command("save_release", {
          version: "hidden",
          title: "ZERO VISIBLE CANARY",
          intro: "ZERO INTRO CANARY",
          audience: all,
        });
        await command("save_change", {
          releaseId: hidden.id,
          revision: 1,
          title: "HIDDEN PART CANARY",
          body: "secret",
          kind: "new",
          category: "SECRET CATEGORY",
          roadmapId: null,
          audience: internal,
          availability: [],
        });
        await publication("release", hidden.id);
        for (const q of [
          { search: "ZERO" },
          { search: "HIDDEN" },
          { category: "SECRET CATEGORY" },
        ])
          assert.equal((await query("releases", q)).total, 0);
        await denied(query("release", { id: hidden.id }));
      },
    );
    await t.test(
      "11. child cannot expand parent scope; edits cannot invalidate existing child restrictions",
      async () => {
        const limited = await command("save_release", {
          version: "limited",
          title: "Limited release",
          intro: "",
          audience: selected(tenants.a, ["management"]),
        });
        await assert.rejects(
          command("save_change", {
            releaseId: limited.id,
            revision: 1,
            title: "Too broad",
            body: "text",
            kind: "new",
            category: "Planning",
            roadmapId: null,
            audience: all,
            availability: [],
          }),
          (e) => e.code === "23514",
        );
        await assert.rejects(
          command("save_release", {
            id: release.id,
            revision: await revision("releases", release.id),
            version: "fixture-1",
            title: "Mixed release",
            intro: "",
            audience: selected(tenants.b, ["staff"]),
          }),
          (e) => e.code === "23514",
        );
      },
    );
    await t.test(
      "12. shared roadmap reveals neither another idea nor tenant/submitter/count metadata",
      async () => {
        foreignIdea = await command(
          "submit_idea",
          { ...ideaInput, title: "FOREIGN ORIGINAL CANARY" },
          "foreign",
          tenants.b,
          "backoffice",
        );
        await command("idea_link", {
          id: foreignIdea.id,
          revision: 1,
          roadmapId: roadmap.id,
        });
        await command("save_roadmap", {
          ...roadmapInput,
          id: roadmap.id,
          revision: await revision("roadmap", roadmap.id),
          audience: all,
        });
        const own = await query("idea", { id: idea.id });
        assert.ok(own.roadmap);
        for (const hidden of [
          "linkedIdeas",
          "FOREIGN ORIGINAL",
          foreignIdea.id,
          users.foreign,
          "priority",
          "responsible",
          "createdBy",
          "tenantId",
          "notes",
          "audit",
        ])
          assert.equal(JSON.stringify(own).includes(hidden), false);
        assert.equal(
          (await detail("roadmap_item", roadmap.id)).linkedIdeas.length,
          2,
        );
      },
    );
    await t.test(
      "13. staging availability does not imply production availability",
      async () => {
        await command("save_roadmap", {
          ...roadmapInput,
          id: roadmap.id,
          revision: await revision("roadmap", roadmap.id),
          audience: all,
          availability: [
            {
              environment: "staging",
              scope: "all",
              tenants: [],
              phased: false,
            },
          ],
        });
        const d = await query("roadmap_item", { id: roadmap.id });
        assert.equal(d.availability.staging, "Op staging te testen");
        assert.equal(
          d.availability.production,
          "Niet als beschikbaar geregistreerd",
        );
      },
    );
    await t.test(
      "14. publication, change ordering and partial releases never complete the roadmap automatically",
      async () => {
        const before = await detail("roadmap_item", roadmap.id),
          r = await detail("release", release.id);
        await command("reorder_changes", {
          releaseId: release.id,
          revision: r.revision,
          ids: r.changes.map((c) => c.id).reverse(),
        });
        assert.equal(
          (await detail("roadmap_item", roadmap.id)).progress,
          before.progress,
        );
        assert.equal(
          (await detail("release", release.id)).changes[0].id,
          r.changes.at(-1).id,
        );
      },
    );
    await t.test(
      "15. retries and multiple roles create only one in-app event/recipient and prepare exactly once",
      async () => {
        const key = randomUUID(),
          r = await detail("release", release.id),
          p = {
            kind: "release",
            id: release.id,
            revision: r.revision,
            checked: true,
            inform: true,
          },
          before = await eventCount();
        await command("announce", p, "admin", null, "platform", key);
        await command("announce", p, "admin", null, "platform", key);
        await assert.rejects(
          command("announce", p, "admin", null, "platform", randomUUID()),
          { code: "40001" },
        );
        assert.equal(
          (await detail("release", release.id)).revision,
          r.revision + 1,
        );
        assert.equal(await eventCount(), before + 1);
        const event = (
          await db.query(
            "select id from private.product_events where entity_kind='release' and entity_id=$1 order by created_at desc limit 1",
            [release.id],
          )
        ).rows[0].id;
        assert.equal(
          (
            await db.query(
              "select count(*) from private.product_event_recipients where event_id=$1 and tenant_id=$2 and user_id=$3",
              [event, tenants.a, users.hybrid],
            )
          ).rows[0].count,
          "1",
        );
        const reqs = (
          await db.query(
            "select id from private.notification_requests where source_id=$1",
            [event],
          )
        ).rows;
        assert.ok(reqs.length >= 5);
        for (const req of reqs) {
          await call(
            "select public.notification_delivery_prepare($1) data",
            [req.id],
            "admin",
            "service_role",
          );
          await call(
            "select public.notification_delivery_prepare($1) data",
            [req.id],
            "admin",
            "service_role",
          );
        }
        const deliveries = (
          await db.query(
            "select channel,count(*)::int n from private.notification_deliveries where request_id=any($1::uuid[]) group by channel",
            [reqs.map((r) => r.id)],
          )
        ).rows;
        assert.deepEqual(deliveries, [{ channel: "in_app", n: reqs.length }]);
      },
    );
    await t.test(
      "16. corrections, notes, status and audience edits do not implicitly announce",
      async () => {
        const before = await eventCount();
        await command("note", {
          id: release.id,
          kind: "release",
          body: "Internal release note",
        });
        await command("save_roadmap", {
          ...roadmapInput,
          id: roadmap.id,
          revision: await revision("roadmap", roadmap.id),
          title: "FICTITIOUS corrected general title",
          progress: "testing",
          audience: all,
        });
        await command("save_release", {
          id: release.id,
          revision: await revision("releases", release.id),
          version: "fixture-1",
          title: "FICTITIOUS corrected mixed release",
          intro: "Corrected general text",
          audience: all,
        });
        assert.equal(await eventCount(), before);
        assert.equal(
          (await query("roadmap_item", { id: roadmap.id })).progress,
          "testing",
        );
      },
    );
    await t.test(
      "managed roles use product read/submit separately without falling back to the legacy management role",
      async () => {
        await db.query("select private.management_seed($1)", [tenants.a]);
        const role = (
          await db.query(
            "select id from private.management_roles where tenant_id=$1 and code='planning'",
            [tenants.a],
          )
        ).rows[0].id;
        const member = (
          await db.query(
            "select id from public.tenant_memberships where tenant_id=$1 and user_id=$2",
            [tenants.a, users.colleague],
          )
        ).rows[0].id;
        await db.query(
          "insert into private.management_members(tenant_id,membership_id,role_id,full_name,accepted_at) values($1,$2,$3,'FICTITIOUS limited planner',now())",
          [tenants.a, member, role],
        );
        await denied(query("ideas", {}, "colleague"));
        await db.query(
          "insert into private.management_role_permissions(tenant_id,role_id,capability) values($1,$2,'backoffice.product.read')",
          [tenants.a, role],
        );
        assert.equal((await query("access", {}, "colleague")).canSubmit, false);
        assert.ok(await query("idea", { id: idea.id }, "colleague"));
        await denied(
          command(
            "reply",
            {
              id: idea.id,
              revision: await revision("ideas", idea.id),
              body: "Not permitted",
            },
            "colleague",
            tenants.a,
            "backoffice",
          ),
        );
        assert.equal(
          (
            await db.query(
              "select count(*) from private.management_role_permissions p join private.management_roles r on r.id=p.role_id where r.tenant_id=$1 and r.code in ('owner','management') and p.capability like 'backoffice.product.%'",
              [tenants.a],
            )
          ).rows[0].count,
          "4",
        );
      },
    );
    await t.test(
      "product delivery and inbox totals remove hidden sources; direct notifications and retries recheck access",
      async () => {
        const reqs = (
          await db.query(
            "select id from private.notification_requests where tenant_id=$1 and type_code='product.release'",
            [tenants.a],
          )
        ).rows;
        await db.query(
          "update private.notification_deliveries set available_at=now()-interval '1 second' where request_id=any($1::uuid[])",
          [reqs.map((r) => r.id)],
        );
        const claims = await call(
          "select public.notification_delivery_claim(100,$1) data",
          [tenants.a],
          "admin",
          "service_role",
        );
        for (const claim of claims)
          await call(
            "select public.notification_delivery_begin($1,$2) data",
            [claim.id, claim.lease],
            "admin",
            "service_role",
          );
        const inbox = () =>
          call(
            "select public.notification_query($1,'staff','inbox','{}') data",
            [tenants.a],
            "staff",
          );
        const before = await inbox();
        assert.equal(before.total, 1);
        assert.equal(before.unread_count, 1);
        assert.equal(
          before.items[0].target_path,
          `/staff/updates?release=${release.id}`,
        );
        await publication(
          "release",
          release.id,
          false,
          randomUUID(),
          "archive",
        );
        const after = await inbox();
        assert.equal(after.total, 0);
        assert.equal(after.unread_count, 0);
        assert.deepEqual(after.categories, []);
        await denied(
          call(
            "select public.notification_query($1,'staff','detail',$2) data",
            [tenants.a, { notification_id: before.items[0].id }],
            "staff",
          ),
        );
        await publication("release", release.id);
      },
    );
    await t.test(
      "17. live revocation closes notifications, details, list refresh and stale-session mutations",
      async () => {
        const event = (
          await db.query(
            "select id from private.product_events where entity_kind='release' and entity_id=$1 order by created_at desc limit 1",
            [release.id],
          )
        ).rows[0].id;
        const source = () =>
          db
            .query(
              "select private.notification_source_allowed($1,'product.release','product',$2,$2::uuid::text,$3,'backoffice') allowed",
              [tenants.a, event, users.manager],
            )
            .then((r) => r.rows[0].allowed);
        assert.equal(await source(), true);
        await db.query(
          "update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",
          [tenants.a, users.manager],
        );
        assert.equal(await source(), false);
        await denied(query("release", { id: release.id }));
        await denied(query("releases"));
        await denied(
          command(
            "reply",
            {
              id: idea.id,
              revision: await revision("ideas", idea.id),
              body: "stale",
            },
            "manager",
            tenants.a,
            "backoffice",
          ),
        );
        await db.query(
          "update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",
          [tenants.a, users.manager],
        );
        await db.query("delete from auth.sessions where id=$1", [
          sessions.manager,
        ]);
        await denied(query("releases"));
      },
    );
    await t.test(
      "all private tables/RPC helpers remain inaccessible to anonymous, authenticated and service roles",
      async () => {
        for (const role of ["anon", "authenticated", "service_role"]) {
          await denied(
            call("select * from private.product_ideas", [], "outsider", role),
          );
          await denied(
            call(
              "select private.product_query_for(null,'platform','ideas','{}',$1,true)",
              [users.outsider],
              "outsider",
              role,
            ),
          );
        }
        await denied(
          call(
            "select public.product_query(null,'platform','ideas','{}')",
            [],
            "admin",
            "anon",
          ),
        );
        await denied(
          call(
            "select public.product_query(null,'platform','ideas','{}')",
            [],
            "outsider",
          ),
        );
        await denied(
          call(
            "select public.product_command(null,'platform','publish','{}',$1)",
            [randomUUID()],
            "admin",
            "service_role",
          ),
        );
      },
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
