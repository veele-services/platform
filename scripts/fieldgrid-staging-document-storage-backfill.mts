#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  constants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "../lib/db/src/database-environment.ts";
import {
  getTenantBoundStoragePath,
  normalizeStoragePath,
} from "../lib/db/src/storage-paths.ts";
import {
  validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead,
  TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  type AuthorizationQueryable,
} from "./fieldgrid-staging-tenant-management-authorization.mts";

export const CONTRACT = "fieldgrid-staging-document-storage-backfill-v1";
export const PROJECT = "olyfmekyqozxrbrwwszu";
export const MAX_DOCUMENTS = 1000;
export const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_OPERATION_MS = 5 * 60 * 1000;
export const PRIVATE_BACKUP_DIRECTORY =
  "/var/www/veele/staging/shared/document-storage-backfill";
const root = fileURLToPath(new URL("../", import.meta.url));
const { validateDatabaseRootCertificateFile } = createRequire(import.meta.url)(
  "./fieldgrid-database-root-cert.mjs",
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
type Env = Record<string, string | undefined>;
type Mode = "diagnose" | "apply";
export type Options = { mode: "check" | Mode; expectedSha: string };
export type Document = {
  id: string;
  tenant_id: string | null;
  storage_path: string;
  size_bytes: number;
};
type Plan = {
  row: Document;
  destination: string;
  kind:
    | "canonical"
    | "legacyTenantRoot"
    | "unsupported"
    | "unsafe"
    | "unresolved";
};
type ObjectInfo = { exists: boolean; size: number | null };
type Fingerprint = { size: number; sha256: string };
export type Storage = {
  head(path: string): Promise<ObjectInfo>;
  fingerprint(path: string): Promise<Fingerprint>;
  copy(source: string, destination: string): Promise<void>;
};
export type RollbackEntry = {
  id: string;
  tenantId: string;
  oldPath: string;
  newPath: string;
  size: number;
  sha256: string;
};
const codes = new Set([
  "configuration_invalid",
  "source_invalid",
  "main_validation_failed",
  "lock_unavailable",
  "catalog_invalid",
  "row_limit",
  "byte_limit",
  "not_ready",
  "source_missing",
  "object_metadata_invalid",
  "storage_request_failed",
  "copy_failed",
  "content_mismatch",
  "row_changed",
  "commit_uncertain",
  "cleanup_failed",
  "time_limit",
  "operation_failed",
]);
class BackfillError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new BackfillError(code);
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const safeErrorCode = (error: unknown): string =>
  error instanceof BackfillError && codes.has(error.code)
    ? error.code
    : "operation_failed";

export function parseBackfillArgs(args: string[]): Options {
  let mode: Options["mode"] | undefined,
    expectedSha = "",
    seenSha = false;
  for (let i = 0; i < args.length; i++) {
    if (["--check", "--diagnose", "--apply"].includes(args[i]!)) {
      if (mode) fail("configuration_invalid");
      mode = args[i]!.slice(2) as Options["mode"];
    } else if (args[i] === "--expected-sha" && !seenSha) {
      seenSha = true;
      expectedSha = args[++i] ?? "";
    } else fail("configuration_invalid");
  }
  if (
    !mode ||
    ((mode !== "check" || seenSha) && !/^[a-f0-9]{40}$/u.test(expectedSha))
  )
    fail("configuration_invalid");
  return { mode, expectedSha };
}

export function validateBackfillConfig(options: Options, env: Env): void {
  if (options.mode === "check") return;
  if (
    env.FIELDGRID_DOCUMENT_STORAGE_BACKFILL_CONFIRMATION !== CONTRACT ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    /\s/u.test(env.SUPABASE_SERVICE_ROLE_KEY) ||
    env.SUPABASE_SERVICE_ROLE_KEY.length > 8192 ||
    (env.SUPABASE_URL && env.SUPABASE_URL !== `https://${PROJECT}.supabase.co`)
  )
    fail("configuration_invalid");
  const errors = validateTenantManagementAuthorizationConfig(options, {
    ...env,
    FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION:
      TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  });
  if (errors.length) fail("configuration_invalid");
  try {
    validateDatabaseRootCertificateFile(env.FIELDGRID_DATABASE_SSL_ROOT_CERT);
    databaseConnectionConfig("runtime", env);
    databaseConnectionConfig("migration", env);
  } catch {
    fail("configuration_invalid");
  }
}

function safePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= 1024 &&
    normalizeStoragePath(path) === path &&
    !/[\x00-\x1f\x7f%?#]/u.test(path)
  );
}

