import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fieldDemoExistingOwnerQuery } from "../../scripts/fieldgrid-staging-existing-owner.mts";
import {
  classifyFieldDemoDomain,
  loadFieldDemoDomainSnapshot,
} from "../../scripts/fieldgrid-staging-field-demo-domain-repair.mts";
import {
  ensureFieldDemoFixture,
  FIELD_DEMO_OWNER_EMAIL,
} from "../../scripts/fieldgrid-website-staging-proof-state.mts";

const { z } = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
)("zod");
const ownerEmailSchema = z.string().email();

const setMatchingEmail = `WITH changed_owner AS (
  UPDATE auth.users SET email=$2 WHERE id=$1 RETURNING id
)
UPDATE auth.identities SET identity_data=jsonb_build_object('email',$2::text)
 WHERE user_id IN (SELECT id FROM changed_owner)`;

const invalidOwnerEmails = [
  ["empty email", ""],
  ["space-only email", "   "],
  ["control-whitespace-only email", "\t\r\n"],
  ["nonbreaking-space email", "\u00a0"],
  ["byte-order-mark email", "\ufeff"],
  ["leading whitespace", " owner@example.invalid"],
  ["trailing whitespace", "owner@example.invalid "],
  ["missing at sign", "owner.example.invalid"],
  ["missing local part", "@example.invalid"],
  ["missing domain", "owner@"],
  ["multiple at signs", "owner@@example.invalid"],
  ["domain without suffix", "owner@example"],
  ["leading local dot", ".owner@example.invalid"],
  ["trailing local dot", "owner.@example.invalid"],
  ["repeated local dot", "first..last@example.invalid"],
  ["display name instead of address", "Owner <owner@example.invalid>"],
  ["domain whitespace", "owner@exam ple.invalid"],
  ["domain underscore", "owner@exam_ple.invalid"],
];

