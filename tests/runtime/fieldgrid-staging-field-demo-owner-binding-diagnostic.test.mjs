import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadFieldDemoOwnerPlatformPrivilegeSnapshot,
  summarizeFieldDemoOwnerPlatformPrivilege,
} from "../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts";
import {
  connect,
  databaseUrl,
} from "../../scripts/fieldgrid-runtime-safety-lib.mjs";

const ownerUserId = "91000000-0000-4000-8000-000000000001";
const platformUserId = "91000000-0000-4000-8000-000000000002";
const inactiveTenantId = "91000000-0000-4000-8000-000000000003";
const activeTenantId = "91000000-0000-4000-8000-000000000004";
const dispatchId = "91000000-0000-4000-8000-000000000005";
const recipientId = "91000000-0000-4000-8000-000000000006";

async function rollback(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Closing the dedicated client also discards an unfinished transaction.
  }
}

async function insertOwnerPlatformUser(client) {
  await client.query(
    `INSERT INTO auth.users (id, email, raw_app_meta_data)
     VALUES ($1, $2, $3::jsonb)`,
    [
      ownerUserId,
      "info@dgwebservices.nl",
      JSON.stringify({
        fieldgrid_automation_contract:
          "fieldgrid-staging-field-demo-owner-repair-v1",
        fieldgrid_environment: "staging",
        portal: "tenant-admin",
      }),
    ],
  );
  await client.query(
    `INSERT INTO public.platform_users (id, user_id, role, status)
     VALUES ($1, $2, 'support', 'active')`,
    [platformUserId, ownerUserId],
  );
}