export function planDocument(row: Document): Plan {
  if (
    !uuid.test(row.id) ||
    !Number.isSafeInteger(row.size_bytes) ||
    row.size_bytes < 0
  )
    fail("catalog_invalid");
  if (!row.tenant_id || !uuid.test(row.tenant_id))
    return { row, kind: "unresolved", destination: "" };
  if (!safePath(row.storage_path))
    return { row, kind: "unsafe", destination: "" };
  const bound = getTenantBoundStoragePath(row.storage_path, row.tenant_id, {
    allowLegacyTenantRoot: true,
  });
  if (!bound) return { row, kind: "unsupported", destination: "" };
  if (row.storage_path.startsWith(`tenant/${row.tenant_id}/`))
    return { row, kind: "canonical", destination: row.storage_path };
  return {
    row,
    kind: "legacyTenantRoot",
    destination: `tenant/${row.tenant_id}/documents/backfill/${row.id}`,
  };
}

// Same authenticated REST routes used by the installed storage-js client:
// https://supabase.com/docs/reference/javascript/file-buckets-copy
// HEAD/GET /object/<bucket>/<key>; POST /object/copy without any overwrite option.
export function createStorageClient(
  key: string,
  request: typeof fetch = fetch,
): Storage {
  const base = `https://${PROJECT}.supabase.co/storage/v1`;
  const deadline = Date.now() + MAX_OPERATION_MS;
  const objectPath = (path: string) => {
    if (!safePath(path)) fail("object_metadata_invalid");
    return `/object/documents/${path.split("/").map(encodeURIComponent).join("/")}`;
  };
  async function send(
    path: string,
    method: string,
    body?: string,
  ): Promise<Response> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail("time_limit");
    try {
      return await request(`${base}${path}`, {
        method,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(30_000, remaining)),
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Cache-Control": "no-cache",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
      });
    } catch {
      return fail("storage_request_failed");
    }
  }
  function contentSize(response: Response): number | null {
    const text = response.headers.get("content-length");
    if (text === null) return null;
    if (!/^[0-9]+$/u.test(text) || !Number.isSafeInteger(Number(text)))
      fail("object_metadata_invalid");
    return Number(text);
  }
  async function missingInfo(path: string): Promise<boolean> {
    const response = await send(
      objectPath(path).replace("/object/", "/object/info/"),
      "GET",
    );
    if (!response.body) fail("storage_request_failed");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8192) fail("storage_request_failed");
        chunks.push(chunk.value);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        code?: string;
        statusCode?: number | string;
      };
      // https://supabase.com/docs/guides/storage/debugging/error-codes
      // Never infer absence from an arbitrary 400, authentication error or text.
      if (
        [400, 404].includes(response.status) &&
        (response.status === 404 || String(body.statusCode) === "404") &&
        ["NoSuchKey", "ObjectNotFound"].includes(body.code ?? "")
      )
        return true;
      return fail("storage_request_failed");
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error instanceof BackfillError
        ? error
        : new BackfillError("storage_request_failed");
    } finally {
      reader.releaseLock();
    }
  }
  return {
    async head(path) {
      const response = await send(objectPath(path), "HEAD");
      await response.body?.cancel();
      if (response.status === 404) return { exists: false, size: null };
      if (response.status === 400 && (await missingInfo(path)))
        return { exists: false, size: null };
      if (response.status !== 200) fail("storage_request_failed");
      return { exists: true, size: contentSize(response) };
    },
    async fingerprint(path) {
      const response = await send(objectPath(path), "GET");
      const length = contentSize(response);
      if (
        response.status !== 200 ||
        !response.body ||
        (length !== null && length > MAX_OBJECT_BYTES)
      ) {
        await response.body?.cancel();
        fail(
          response.status === 404
            ? "source_missing"
            : "object_metadata_invalid",
        );
      }
      const reader = response.body.getReader();
      const digest = createHash("sha256");
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_OBJECT_BYTES) fail("byte_limit");
          digest.update(chunk.value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error instanceof BackfillError
          ? error
          : new BackfillError("storage_request_failed");
      } finally {
        reader.releaseLock();
      }
      if (length !== null && length !== size) fail("content_mismatch");
      return { size, sha256: digest.digest("hex") };
    },
    async copy(source, destination) {
      objectPath(source);
      objectPath(destination);
      const response = await send(
        "/object/copy",
        "POST",
        JSON.stringify({
          bucketId: "documents",
          sourceKey: source,
          destinationKey: destination,
        }),
      );
      await response.body?.cancel();
      if (![200, 201].includes(response.status)) fail("copy_failed");
    },
  };
}