// Called by the existing disposable-Postgres migration gate, never staging.
export async function verifyFieldDemoExistingOwner(client, context) {
  const tenant = randomUUID(),
    foreignTenant = randomUUID();
  const owner = randomUUID(),
    foreignOwner = randomUUID(),
    extraOwner = randomUUID();
  const role = randomUUID(),
    permission = randomUUID(),
    template = randomUUID();
  await client.query("BEGIN");
  try {
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM public.tenants WHERE slug = 'field-demo'",
        )
      ).rows[0].n,
      0,
    );
    // Local auth stubs omit GoTrue fields; all DDL and fixtures roll back.
    await client.query(`
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud text DEFAULT 'authenticated';
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'authenticated';
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
      CREATE TABLE IF NOT EXISTS auth.identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
        provider text, identity_data jsonb
      );
      SET LOCAL session_replication_role = replica;
    `);
    // Model historical foreign-tenant/platform overlap disallowed by today's
    // write barriers. Restore enforcement before exercising the real reads.
    await client.query(
      `INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at)
      VALUES ($1,'existing-owner@example.invalid','fixture-hash',now()),
             ($2,$3,'fixture-hash',now()),($4,'extra-owner@example.invalid','fixture-hash',now())`,
      [owner, foreignOwner, FIELD_DEMO_OWNER_EMAIL, extraOwner],
    );
    await client.query(
      `INSERT INTO auth.identities(user_id,provider,identity_data)
      SELECT id,'email',jsonb_build_object('email',email) FROM auth.users WHERE id=ANY($1::uuid[])`,
      [[owner, foreignOwner, extraOwner]],
    );
    await client.query(
      `INSERT INTO public.tenants(id,slug,name,plan_key) VALUES
      ($1,'field-demo','Existing owner fixture','enterprise'),
      ($2,'existing-owner-foreign-fixture','Foreign fixture','enterprise')`,
      [tenant, foreignTenant],
    );
    await client.query(
      `INSERT INTO public.tenant_users(tenant_id,user_id,role,status)
      VALUES ($1,$2,'owner','active'),($3,$4,'owner','active')`,
      [tenant, owner, foreignTenant, foreignOwner],
    );
    await client.query(
      `INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'owner','active')`,
      [foreignOwner],
    );
    await client.query(
      `INSERT INTO public.roles(id,name,is_system) VALUES ($1,'Management',true)`,
      [template],
    );
    await client.query(
      `INSERT INTO public.permissions(id,resource,action) VALUES ($1,'existing_owner_fixture','read')`,
      [permission],
    );
    await client.query(
      `INSERT INTO public.role_permissions(role_id,permission_id) VALUES ($1,$2)`,
      [template, permission],
    );
    await client.query(
      `INSERT INTO public.tenant_roles(id,tenant_id,template_role_id,name,is_system,is_custom)
      VALUES ($1,$2,$3,'Management',true,false)`,
      [role, tenant, template],
    );
    await client.query(
      `INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id) VALUES ($1,$2)`,
      [role, permission],
    );
    await client.query(
      `INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id) VALUES ($1,$2,$3)`,
      [tenant, owner, role],
    );
    await client.query(
      `INSERT INTO public.organization_settings(tenant_id) VALUES ($1)`,
      [tenant],
    );
    await client.query(
      `INSERT INTO public.tenant_subscriptions(tenant_id,plan_id,status)
      SELECT $1,id,'active' FROM public.plans WHERE key='enterprise'`,
      [tenant],
    );
    await client.query(
      `INSERT INTO public.tenant_domains(tenant_id,domain,type,is_primary,verification_status,verified_at)
      VALUES ($1,'field-demo.fieldgrid.nl','fieldgrid_subdomain',true,'verified',now())`,
      [tenant],
    );
    await client.query("SET LOCAL session_replication_role = origin");

    const counts = async () =>
      (await client.query(fieldDemoExistingOwnerQuery("$1"), [tenant])).rows[0];
    const unchangedAccounts = async () =>
      (
        await client.query(
          `SELECT
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM auth.users u WHERE id=ANY($1::uuid[])) AS accounts,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM auth.identities i WHERE user_id=ANY($1::uuid[])) AS identities,
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.tenant_users u WHERE user_id=ANY($1::uuid[])) AS memberships,
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.tenant_user_roles u WHERE user_id=ANY($1::uuid[])) AS roles,
      (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.platform_users u WHERE user_id=ANY($1::uuid[])) AS platform`,
          [[owner, foreignOwner, extraOwner]],
        )
      ).rows;
    const before = await unchangedAccounts();
    let finalInvariantSql = "";
    const database = {
      pool: {
        query(sql, values) {
          if (sql.includes("WHERE $2::uuid IS NULL")) finalInvariantSql = sql;
          return client.query(sql, values);
        },
      },
      provisionTenant() {
        throw new Error("Existing tenant must never be provisioned");
      },
      reserveProvisionedTenantOwnerInvite() {
        throw new Error("Owner must never be rebound");
      },
      completeProvisionedTenantOwnerInvite() {
        throw new Error("Owner must never be changed");
      },
      rollbackProvisionedTenant() {
        throw new Error("Existing tenant must never be deleted");
      },
    };
    await context.test(
      "foreign bootstrap account is ignored by domain and every proof read",
      async () => {
        assert.deepEqual(await counts(), {
          expected_owner_count: 1,
          expected_owner_management_role_count: 1,
        });
        assert.equal(
          classifyFieldDemoDomain(await loadFieldDemoDomainSnapshot(client))
            .state,
          "legacy-domain-needs-migration",
        );
        await client.query(
          `UPDATE public.tenant_domains SET domain='field-demo.staging.fieldgrid.nl' WHERE tenant_id=$1`,
          [tenant],
        );
        assert.equal(
          classifyFieldDemoDomain(await loadFieldDemoDomainSnapshot(client))
            .state,
          "already-valid",
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await ensureFieldDemoFixture(
            database,
            foreignOwner,
            "a".repeat(40),
            "existing-owner-test",
          );
          assert.equal(result.tenantId, tenant);
        }
        assert.deepEqual(await unchangedAccounts(), before);
      },
    );

    await context.test(
      "bootstrap postcheck pins the reserved owner ID even when another owner is valid",
      async () => {
        assert.ok(finalInvariantSql.length > 0);
        assert.equal(
          (await client.query(finalInvariantSql, [tenant, owner])).rows.length,
          1,
        );
        assert.equal(
          (await client.query(finalInvariantSql, [tenant, foreignOwner])).rows
            .length,
          0,
        );
        assert.deepEqual(await unchangedAccounts(), before);
      },
    );

    for (const email of [
      "owner@example.invalid",
      "Owner.Name+tag@Sub.Example.invalid",
      "o'neil@example.invalid",
      "owner_name-tag@example.invalid",
    ]) {
      await context.test(
        "valid email syntax remains eligible: " + email,
        async () => {
          assert.equal(ownerEmailSchema.safeParse(email).success, true);
          await client.query("SAVEPOINT valid_email");
          try {
            await client.query(setMatchingEmail, [owner, email]);
            const preimage = await unchangedAccounts();
            assert.deepEqual(await counts(), {
              expected_owner_count: 1,
              expected_owner_management_role_count: 1,
            });
            assert.equal(
              (
                await ensureFieldDemoFixture(
                  database,
                  foreignOwner,
                  "a".repeat(40),
                  "valid-email-test",
                )
              ).tenantId,
              tenant,
            );
            assert.deepEqual(await unchangedAccounts(), preimage);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT valid_email");
          }
        },
      );
    }

    const cases = [
      ...invalidOwnerEmails.map(([name, email]) => {
        assert.equal(ownerEmailSchema.safeParse(email).success, false);
        return [name, setMatchingEmail, [owner, email]];
      }),
      [
        "inactive owner",
        "UPDATE public.tenant_users SET status='disabled' WHERE user_id=$1",
        [owner],
      ],
      [
        "no owner",
        "UPDATE public.tenant_users SET role='member' WHERE user_id=$1",
        [owner],
      ],
      [
        "second active owner",
        "INSERT INTO public.tenant_users(tenant_id,user_id,role) VALUES ($1,$2,'owner')",
        [tenant, extraOwner],
      ],
      [
        "second inactive owner",
        "INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES ($1,$2,'owner','disabled')",
        [tenant, extraOwner],
      ],
      [
        "cross-tenant membership",
        "INSERT INTO public.tenant_users(tenant_id,user_id) VALUES ($1,$2)",
        [foreignTenant, owner],
      ],
      [
        "platform membership",
        "INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'support','suspended')",
        [owner],
      ],
      [
        "legacy global role",
        "INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$2)",
        [owner, template],
      ],
      [
        "platform metadata",
        'UPDATE auth.users SET raw_app_meta_data=\'{"portal":"platform-admin"}\' WHERE id=$1',
        [owner],
      ],
      [
        "no email identity",
        "DELETE FROM auth.identities WHERE user_id=$1",
        [owner],
      ],
      [
        "wrong email identity",
        "UPDATE auth.identities SET identity_data='{}' WHERE user_id=$1",
        [owner],
      ],
      [
        "unconfirmed email",
        "UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1",
        [owner],
      ],
      [
        "password unset",
        "UPDATE auth.users SET encrypted_password='' WHERE id=$1",
        [owner],
      ],
      [
        "anonymous user",
        "UPDATE auth.users SET is_anonymous=true WHERE id=$1",
        [owner],
      ],
      [
        "wrong audience",
        "UPDATE auth.users SET aud='service_role' WHERE id=$1",
        [owner],
      ],
      [
        "wrong auth role",
        "UPDATE auth.users SET role='service_role' WHERE id=$1",
        [owner],
      ],
      [
        "deleted user",
        "UPDATE auth.users SET deleted_at=now() WHERE id=$1",
        [owner],
      ],
      [
        "banned user",
        "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",
        [owner],
      ],
      [
        "missing role binding",
        "DELETE FROM public.tenant_user_roles WHERE user_id=$1",
        [owner],
      ],
      [
        "cross-tenant role binding",
        "UPDATE public.tenant_user_roles SET tenant_id=$1 WHERE user_id=$2",
        [foreignTenant, owner],
      ],
      [
        "custom management role",
        "UPDATE public.tenant_roles SET is_custom=true WHERE id=$1",
        [role],
      ],
      [
        "missing management permission",
        "DELETE FROM public.tenant_role_permissions WHERE tenant_role_id=$1",
        [role],
      ],
      [
        "extra management permission",
        "INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id) SELECT $1,id FROM public.permissions WHERE id<>$2 LIMIT 1",
        [role, permission],
      ],
    ];
    for (const [name, sql, params] of cases) {
      await context.test(
        name + " fails closed without repair fallback",
        async () => {
          await client.query("SAVEPOINT invalid_owner");
          try {
            await client.query("SET LOCAL session_replication_role = replica");
            assert.ok((await client.query(sql, params)).rowCount > 0);
            await client.query("SET LOCAL session_replication_role = origin");
            const preimage = await unchangedAccounts();
            const result = await counts();
            assert.ok(
              result.expected_owner_count !== 1 ||
                result.expected_owner_management_role_count !== 1,
            );
            assert.equal(
              classifyFieldDemoDomain(await loadFieldDemoDomainSnapshot(client))
                .state,
              "unsafe",
            );
            await assert.rejects(
              ensureFieldDemoFixture(
                database,
                foreignOwner,
                "a".repeat(40),
                "existing-owner-test",
              ),
              /fixture state is not exact/u,
            );
            assert.deepEqual(await unchangedAccounts(), preimage);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT invalid_owner");
          }
        },
      );
    }
  } finally {
    await client.query("ROLLBACK");
  }
}
