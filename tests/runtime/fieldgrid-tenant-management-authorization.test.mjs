import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { sqlForManagedMigrationTransaction } from "../../lib/db/src/migration-transaction-retry.ts";

const { Client } = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
)("pg");

async function withSecondClient(run) {
  const secondClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  await secondClient.connect();
  try {
    return await run(secondClient);
  } finally {
    try {
      await secondClient.query("ROLLBACK");
    } finally {
      await secondClient.end();
    }
  }
}

// Install only the historical function, never replay the rest of its migration.
// Callers must use a transaction/savepoint and restore the installed catalog.
export async function installHistoricalTenantManagementHelper(client) {
  const source = readFileSync(
    new URL(
      "../../lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const start = source.indexOf(
    "CREATE OR REPLACE FUNCTION public.is_management_for_tenant(",
  );
  const end = source.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start);
  await client.query(source.slice(start, end + 3));
}

const protectedTables = [
  "tenants",
  "tenant_users",
  "tenant_roles",
  "tenant_user_roles",
  "tenant_role_permissions",
  "roles",
  "role_permissions",
  "user_roles",
  "platform_users",
];

async function authorizationSnapshot(client) {
  const snapshot = {};
  for (const table of [
    ...[...protectedTables, "permissions"].map((name) => `public.${name}`),
    "auth.users",
    "auth.identities",
  ]) {
    const result = (
      await client.query(
        `SELECT count(*)::integer AS count,
       coalesce(jsonb_agg(to_jsonb(fixture_row) ORDER BY to_jsonb(fixture_row)::text), '[]'::jsonb) AS rows
       FROM ${table} AS fixture_row`,
      )
    ).rows[0];
    // A failed assertion must not print accounts, credentials or identity data.
    snapshot[table] = {
      count: result.count,
      hash: createHash("sha256")
        .update(JSON.stringify(result.rows))
        .digest("hex"),
    };
  }
  return snapshot;
}

async function inSavepoint(client, run) {
  await client.query("SAVEPOINT management_case");
  try {
    return await run();
  } finally {
    // Also recovers a deliberately failed migration or denied SQL statement.
    await client.query("ROLLBACK TO SAVEPOINT management_case");
    await client.query("RELEASE SAVEPOINT management_case");
  }
}

async function withSubject(client, userId, run) {
  await client.query("SAVEPOINT management_subject");
  try {
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SET LOCAL row_security = on");
    return await run();
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT management_subject");
    await client.query("RELEASE SAVEPOINT management_subject");
  }
}