export const DOCUMENT_QUERY = `SELECT id::text, tenant_id::text, storage_path, size_bytes
  FROM public.documents ORDER BY id LIMIT ${MAX_DOCUMENTS + 1}`;
export const CAS_QUERY = `UPDATE public.documents SET storage_path=$4
  WHERE id=$1::uuid AND tenant_id=$2::uuid AND storage_path=$3 AND size_bytes=$5
  RETURNING id::text`;

export async function runDocumentStorageBackfill(
  client: AuthorizationQueryable,
  storage: Storage,
  mode: Mode,
  saveRollback: (
    entries: RollbackEntry[],
  ) => Promise<{ manifestId: string; sha256: string }>,
  reverifyMain: () => Promise<void> = async () => {},
) {
  const result = {
    ready: false,
    status: "failed",
    errorCode: null as string | null,
    counts: {
      documents: 0,
      canonical: 0,
      legacyTenantRoot: 0,
      unresolved: 0,
      unsafe: 0,
      unsupported: 0,
      sourceExists: 0,
      missingSource: 0,
      canonicalExists: 0,
      missingCanonical: 0,
      destinationExists: 0,
      destinationMissing: 0,
      metadataMismatch: 0,
      destinationCollision: 0,
      copied: 0,
      verified: 0,
      updated: 0 as number | null,
    },
    snapshotSha256: null as string | null,
    verificationSha256: null as string | null,
    rollbackManifest: null as { manifestId: string; sha256: string } | null,
  };
  let locked = false,
    transaction = false,
    committing = false;
  const deadline = Date.now() + MAX_OPERATION_MS;
  const assertDeadline = () => {
    if (Date.now() >= deadline) fail("time_limit");
  };
  try {
    if (!["diagnose", "apply"].includes(mode)) fail("configuration_invalid");
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
      [CONTRACT],
    );
    if (lock.rows[0]?.acquired !== true) fail("lock_unavailable");
    locked = true;
    await client.query(
      mode === "diagnose"
        ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
        : "BEGIN ISOLATION LEVEL REPEATABLE READ",
    );
    transaction = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='300s'");
    // Block document inserts/rebindings while proving paths and performing CAS.
    // No storage metadata table is ever written or locked by this utility.
    if (mode === "apply")
      await client.query(
        "LOCK TABLE public.documents IN SHARE ROW EXCLUSIVE MODE",
      );
    const rows = (await client.query(DOCUMENT_QUERY)).rows as Document[];
    if (rows.length > MAX_DOCUMENTS) fail("row_limit");
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      fail("catalog_invalid");
    result.counts.documents = rows.length;
    result.snapshotSha256 = hash(JSON.stringify(rows));
    const plans = rows.map(planDocument);
    if (rows.reduce((sum, row) => sum + row.size_bytes, 0) > MAX_TOTAL_BYTES)
      fail("byte_limit");
    const infos = new Map<string, ObjectInfo>();
    const head = async (path: string) => {
      assertDeadline();
      if (!infos.has(path)) infos.set(path, await storage.head(path));
      return infos.get(path)!;
    };
    for (const plan of plans) {
      result.counts[plan.kind]++;
      if (!safePath(plan.row.storage_path)) continue;
      const source = await head(plan.row.storage_path);
      if (plan.kind === "canonical")
        result.counts[source.exists ? "canonicalExists" : "missingCanonical"]++;
      else result.counts[source.exists ? "sourceExists" : "missingSource"]++;
      if (
        source.exists &&
        (source.size !== plan.row.size_bytes || source.size > MAX_OBJECT_BYTES)
      )
        result.counts.metadataMismatch++;
      if (plan.kind === "legacyTenantRoot") {
        const destination = await head(plan.destination);
        result.counts[
          destination.exists ? "destinationExists" : "destinationMissing"
        ]++;
        if (
          rows.some(
            (row) =>
              row.id !== plan.row.id && row.storage_path === plan.destination,
          )
        )
          result.counts.destinationCollision++;
      }
    }
    result.ready = [
      "unresolved",
      "unsafe",
      "unsupported",
      "missingSource",
      "missingCanonical",
      "metadataMismatch",
      "destinationCollision",
    ].every((key) => result.counts[key as keyof typeof result.counts] === 0);
    if (mode === "diagnose") {
      result.status = "diagnosed";
      return result;
    }
    if (!result.ready) {
      result.status = "blocked";
      result.errorCode = "not_ready";
      return result;
    }
    await reverifyMain();
    const entries: RollbackEntry[] = [];
    for (const plan of plans.filter(
      (plan) => plan.kind === "legacyTenantRoot",
    )) {
      assertDeadline();
      const source = await storage.fingerprint(plan.row.storage_path);
      if (
        source.size !== plan.row.size_bytes ||
        !/^[a-f0-9]{64}$/u.test(source.sha256)
      )
        fail("content_mismatch");
      if (!infos.get(plan.destination)!.exists) {
        await storage.copy(plan.row.storage_path, plan.destination);
        result.counts.copied++;
      }
      const destination = await storage.fingerprint(plan.destination);
      if (
        destination.size !== source.size ||
        destination.sha256 !== source.sha256
      )
        fail("content_mismatch");
      result.counts.verified++;
      entries.push({
        id: plan.row.id,
        tenantId: plan.row.tenant_id!,
        oldPath: plan.row.storage_path,
        newPath: plan.destination,
        size: source.size,
        sha256: source.sha256,
      });
    }
    if (entries.length) {
      result.verificationSha256 = hash(JSON.stringify(entries));
      result.rollbackManifest = await saveRollback(entries);
      if (
        !/^rollback-[a-zA-Z0-9]+$/u.test(result.rollbackManifest.manifestId) ||
        !/^[a-f0-9]{64}$/u.test(result.rollbackManifest.sha256)
      )
        fail("operation_failed");
      await reverifyMain();
      for (const entry of entries) {
        assertDeadline();
        const update = await client.query(CAS_QUERY, [
          entry.id,
          entry.tenantId,
          entry.oldPath,
          entry.newPath,
          entry.size,
        ]);
        if (
          update.rowCount !== 1 ||
          update.rows.length !== 1 ||
          update.rows[0]?.id !== entry.id
        )
          fail("row_changed");
      }
      committing = true;
      await client.query("COMMIT");
      transaction = false;
      committing = false;
      result.counts.updated = entries.length;
      result.status = "applied";
    } else result.status = "unchanged";
  } catch (error) {
    result.status = "failed";
    result.errorCode = committing ? "commit_uncertain" : safeErrorCode(error);
    if (committing) result.counts.updated = null;
  } finally {
    try {
      if (transaction) await client.query("ROLLBACK");
    } catch {
      if (!committing) {
        result.status = "failed";
        result.errorCode = "cleanup_failed";
      }
    }
    try {
      if (locked)
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS released",
          [CONTRACT],
        );
    } catch {
      if (!committing) {
        result.status = "failed";
        result.errorCode = "cleanup_failed";
      }
    }
  }
  return result;
}