async function insertTenant(client, { id, slug, isActive, status }) {
  await client.query(
    `INSERT INTO public.tenants (id, slug, name, is_active, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, slug, `Diagnostic ${slug}`, isActive, status],
  );
}

async function insertCurrentGrant(client, tenantId) {
  await client.query(
    `INSERT INTO public.support_access_grants (
       tenant_id,
       platform_user_id,
       reason,
       starts_at,
       expires_at,
       created_by
     ) VALUES ($1, $2, 'diagnostic', now() - interval '1 hour',
               now() + interval '1 hour', $3)`,
    [tenantId, platformUserId, ownerUserId],
  );
}

async function insertDispatch(client) {
  await client.query(
    `INSERT INTO public.platform_notification_dispatches (
       id,
       template_key,
       audience_type,
       title,
       body
     ) VALUES ($1, 'maintenance', 'platform_users', 'Diagnostic', 'Diagnostic')`,
    [dispatchId],
  );
}

test("PostgreSQL 17 executes the platform-privilege diagnostic and rejects schema lookalikes", async () => {
  databaseUrl();
  const client = await connect();

  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY",
    );
    const exactSnapshot = await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
      client,
      null,
    );
    assert.equal(exactSnapshot.direct_platform_fk_count, 9);
    assert.equal(exactSnapshot.exact_direct_platform_fk_count, 9);
    assert.equal(exactSnapshot.indirect_grant_fk_count, 2);
    assert.equal(exactSnapshot.exact_indirect_grant_fk_count, 2);
    assert.equal(exactSnapshot.exact_set_null_nullable_column_count, 9);
    assert.equal(exactSnapshot.recipient_scope_check_count, 1);
    assert.equal(exactSnapshot.unexpected_set_null_check_count, 0);
    assert.equal(exactSnapshot.unexpected_deletion_path_trigger_count, 0);
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(exactSnapshot)
        .foreignKeyContractState,
      "exact",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE public.platform_ticket_notes
        ALTER COLUMN author_platform_user_id SET NOT NULL;
      ALTER TABLE public.tenant_domains
        ADD CONSTRAINT fieldgrid_diagnostic_actor_required_check
        CHECK (verified_by_platform_user_id IS NOT NULL) NOT VALID;
      CREATE FUNCTION public.fieldgrid_diagnostic_update_trigger()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER fieldgrid_diagnostic_update_trigger
        BEFORE UPDATE ON public.platform_ticket_notes
        FOR EACH ROW
        EXECUTE FUNCTION public.fieldgrid_diagnostic_update_trigger()
    `);
    const deletionPathDriftSnapshot =
      await loadFieldDemoOwnerPlatformPrivilegeSnapshot(client, null);
    assert.equal(
      deletionPathDriftSnapshot.exact_set_null_nullable_column_count,
      8,
    );
    assert.equal(deletionPathDriftSnapshot.unexpected_set_null_check_count, 1);
    assert.equal(
      deletionPathDriftSnapshot.unexpected_deletion_path_trigger_count,
      1,
    );
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(deletionPathDriftSnapshot)
        .foreignKeyContractState,
      "drift",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE public.support_access_grants
        ADD CONSTRAINT fieldgrid_diagnostic_duplicate_platform_user_fk
        FOREIGN KEY (platform_user_id)
        REFERENCES public.platform_users(id)
        ON DELETE CASCADE
    `);
    const duplicateSnapshot = await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
      client,
      null,
    );
    assert.equal(duplicateSnapshot.direct_platform_fk_count, 10);
    assert.equal(duplicateSnapshot.exact_direct_platform_fk_count, 8);
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(duplicateSnapshot)
        .foreignKeyContractState,
      "drift",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE public.platform_notification_recipients
        DROP CONSTRAINT platform_notification_recipients_scope_check;
      ALTER TABLE public.platform_notification_recipients
        ADD CONSTRAINT platform_notification_recipients_scope_check CHECK (
          recipient_type <> 'platform_user'
          OR platform_user_id IS NOT NULL
          OR tenant_id IS NULL
        )
    `);
    const weakenedConstraintSnapshot =
      await loadFieldDemoOwnerPlatformPrivilegeSnapshot(client, null);
    assert.equal(weakenedConstraintSnapshot.recipient_scope_check_count, 0);
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(weakenedConstraintSnapshot)
        .foreignKeyContractState,
      "drift",
    );
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await insertOwnerPlatformUser(client);
    await insertTenant(client, {
      id: inactiveTenantId,
      slug: "diagnostic-inactive",
      isActive: false,
      status: "suspended",
    });
    await insertCurrentGrant(client, inactiveTenantId);
    const inactiveTenantSnapshot =
      await loadFieldDemoOwnerPlatformPrivilegeSnapshot(client, null);
    assert.equal(
      inactiveTenantSnapshot.platform_current_support_grant_count,
      1,
    );
    assert.equal(
      inactiveTenantSnapshot.platform_current_runtime_support_grant_count,
      0,
    );
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(inactiveTenantSnapshot)
        .effectiveSupportState,
      "blocked-by-tenant-status",
    );

    await insertTenant(client, {
      id: activeTenantId,
      slug: "diagnostic-active",
      isActive: true,
      status: "active",
    });
    await insertCurrentGrant(client, activeTenantId);
    const activeTenantSnapshot =
      await loadFieldDemoOwnerPlatformPrivilegeSnapshot(client, null);
    assert.equal(activeTenantSnapshot.platform_current_support_grant_count, 2);
    assert.equal(
      activeTenantSnapshot.platform_current_runtime_support_grant_count,
      1,
    );
    assert.equal(
      summarizeFieldDemoOwnerPlatformPrivilege(activeTenantSnapshot)
        .effectiveSupportState,
      "active",
    );

    await insertDispatch(client);
    await client.query(
      `INSERT INTO public.platform_notification_recipients (
         id,
         dispatch_id,
         recipient_type,
         tenant_id,
         platform_user_id,
         recipient_email
       ) VALUES ($1, $2, 'tenant_owner', $3, $4, 'diagnostic@example.invalid')`,
      [recipientId, dispatchId, activeTenantId, platformUserId],
    );
    const setNullSnapshot = await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
      client,
      null,
    );
    const setNullSummary =
      summarizeFieldDemoOwnerPlatformPrivilege(setNullSnapshot);
    assert.equal(setNullSnapshot.platform_blocking_reference_count, 0);
    assert.equal(setNullSnapshot.platform_set_null_reference_count, 1);
    assert.equal(setNullSummary.deletionBlockState, "none");
    assert.equal(
      setNullSummary.deletionImpactState,
      "cascade-and-set-null-history-present",
    );
    await client.query("DELETE FROM public.platform_users WHERE id = $1", [
      platformUserId,
    ]);
    const deletionReadback = await client.query(
      `SELECT
         (SELECT COUNT(*)::integer FROM public.support_access_grants
           WHERE platform_user_id = $1) AS grant_count,
         (SELECT COUNT(*)::integer
            FROM public.platform_notification_recipients
           WHERE id = $2 AND platform_user_id IS NULL) AS null_recipient_count`,
      [platformUserId, recipientId],
    );
    assert.deepEqual(deletionReadback.rows[0], {
      grant_count: 0,
      null_recipient_count: 1,
    });
    await client.query("ROLLBACK");

    await client.query("BEGIN");
    await insertOwnerPlatformUser(client);
    await insertDispatch(client);
    await client.query(
      `INSERT INTO public.platform_notification_recipients (
         id,
         dispatch_id,
         recipient_type,
         platform_user_id
       ) VALUES ($1, $2, 'platform_user', $3)`,
      [recipientId, dispatchId, platformUserId],
    );
    const blockingSnapshot = await loadFieldDemoOwnerPlatformPrivilegeSnapshot(
      client,
      null,
    );
    const blockingSummary =
      summarizeFieldDemoOwnerPlatformPrivilege(blockingSnapshot);
    assert.equal(blockingSnapshot.platform_blocking_reference_count, 1);
    assert.equal(blockingSnapshot.platform_set_null_reference_count, 0);
    assert.equal(
      blockingSummary.deletionBlockState,
      "notification-recipient-reference",
    );
    await assert.rejects(
      client.query("DELETE FROM public.platform_users WHERE id = $1", [
        platformUserId,
      ]),
      (error) => error?.code === "23514",
    );
    await client.query("ROLLBACK");
  } finally {
    await rollback(client);
    await client.end();
  }
});