// Executed by the migrated disposable-Postgres gate, never as a standalone test.
export async function verifyTenantManagementAuthorization(client, context) {
  const {
    loadTenantManagementAuthorizationSource,
    verifyTenantManagementAuthorizationContract,
    readTenantManagementAuthorizationImpact,
  } =
    await import("../../scripts/fieldgrid-tenant-management-authorization-contract.mts");
  const source = await loadTenantManagementAuthorizationSource();
  assert.equal(
    source.name,
    "20260914125503_scope_tenant_management_authorization.sql",
  );
  const migrationSql = sqlForManagedMigrationTransaction(source.sql);
  const restorePreviousCatalog = async () => {
    await installHistoricalTenantManagementHelper(client);
    await client.query(
      "DROP FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)",
    );
    await client.query(
      "DELETE FROM drizzle.veele_sql_migrations WHERE name=$1",
      [source.name],
    );
  };
  const recordMigration = () =>
    client.query(
      "INSERT INTO drizzle.veele_sql_migrations(name,hash,baselined) VALUES ($1,$2,false)",
      [source.name, source.hash],
    );
  const tenantA = randomUUID(),
    tenantB = randomUUID(),
    tenantC = randomUUID();
  const owner = randomUUID(),
    scopedOnly = randomUUID(),
    member = randomUUID(),
    platform = randomUUID();
  const roleA = randomUUID(),
    roleB = randomUUID(),
    outsidePermission = randomUUID();
  const eventA = randomUUID(),
    eventB = randomUUID(),
    eventC = randomUUID();
  let template;
  let permission;

  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    assert.equal(
      await verifyTenantManagementAuthorizationContract(client),
      true,
    );
    // If the isolation guard moves after SHARE locks, the second connection
    // will hit this incompatible lock instead of the required guard error.
    await client.query("LOCK TABLE public.tenant_users IN ROW EXCLUSIVE MODE");
    for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
      await context.test(
        `raw migration rejects an established ${isolation} snapshot without catalog changes`,
        () =>
          withSecondClient(async (secondClient) => {
            const catalogSnapshot = async () =>
              (
                await secondClient.query(
                  `SELECT
             (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_proc p
              WHERE p.oid IN (
                to_regprocedure('public.is_management_for_tenant(uuid)'),
                to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)')
              )) AS functions,
             (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.name)
              FROM drizzle.veele_sql_migrations j WHERE j.name=$1) AS history`,
                  [source.name],
                )
              ).rows;
            await secondClient.query(`BEGIN ISOLATION LEVEL ${isolation}`);
            // Force acquisition of the transaction snapshot before migration SQL.
            await secondClient.query("SELECT 1");
            const catalogBefore = await catalogSnapshot();
            await assert.rejects(secondClient.query(migrationSql), {
              code: "P0001",
              message: "tenant_management_requires_read_committed",
            });
            await secondClient.query("ROLLBACK");
            assert.deepEqual(await catalogSnapshot(), catalogBefore);
            assert.equal(
              await verifyTenantManagementAuthorizationContract(secondClient),
              true,
            );
          }),
      );
    }
    const baselineImpact =
      await readTenantManagementAuthorizationImpact(client);
    // The disposable auth shim lacks GoTrue identities; all fixture DDL rolls back.
    await client.query(`CREATE TABLE IF NOT EXISTS auth.identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      provider text, identity_data jsonb
    )`);
    // Historical overlap is fixture data only. Reinstate enforcement before reads.
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `INSERT INTO auth.users(id,email) SELECT id, id::text || '@management-fixture.invalid'
       FROM unnest($1::uuid[]) AS id`,
      [[owner, scopedOnly, member, platform]],
    );
    await client.query(
      `INSERT INTO auth.identities(user_id,provider,identity_data)
       SELECT id,'email',jsonb_build_object('email',email) FROM auth.users WHERE id=ANY($1::uuid[])`,
      [[owner, scopedOnly, member, platform]],
    );
    await client.query(
      `INSERT INTO public.tenants(id,slug,name,is_active,status)
       SELECT id, 'management-' || id::text, 'Management regression', true, 'active'
       FROM unnest($1::uuid[]) AS id`,
      [[tenantA, tenantB, tenantC]],
    );
    await client.query(
      `INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES
       ($1,$3,'owner','active'),($2,$3,'owner','active'),
       ($1,$4,'member','active'),($1,$5,'member','active'),($1,$6,'member','active')`,
      [tenantA, tenantB, owner, scopedOnly, member, platform],
    );
    const templateRows = await client.query(
      "SELECT id FROM public.roles WHERE name='Management'",
    );
    if (templateRows.rows.length === 0) {
      template = randomUUID();
      await client.query(
        "INSERT INTO public.roles(id,name,is_system) VALUES ($1,'Management',true)",
        [template],
      );
    } else {
      assert.equal(templateRows.rows.length, 1);
      template = templateRows.rows[0].id;
    }
    let expectedPermissions = (
      await client.query(
        "SELECT permission_id FROM public.role_permissions WHERE role_id=$1 ORDER BY permission_id",
        [template],
      )
    ).rows;
    if (expectedPermissions.length === 0) {
      permission = randomUUID();
      await client.query(
        "INSERT INTO public.permissions(id,resource,action) VALUES ($1,'management_regression','read')",
        [permission],
      );
      await client.query(
        "INSERT INTO public.role_permissions(role_id,permission_id) VALUES ($1,$2)",
        [template, permission],
      );
      expectedPermissions = [{ permission_id: permission }];
    }
    permission = expectedPermissions[0].permission_id;
    await client.query(
      "INSERT INTO public.permissions(id,resource,action) VALUES ($1,'management_regression_outside','read')",
      [outsidePermission],
    );
    await client.query(
      `INSERT INTO public.tenant_roles(id,tenant_id,template_role_id,name,is_system,is_custom)
       VALUES ($1,$3,$5,'Management',true,false),($2,$4,$5,'Management',true,false)`,
      [roleA, roleB, tenantA, tenantB, template],
    );
    await client.query(
      `INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id)
       SELECT granted_role.id, expected.permission_id FROM unnest($1::uuid[]) AS granted_role(id)
       CROSS JOIN public.role_permissions AS expected WHERE expected.role_id=$2`,
      [[roleA, roleB], template],
    );
    await client.query(
      `INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id)
       VALUES ($1,$3,$5),($2,$3,$6),($1,$4,$5),($1,$7,$5)`,
      [tenantA, tenantB, owner, scopedOnly, roleA, roleB, platform],
    );
    await client.query(
      "INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$2)",
      [owner, template],
    );
    await client.query(
      "INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'support','suspended')",
      [platform],
    );
    await client.query(
      `INSERT INTO public.portal_realtime_events(id,tenant_id,recipient_type,realtime_key,topic)
       VALUES ($1,$4,'management','management-fixture-a','assignments'),
              ($2,$5,'management','management-fixture-b','assignments'),
              ($3,$6,'management','management-fixture-c','assignments')`,
      [eventA, eventB, eventC, tenantA, tenantB, tenantC],
    );
    await client.query("SET LOCAL session_replication_role = origin");
    const before = await authorizationSnapshot(client);
    const allows = (userId, tenantId) =>
      withSubject(
        client,
        userId,
        async () =>
          (
            await client.query(
              "SELECT public.is_management_for_tenant($1) AS allowed",
              [tenantId],
            )
          ).rows[0].allowed,
      );
    const visibleEvents = (userId) =>
      withSubject(client, userId, async () =>
        (
          await client.query(
            "SELECT id::text FROM public.portal_realtime_events WHERE id=ANY($1::uuid[]) ORDER BY id",
            [[eventA, eventB, eventC]],
          )
        ).rows.map((row) => row.id),
      );

    await context.test(
      "local auth shim ACL failure predates the scoped Management helper",
      () =>
        inSavepoint(client, async () => {
          await installHistoricalTenantManagementHelper(client);
          assert.equal(await allows(owner, tenantA), true);
          const uidExecutable = (
            await client.query(
              "SELECT has_function_privilege('authenticated','auth.uid()','EXECUTE') AS allowed",
            )
          ).rows[0].allowed;
          if (uidExecutable) {
            assert.deepEqual(
              await visibleEvents(owner),
              [eventA, eventB].sort(),
            );
          } else {
            await assert.rejects(visibleEvents(owner), {
              code: "42501",
              message: "permission denied for function uid",
            });
          }
        }),
    );
    // Only repair the local shim within this rolled-back fixture transaction.
    // Do not grant any access to the private authorization helper or change RLS.
    await client.query("GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated");
    assert.equal(
      await verifyTenantManagementAuthorizationContract(client),
      true,
    );

    await context.test(
      "canonical scoped authority preserves both tenants and does not require any global role",
      async () => {
        assert.equal(await allows(owner, tenantA), true);
        assert.equal(await allows(owner, tenantB), true);
        assert.equal(await allows(owner, tenantC), false);
        assert.equal(await allows(scopedOnly, tenantA), true);
        assert.equal(await allows(scopedOnly, tenantB), false);
        assert.deepEqual(await visibleEvents(owner), [eventA, eventB].sort());
        assert.deepEqual(await visibleEvents(scopedOnly), [eventA]);
        assert.deepEqual(await visibleEvents(member), []);
        assert.deepEqual(await visibleEvents(platform), []);
        assert.equal(await allows(platform, tenantA), false);
        assert.equal(await allows(null, tenantA), false);
        assert.equal(await allows(owner, null), false);
        const impact = await readTenantManagementAuthorizationImpact(client);
        assert.equal(
          Number(impact.legacy_pairs) - Number(baselineImpact.legacy_pairs),
          2,
        );
        assert.equal(
          Number(impact.preserved_pairs) -
            Number(baselineImpact.preserved_pairs),
          2,
        );
        assert.equal(
          Number(impact.missing_pairs) - Number(baselineImpact.missing_pairs),
          0,
        );
        assert.equal(
          Number(impact.scoped_pairs) - Number(baselineImpact.scoped_pairs),
          3,
        );
        assert.deepEqual(await authorizationSnapshot(client), before);
      },
    );

    const invalidStates = [
      [
        "inactive membership",
        "UPDATE public.tenant_users SET status='disabled' WHERE tenant_id=$1 AND user_id=$2",
        [tenantA, owner],
      ],
      [
        "disabled tenant",
        "UPDATE public.tenants SET is_active=false WHERE id=$1",
        [tenantA],
      ],
      [
        "suspended tenant",
        "UPDATE public.tenants SET status='suspended' WHERE id=$1",
        [tenantA],
      ],
      [
        "custom Management role",
        "UPDATE public.tenant_roles SET is_custom=true WHERE id=$1",
        [roleA],
      ],
      [
        "non-system Management role",
        "UPDATE public.tenant_roles SET is_system=false WHERE id=$1",
        [roleA],
      ],
      [
        "renamed tenant role",
        "UPDATE public.tenant_roles SET name='Management lookalike' WHERE id=$1",
        [roleA],
      ],
      [
        "missing template",
        "UPDATE public.tenant_roles SET template_role_id=NULL WHERE id=$1",
        [roleA],
      ],
      [
        "non-system template",
        "UPDATE public.roles SET is_system=false WHERE id=$1",
        [template],
      ],
      [
        "renamed template",
        "UPDATE public.roles SET name='Management lookalike' WHERE id=$1",
        [template],
      ],
      [
        "empty canonical permission set",
        "DELETE FROM public.role_permissions WHERE role_id=$1",
        [template],
      ],
      [
        "missing canonical permission",
        "DELETE FROM public.tenant_role_permissions WHERE tenant_role_id=$1 AND permission_id=$2",
        [roleA, permission],
      ],
      [
        "extra permission",
        "INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id) VALUES ($1,$2)",
        [roleA, outsidePermission],
      ],
      [
        "same-count permission substitution",
        "UPDATE public.tenant_role_permissions SET permission_id=$3 WHERE tenant_role_id=$1 AND permission_id=$2",
        [roleA, permission, outsidePermission],
      ],
      [
        "null role link",
        "UPDATE public.tenant_user_roles SET tenant_role_id=NULL WHERE tenant_id=$1 AND user_id=$2",
        [tenantA, owner],
      ],
      [
        "foreign role link",
        "UPDATE public.tenant_user_roles SET tenant_role_id=$3 WHERE tenant_id=$1 AND user_id=$2",
        [tenantA, owner, roleB],
      ],
      [
        "orphan role link",
        "UPDATE public.tenant_user_roles SET tenant_role_id=$3 WHERE tenant_id=$1 AND user_id=$2",
        [tenantA, owner, randomUUID()],
      ],
      [
        "membership missing despite role",
        "DELETE FROM public.tenant_users WHERE tenant_id=$1 AND user_id=$2",
        [tenantA, owner],
      ],
      [
        "platform overlap",
        "INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'support','suspended')",
        [owner],
      ],
    ];
    const arrangeInvalidState = async (name, sql, values) => {
      // Defense-in-depth fixture: NOT NULL already prevents this state today.
      // Model historical corruption only inside the enclosing case savepoint.
      if (name === "null role link") {
        await client.query(
          "ALTER TABLE public.tenant_user_roles ALTER COLUMN tenant_role_id DROP NOT NULL",
        );
      }
      await client.query("SET LOCAL session_replication_role = replica");
      assert.ok((await client.query(sql, values)).rowCount > 0);
      await client.query("SET LOCAL session_replication_role = origin");
    };
    for (const [name, sql, values] of invalidStates) {
      await context.test(
        name + " cannot authorize via canonical tenant Management",
        () =>
          inSavepoint(client, async () => {
            await arrangeInvalidState(name, sql, values);
            const preimage = await authorizationSnapshot(client);
            assert.equal(await allows(owner, tenantA), false);
            assert.ok(!(await visibleEvents(owner)).includes(eventA));
            assert.deepEqual(await authorizationSnapshot(client), preimage);
          }),
      );
    }
    for (const status of ["provisioning", "trial", "active"]) {
      await context.test(
        "enabled tenant status " + status + " retains scoped authorization",
        () =>
          inSavepoint(client, async () => {
            await client.query(
              "UPDATE public.tenants SET status=$2 WHERE id=$1",
              [tenantA, status],
            );
            assert.equal(await allows(owner, tenantA), true);
          }),
      );
    }
    await context.test(
      "global Management plus active membership alone never authorizes",
      () =>
        inSavepoint(client, async () => {
          await client.query(
            "INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$2)",
            [member, template],
          );
          assert.equal(await allows(member, tenantA), false);
          assert.deepEqual(await visibleEvents(member), []);
          const impact = await readTenantManagementAuthorizationImpact(client);
          assert.equal(
            Number(impact.missing_pairs) - Number(baselineImpact.missing_pairs),
            1,
          );
        }),
    );

    await context.test(
      "migration preserves both previously authorized tenants without role writes and records exact completion",
      (migrationContext) =>
        inSavepoint(client, async () => {
          await restorePreviousCatalog();
          assert.equal(await allows(owner, tenantA), true);
          assert.equal(await allows(owner, tenantB), true);
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            false,
          );
          const preimage = await authorizationSnapshot(client);
          await client.query(migrationSql);
          // Catalog installation alone does not authorize the relaxed owner path.
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            false,
          );
          await recordMigration();
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            true,
          );
          assert.equal(await allows(owner, tenantA), true);
          assert.equal(await allows(owner, tenantB), true);
          assert.equal(await allows(scopedOnly, tenantA), true);
          assert.deepEqual(await authorizationSnapshot(client), preimage);
          const locks = await client.query(
            `SELECT relation.relname, lock.mode FROM pg_catalog.pg_locks AS lock
         JOIN pg_catalog.pg_class AS relation ON relation.oid=lock.relation
         JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
         WHERE lock.pid=pg_backend_pid() AND lock.granted AND namespace.nspname='public'
           AND relation.relname=ANY($1::text[])
           AND lock.mode IN ('ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')`,
            [protectedTables],
          );
          assert.deepEqual(
            [...new Set(locks.rows.map((row) => row.relname))].sort(),
            [...protectedTables].sort(),
          );
          await migrationContext.test(
            "SHARE barriers block concurrent permission and membership updates",
            () =>
              withSecondClient(async (secondClient) => {
                for (const statement of [
                  "UPDATE public.tenant_role_permissions SET permission_id=permission_id WHERE false",
                  "UPDATE public.tenant_users SET status=status WHERE false",
                ]) {
                  await secondClient.query(
                    "BEGIN ISOLATION LEVEL READ COMMITTED",
                  );
                  try {
                    await secondClient.query(
                      "SET LOCAL lock_timeout = '100ms'",
                    );
                    // Even zero-row UPDATE requires RowExclusiveLock: this proves
                    // the migration's write barrier without changing fixture data.
                    await assert.rejects(secondClient.query(statement), {
                      code: "55P03",
                    });
                  } finally {
                    await secondClient.query("ROLLBACK");
                  }
                  assert.equal(
                    (await secondClient.query("SELECT 1 AS recovered")).rows[0]
                      .recovered,
                    1,
                  );
                }
              }),
          );
          assert.deepEqual(await authorizationSnapshot(client), preimage);
          // A repeated operation must skip migration SQL using journal + catalog.
          const journal = (
            await client.query(
              "SELECT hash,baselined FROM drizzle.veele_sql_migrations WHERE name=$1",
              [source.name],
            )
          ).rows;
          assert.deepEqual(journal, [{ hash: source.hash, baselined: false }]);
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            true,
          );
          await client.query("SAVEPOINT repeated_raw_migration");
          await assert.rejects(client.query(migrationSql), {
            code: "P0001",
            message: "tenant_management_unexpected_existing_private_helper",
          });
          await client.query("ROLLBACK TO SAVEPOINT repeated_raw_migration");
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            true,
          );
          assert.deepEqual(await authorizationSnapshot(client), preimage);
        }),
    );

    const losingStates = invalidStates.filter(
      ([name]) =>
        ![
          "inactive membership",
          "disabled tenant",
          "suspended tenant",
          "renamed template",
          "membership missing despite role",
        ].includes(name),
    );
    for (const [name, sql, values] of losingStates) {
      await context.test(
        "migration refuses loss from " + name + " and rolls back its catalog",
        () =>
          inSavepoint(client, async () => {
            await restorePreviousCatalog();
            await arrangeInvalidState(name, sql, values);
            assert.equal(await allows(owner, tenantA), true);
            const preimage = await authorizationSnapshot(client);
            const previousDefinition = (
              await client.query(
                "SELECT pg_get_functiondef('public.is_management_for_tenant(uuid)'::regprocedure) AS definition",
              )
            ).rows[0].definition;
            await client.query("SAVEPOINT refused_management_migration");
            await assert.rejects(client.query(migrationSql), {
              code: "P0001",
              message: "tenant_management_scope_preservation_failed",
            });
            await client.query(
              "ROLLBACK TO SAVEPOINT refused_management_migration",
            );
            assert.equal(
              (
                await client.query(
                  "SELECT pg_get_functiondef('public.is_management_for_tenant(uuid)'::regprocedure) AS definition",
                )
              ).rows[0].definition,
              previousDefinition,
            );
            assert.equal(await allows(owner, tenantA), true);
            assert.equal(
              (
                await client.query(
                  "SELECT to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') AS helper",
                )
              ).rows[0].helper,
              null,
            );
            assert.equal(
              (
                await client.query(
                  "SELECT count(*)::integer AS count FROM drizzle.veele_sql_migrations WHERE name=$1",
                  [source.name],
                )
              ).rows[0].count,
              0,
            );
            assert.deepEqual(await authorizationSnapshot(client), preimage);
          }),
      );
    }
    for (const [name, sql, values] of invalidStates.filter(([name]) =>
      ["inactive membership", "disabled tenant", "suspended tenant"].includes(
        name,
      ),
    )) {
      await context.test(
        "migration does not mistake " +
          name +
          " for currently effective access",
        () =>
          inSavepoint(client, async () => {
            await restorePreviousCatalog();
            await client.query(sql, values);
            assert.equal(await allows(owner, tenantA), false);
            const preimage = await authorizationSnapshot(client);
            await client.query(migrationSql);
            await recordMigration();
            assert.equal(
              await verifyTenantManagementAuthorizationContract(client),
              true,
            );
            assert.equal(await allows(owner, tenantA), false);
            assert.equal(await allows(owner, tenantB), true);
            assert.deepEqual(await authorizationSnapshot(client), preimage);
          }),
      );
    }
    for (const [name, sql, expectedMessage] of [
      [
        "changed legacy body",
        "CREATE OR REPLACE FUNCTION public.is_management_for_tenant(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS 'SELECT false'",
        "tenant_management_legacy_contract_drift",
      ],
      [
        "legacy invoker drift",
        "ALTER FUNCTION public.is_management_for_tenant(uuid) SECURITY INVOKER",
        "tenant_management_legacy_contract_drift",
      ],
      [
        "legacy ACL drift",
        "GRANT EXECUTE ON FUNCTION public.is_management_for_tenant(uuid) TO anon",
        "tenant_management_legacy_contract_drift",
      ],
      [
        "legacy policy consumer",
        "CREATE POLICY management_legacy_fixture_policy ON public.portal_realtime_events FOR SELECT TO authenticated USING (public.is_management())",
        "tenant_management_unexpected_legacy_consumer",
      ],
      [
        "legacy role policy consumer",
        "CREATE POLICY management_legacy_fixture_policy ON public.portal_realtime_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles))",
        "tenant_management_unexpected_legacy_consumer",
      ],
      [
        "legacy function consumer",
        "CREATE FUNCTION public.management_legacy_fixture_consumer() RETURNS boolean LANGUAGE sql AS 'SELECT public.is_management()'",
        "tenant_management_unexpected_legacy_consumer",
      ],
      [
        "legacy view consumer",
        "CREATE VIEW public.management_legacy_fixture_view AS SELECT public.is_management() AS allowed",
        "tenant_management_unexpected_legacy_consumer",
      ],
    ]) {
      await context.test(
        "migration rejects " + name + " before replacing authorization",
        () =>
          inSavepoint(client, async () => {
            await restorePreviousCatalog();
            await client.query(sql);
            const preimage = await authorizationSnapshot(client);
            const oldDefinition = (
              await client.query(
                "SELECT pg_get_functiondef('public.is_management_for_tenant(uuid)'::regprocedure) AS definition",
              )
            ).rows[0].definition;
            await client.query("SAVEPOINT rejected_management_contract");
            await assert.rejects(client.query(migrationSql), {
              code: "P0001",
              message: expectedMessage,
            });
            await client.query(
              "ROLLBACK TO SAVEPOINT rejected_management_contract",
            );
            assert.equal(
              (
                await client.query(
                  "SELECT pg_get_functiondef('public.is_management_for_tenant(uuid)'::regprocedure) AS definition",
                )
              ).rows[0].definition,
              oldDefinition,
            );
            assert.equal(
              (
                await client.query(
                  "SELECT to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') AS helper",
                )
              ).rows[0].helper,
              null,
            );
            assert.deepEqual(await authorizationSnapshot(client), preimage);
          }),
      );
    }
    for (const [name, sql, values] of [
      [
        "missing migration history",
        "DELETE FROM drizzle.veele_sql_migrations WHERE name=$1",
        [source.name],
      ],
      [
        "wrong migration hash",
        "UPDATE drizzle.veele_sql_migrations SET hash=$2 WHERE name=$1",
        [source.name, "0".repeat(64)],
      ],
      [
        "baselined history",
        "UPDATE drizzle.veele_sql_migrations SET baselined=true WHERE name=$1",
        [source.name],
      ],
      [
        "public helper ACL drift",
        "GRANT EXECUTE ON FUNCTION public.is_management_for_tenant(uuid) TO anon",
        [],
      ],
      [
        "private helper ACL drift",
        "GRANT EXECUTE ON FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) TO authenticated",
        [],
      ],
      [
        "private helper security mode drift",
        "ALTER FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) SECURITY DEFINER",
        [],
      ],
      [
        "private helper owner drift",
        "ALTER FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) OWNER TO authenticated",
        [],
      ],
    ]) {
      await context.test("installed contract rejects " + name, () =>
        inSavepoint(client, async () => {
          await client.query(sql, values);
          assert.equal(
            await verifyTenantManagementAuthorizationContract(client),
            false,
          );
        }),
      );
    }
    assert.equal(
      await verifyTenantManagementAuthorizationContract(client),
      true,
    );
    assert.deepEqual(await authorizationSnapshot(client), before);
  } finally {
    await client.query("ROLLBACK");
  }
}
