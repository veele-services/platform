import { createAcceptanceClient } from "./environment.mjs";
import { requireThat } from "./contract.mjs";

const BUCKET = "documents";

async function signIn(client, identity, code) {
  const result = await client.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });
  requireThat(
    !result.error &&
      typeof result.data?.user?.id === "string" &&
      result.data.user.email?.toLowerCase() === identity.email,
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

export async function runPostRebuildAcceptance({
  env = process.env,
  bootstrap,
  candidateSha,
  createClient = createAcceptanceClient,
} = {}) {
  const platform = createClient(env);
  const tenantA = createClient(env);
  const tenantB = createClient(env);
  const anonymous = createClient(env);
  try {
    await signIn(
      platform,
      bootstrap.platform,
      "POST_REBUILD_PLATFORM_LOGIN_FAILED",
    );
    const tenantAUser = await signIn(
      tenantA,
      {
        email: bootstrap.tenants[0].managerEmail,
        password: bootstrap.tenants[0].managerPassword,
      },
      "POST_REBUILD_MANAGER_LOGIN_FAILED",
    );
    const tenantBUser = await signIn(
      tenantB,
      {
        email: bootstrap.tenants[1].managerEmail,
        password: bootstrap.tenants[1].managerPassword,
      },
      "POST_REBUILD_MANAGER_LOGIN_FAILED",
    );
    await assertTenantBoundary(
      tenantA,
      tenantAUser,
      bootstrap.tenants[0].id,
      bootstrap.tenants[1].id,
    );
    await assertTenantBoundary(
      tenantB,
      tenantBUser,
      bootstrap.tenants[1].id,
      bootstrap.tenants[0].id,
    );
    const path =
      `tenant/${bootstrap.tenants[0].id}/disposable-rebuild/` +
      `${candidateSha}.txt`;
    await assertStorageRoundTrip({
      owner: tenantA,
      otherTenant: tenantB,
      anonymous,
      path,
      body: Buffer.from(`fieldgrid-disposable-rebuild:${candidateSha}`, "utf8"),
    });
    return {
      platformLogin: true,
      managerLogins: 2,
      tenantIsolation: true,
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
}
