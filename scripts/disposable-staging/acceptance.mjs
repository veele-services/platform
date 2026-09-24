import { randomBytes, randomUUID } from "node:crypto";

import { createAcceptanceClient } from "./environment.mjs";
import { digest, requireThat } from "./contract.mjs";
import { copyTenantRoles } from "./bootstrap.mjs";

const BUCKET = "documents";

async function signIn(client, identity, expectedPortal, code) {
  const result = await client.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });
  requireThat(
    !result.error &&
      typeof result.data?.user?.id === "string" &&
      result.data.user.email?.toLowerCase() === identity.email &&
      result.data.user.app_metadata?.portal === expectedPortal &&
      (expectedPortal !== "platform-admin" ||
        result.data.user.app_metadata?.platform_role === "owner"),
    code,
    "ACTIVATED",
    true,
  );
  return result.data.user.id;
}

async function assertTenantBoundary(client, userId, ownTenant, otherTenant) {
  const result = await client
    .from("tenant_users")
    .select("tenant_id,user_id,status")
    .in("tenant_id", [ownTenant, otherTenant]);
  requireThat(
    !result.error &&
      Array.isArray(result.data) &&
      result.data.length === 1 &&
      result.data[0]?.tenant_id === ownTenant &&
      result.data[0]?.user_id === userId &&
      result.data[0]?.status === "active",
    "POST_REBUILD_RLS_ISOLATION_FAILED",
    "ACTIVATED",
    true,
  );
}

async function assertStorageRoundTrip({
  owner,
  otherTenant,
  anonymous,
  path,
  body,
}) {
  let uploaded = false;
  try {
    const upload = await owner.storage.from(BUCKET).upload(path, body, {
      contentType: "text/plain",
      upsert: false,
    });
    requireThat(
      !upload.error,
      "POST_REBUILD_STORAGE_UPLOAD_FAILED",
      "ACTIVATED",
      true,
    );
    uploaded = true;
    const download = await owner.storage.from(BUCKET).download(path);
    requireThat(
      !download.error && download.data != null,
      "POST_REBUILD_STORAGE_READ_FAILED",
      "ACTIVATED",
      true,
    );
    const downloaded = Buffer.from(await download.data.arrayBuffer());
    requireThat(
      downloaded.equals(body),
      "POST_REBUILD_STORAGE_READ_FAILED",
      "ACTIVATED",
      true,
    );
    const crossTenant = await otherTenant.storage.from(BUCKET).download(path);
    const unauthenticated = await anonymous.storage.from(BUCKET).download(path);
    requireThat(
      Boolean(crossTenant.error) && Boolean(unauthenticated.error),
      "POST_REBUILD_STORAGE_UNAUTHORIZED_ACCESS",
      "ACTIVATED",
      true,
    );
    const removed = await owner.storage.from(BUCKET).remove([path]);
    requireThat(
      !removed.error,
      "POST_REBUILD_STORAGE_DELETE_FAILED",
      "ACTIVATED",
      true,
    );
    uploaded = false;
    const after = await owner.storage.from(BUCKET).download(path);
    requireThat(
      Boolean(after.error),
      "POST_REBUILD_STORAGE_DELETE_FAILED",
      "ACTIVATED",
      true,
    );
  } finally {
    if (uploaded)
      await owner.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => {});
  }
}

function buildTemporaryFixtures({
  candidateSha,
  runId,
  attempt,
  randomUuid = randomUUID,
  randomSecret = randomBytes,
}) {
  const acceptanceRun = digest({ candidateSha, runId, attempt });
  const prefix = `fg-rebuild-${runId}-${attempt}`;
  const tenants = ["a", "b"].map((suffix) => ({
    id: randomUuid(),
    slug: `${prefix}-${suffix}`,
    name: `Acceptance ${suffix.toUpperCase()}`,
    managerEmail: `${prefix}-${suffix}@example.invalid`,
    managerPassword: randomSecret(32).toString("base64url"),
    managerName: `Acceptancebeheerder ${suffix.toUpperCase()}`,
  }));
  requireThat(
    tenants.length === 2 &&
      new Set(tenants.map(({ id }) => id)).size === 2 &&
      tenants.every(({ slug }) => slug.length <= 63),
    "ACCEPTANCE_FIXTURE_IDENTITY_INVALID",
    "ACTIVATED",
    true,
  );
  return { acceptanceRun, tenants };
}

