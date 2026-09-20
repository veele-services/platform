#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseTenantManagementAuthorizationArgs, validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead, TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  type AuthorizationQueryable } from "./fieldgrid-staging-tenant-management-authorization.mts";
import { loadHostedPolicyCompatibilitySource, runHostedPolicyCompatibility } from "./fieldgrid-hosted-policy-compatibility.mts";

export const CATALOG_NORMALIZATION_VERSION = "fieldgrid-staging-catalog-normalization-v1";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function safeNormalizationError(error: unknown): string {
  const code = error instanceof Error && /^hosted_policy_[a-z_]+$/u.test(error.message)
    ? error.message : "hosted_policy_operation_failed";
  return `${CATALOG_NORMALIZATION_VERSION}: ${code}`;
}
export async function runCatalogNormalization(queryable: AuthorizationQueryable, operation: "diagnose" | "apply") {
  const result = await runHostedPolicyCompatibility(queryable, operation);
  if (operation === "apply" && !result.changed && !result.replacementRecorded) {
    throw new Error("hosted_policy_normalization_not_ready");
  }
  return result;
}
async function main() {
  const options = parseTenantManagementAuthorizationArgs(process.argv.slice(2));
  if (options.mode === "check") {
    loadHostedPolicyCompatibilitySource();
    console.log(`${CATALOG_NORMALIZATION_VERSION}: source verified`);
    return;
  }
  if (process.env.FIELDGRID_CATALOG_NORMALIZATION_CONFIRMATION !== CATALOG_NORMALIZATION_VERSION ||
      validateTenantManagementAuthorizationConfig(options, {
        ...process.env, FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION: TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
      }).length) throw new Error("hosted_policy_configuration_invalid");
  await verifyTenantManagementAuthorizationMainHead(options.expectedSha, options.mode);
  type Database = { pool: { connect(): Promise<AuthorizationQueryable & { release(destroy?: boolean): void }>; end(): Promise<void> } };
  const database = await import(pathToFileURL(join(root, "lib/db/src/connection.ts")).href) as Database;
  let client: Awaited<ReturnType<Database["pool"]["connect"]>> | undefined;
  let result: Awaited<ReturnType<typeof runCatalogNormalization>> | null = null;
  let errorCode: string | null = null;
  try { client = await database.pool.connect(); result = await runCatalogNormalization(client, options.mode); }
  catch (error) { errorCode = safeNormalizationError(error); }
  finally {
    try { client?.release(true); await database.pool.end(); }
    catch { errorCode ??= safeNormalizationError(new Error("hosted_policy_cleanup_failed")); }
    const directory = join(root, "artifacts", "catalog-normalization");
    await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
    const output = join(directory, `${options.mode}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`);
    await writeFile(output, JSON.stringify({ version: CATALOG_NORMALIZATION_VERSION, environment: "staging",
      expectedMainSha: options.expectedSha, status: errorCode ? "failed" : "passed", result, errorCode,
      completedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
    await chmod(output, 0o600);
  }
  if (errorCode) { console.error(errorCode); process.exitCode = 1; return; }
  console.log(`${CATALOG_NORMALIZATION_VERSION}: ${result?.replacementRecorded ? "normalized" : "diagnosed"}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(safeNormalizationError(error)); process.exitCode = 1; });
}