function privateDirectory(path: string): void {
  if (!isAbsolute(path) || resolve(path) !== path)
    fail("configuration_invalid");
  for (const part of path
    .split("/")
    .filter(Boolean)
    .reduce<string[]>(
      (list, part) => [...list, `${list.at(-1) ?? ""}/${part}`],
      [],
    )) {
    const info = lstatSync(part);
    if (!info.isDirectory() || info.isSymbolicLink())
      fail("configuration_invalid");
  }
}

export async function savePrivateRollbackManifest(
  entries: RollbackEntry[],
  expectedSha: string,
  baseDirectory = PRIVATE_BACKUP_DIRECTORY,
) {
  // The CLI always uses the fixed durable directory, never RUNNER_TEMP or a
  // workflow input. A separate path argument exists only for local fixture tests.
  privateDirectory(dirname(baseDirectory));
  try {
    mkdirSync(baseDirectory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  privateDirectory(baseDirectory);
  const info = lstatSync(baseDirectory);
  if (info.uid !== process.geteuid?.() || (info.mode & 0o7777) !== 0o700)
    fail("configuration_invalid");
  const sharedFd = openSync(
    dirname(baseDirectory),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(sharedFd);
  } finally {
    closeSync(sharedFd);
  }
  const directory = mkdtempSync(join(baseDirectory, "rollback-"));
  const content =
    JSON.stringify(
      { contract: CONTRACT, expectedMainSha: expectedSha, entries },
      null,
      2,
    ) + "\n";
  const descriptor = openSync(
    join(directory, "document-storage.json"),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directoryFd = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(directoryFd);
  } finally {
    closeSync(directoryFd);
  }
  const parentFd = openSync(
    baseDirectory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parentFd);
  } finally {
    closeSync(parentFd);
  }
  return {
    manifestId: directory.slice(directory.lastIndexOf("/") + 1),
    sha256: hash(content),
  };
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  if (options.mode === "check") {
    console.log(`${CONTRACT}: static checks passed`);
    return;
  }
  const env = process.env;
  validateBackfillConfig(options, env);
  const startedAt = new Date().toISOString();
  let result: Awaited<ReturnType<typeof runDocumentStorageBackfill>> | null =
      null,
    errorCode: string | null = null;
  let client:
    | ({
        connect(): Promise<void>;
        end(): Promise<void>;
      } & AuthorizationQueryable)
    | undefined;
  try {
    if (
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() !== options.expectedSha ||
      execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
    )
      fail("source_invalid");
    const verify = async () => {
      try {
        await verifyTenantManagementAuthorizationMainHead(
          options.expectedSha,
          options.mode as Mode,
          env,
        );
      } catch {
        fail("main_validation_failed");
      }
    };
    await verify();
    const require = createRequire(
      new URL("../lib/db/package.json", import.meta.url),
    );
    const { Client } = require("pg");
    client = new Client({
      ...databaseConnectionConfig("migration", env),
      connectionTimeoutMillis: 15000,
    });
    await client!.connect();
    result = await runDocumentStorageBackfill(
      client!,
      createStorageClient(env.SUPABASE_SERVICE_ROLE_KEY!),
      options.mode,
      (entries) => savePrivateRollbackManifest(entries, options.expectedSha),
      verify,
    );
  } catch (error) {
    errorCode = safeErrorCode(error);
  } finally {
    try {
      await client?.end();
    } catch {
      errorCode ??= "cleanup_failed";
    }
    const directory = join(root, "artifacts", "document-storage-backfill");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    privateDirectory(directory);
    const evidence = {
      schemaVersion: 1,
      contract: CONTRACT,
      environment: "staging",
      operation: options.mode,
      expectedMainSha: options.expectedSha,
      status: errorCode ? "failed" : (result?.status ?? "failed"),
      errorCode: errorCode ?? result?.errorCode ?? null,
      result,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    const file = join(
      directory,
      `${options.mode}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}.json`,
    );
    const descriptor = openSync(
      file,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(descriptor, JSON.stringify(evidence, null, 2) + "\n");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  if (errorCode || !result || ["failed", "blocked"].includes(result.status))
    fail(errorCode ?? result?.errorCode ?? "operation_failed");
  console.log(`${CONTRACT}: ${result.status}`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(`${CONTRACT}: ${safeErrorCode(error)}`);
    process.exitCode = 1;
  });
}