async function createTemporaryDatabaseFixtures(client, tenants, userIds) {
  requireThat(
    tenants.length === 2 && userIds.length === 2,
    "ACCEPTANCE_FIXTURE_CARDINALITY_INVALID",
    "ACTIVATED",
    true,
  );
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    for (let index = 0; index < tenants.length; index += 1) {
      const tenant = tenants[index];
      await client.query(
        `
        INSERT INTO public.tenants(id,slug,name,status,is_active,plan_key)
        VALUES ($1,$2,$3,'active',true,'starter')
      `,
        [tenant.id, tenant.slug, tenant.name],
      );
      await client.query(
        `INSERT INTO public.organization_settings(tenant_id,naam) VALUES ($1,$2)`,
        [tenant.id, tenant.name],
      );
      await copyTenantRoles(client, tenant.id);
      await client.query(
        `
        INSERT INTO public.tenant_users(tenant_id,user_id,role,status)
        VALUES ($1,$2,'owner','active')
      `,
        [tenant.id, userIds[index]],
      );
      const membership = await client.query(
        `
        INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id)
        SELECT $1,$2,role_row.id
        FROM public.tenant_roles role_row
        WHERE role_row.tenant_id=$1
          AND role_row.name='Management'
          AND role_row.is_system
          AND NOT role_row.is_custom
      `,
        [tenant.id, userIds[index]],
      );
      requireThat(
        membership.rowCount === 1,
        "ACCEPTANCE_MANAGEMENT_ROLE_INVALID",
        "ACTIVATED",
        true,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function cleanupTemporaryDatabaseFixtures(client, tenantIds) {
  requireThat(
    tenantIds.length === 2 && new Set(tenantIds).size === 2,
    "ACCEPTANCE_FIXTURE_CARDINALITY_INVALID",
    "ACTIVATED",
    true,
  );
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query(
      "DELETE FROM public.tenant_user_roles WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_users WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.organization_settings WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query(
      "DELETE FROM public.tenant_roles WHERE tenant_id=ANY($1::uuid[])",
      [tenantIds],
    );
    await client.query("DELETE FROM public.tenants WHERE id=ANY($1::uuid[])", [
      tenantIds,
    ]);
    const remaining = await client.query(
      `
      SELECT
        (SELECT count(*)::int FROM public.tenants WHERE id=ANY($1::uuid[])) AS tenants,
        (SELECT count(*)::int FROM public.tenant_users WHERE tenant_id=ANY($1::uuid[])) AS tenant_users,
        (SELECT count(*)::int FROM public.tenant_user_roles WHERE tenant_id=ANY($1::uuid[])) AS tenant_user_roles,
        (SELECT count(*)::int FROM public.tenant_roles WHERE tenant_id=ANY($1::uuid[])) AS tenant_roles,
        (SELECT count(*)::int FROM public.organization_settings WHERE tenant_id=ANY($1::uuid[])) AS organization_settings
    `,
      [tenantIds],
    );
    requireThat(
      Object.values(remaining.rows[0] ?? {}).every((count) => count === 0),
      "ACCEPTANCE_DATABASE_CLEANUP_INCOMPLETE",
      "ACTIVATED",
      true,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function runPostRebuildAcceptance({
  env = process.env,
  bootstrap,
  candidateSha,
  runId,
  attempt,
  database,
  provider,
  createClient = createAcceptanceClient,
  randomUuid = randomUUID,
  randomSecret = randomBytes,
} = {}) {
  requireThat(
    Boolean(database && provider && bootstrap?.platform),
    "ACCEPTANCE_CONFIGURATION_INVALID",
    "ACTIVATED",
    true,
  );
  const fixtures = buildTemporaryFixtures({
    candidateSha,
    runId,
    attempt,
    randomUuid,
    randomSecret,
  });
  const tenantIds = fixtures.tenants.map(({ id }) => id);
  const path =
    `tenant/${tenantIds[0]}/disposable-rebuild/` +
    `${fixtures.acceptanceRun}.txt`;
  const userIds = [];
  let acceptanceError;
  let proof;
  try {
    for (const tenant of fixtures.tenants) {
      userIds.push(
        await provider.createIdentity({
          email: tenant.managerEmail,
          password: tenant.managerPassword,
          name: tenant.managerName,
          portal: "tenant-admin",
          role: "owner",
          acceptanceRun: fixtures.acceptanceRun,
        }),
      );
    }
    await createTemporaryDatabaseFixtures(database, fixtures.tenants, userIds);
    const platform = createClient(env);
    const tenantA = createClient(env);
    const tenantB = createClient(env);
    const anonymous = createClient(env);
    try {
      await signIn(
        platform,
        bootstrap.platform,
        "platform-admin",
        "POST_REBUILD_PLATFORM_LOGIN_FAILED",
      );
      const tenantAUser = await signIn(
        tenantA,
        {
          email: fixtures.tenants[0].managerEmail,
          password: fixtures.tenants[0].managerPassword,
        },
        "tenant-admin",
        "POST_REBUILD_MANAGER_LOGIN_FAILED",
      );
      const tenantBUser = await signIn(
        tenantB,
        {
          email: fixtures.tenants[1].managerEmail,
          password: fixtures.tenants[1].managerPassword,
        },
        "tenant-admin",
        "POST_REBUILD_MANAGER_LOGIN_FAILED",
      );
      await assertTenantBoundary(
        tenantA,
        tenantAUser,
        tenantIds[0],
        tenantIds[1],
      );
      await assertTenantBoundary(
        tenantB,
        tenantBUser,
        tenantIds[1],
        tenantIds[0],
      );
      await assertStorageRoundTrip({
        owner: tenantA,
        otherTenant: tenantB,
        anonymous,
        path,
        body: Buffer.from(
          `fieldgrid-disposable-rebuild:${candidateSha}`,
          "utf8",
        ),
      });
      proof = {
        platformLogin: true,
        portalMetadata: true,
        temporaryTenantCount: 2,
        temporaryManagerLogins: 2,
        reciprocalTenantIsolation: true,
        storageRoundTrip: true,
        unauthorizedStorageDenied: true,
      };
    } finally {
      await Promise.allSettled([
        platform.auth.signOut({ scope: "local" }),
        tenantA.auth.signOut({ scope: "local" }),
        tenantB.auth.signOut({ scope: "local" }),
      ]);
    }
  } catch (error) {
    acceptanceError = error;
  } finally {
    const cleanupErrors = [];
    for (const operation of [
      () => provider.removeStorageObject(BUCKET, path),
      () => cleanupTemporaryDatabaseFixtures(database, tenantIds),
      () => provider.deleteAcceptanceIdentities(fixtures.acceptanceRun),
    ]) {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    requireThat(
      cleanupErrors.length === 0,
      "POST_REBUILD_FIXTURE_CLEANUP_FAILED",
      "ACTIVATED",
      true,
    );
  }
  if (acceptanceError) throw acceptanceError;
  return { ...proof, fixtureCleanupComplete: true };
}
