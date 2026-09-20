import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SUPABASE_ROOT_2021_CA_PEM } from "../fixtures/fieldgrid-supabase-root-2021-ca.mjs";
import {
  CONTRACT,
  PROJECT,
  MAX_DOCUMENTS,
  MAX_OBJECT_BYTES,
  PRIVATE_BACKUP_DIRECTORY,
  DOCUMENT_QUERY,
  CAS_QUERY,
  createStorageClient,
  parseBackfillArgs,
  planDocument,
  runDocumentStorageBackfill,
  safeErrorCode,
  savePrivateRollbackManifest,
  validateBackfillConfig,
  type Document,
  type RollbackEntry,
  type Storage,
} from "../../scripts/fieldgrid-staging-document-storage-backfill.mts";
import type { AuthorizationQueryable } from "../../scripts/fieldgrid-staging-tenant-management-authorization.mts";

const sha = "a".repeat(40);
const tenant = "11111111-1111-4111-8111-111111111111";
const otherTenant = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const content = Buffer.from("synthetic document fixture");
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const document = (overrides: Partial<Document> = {}): Document => ({
  id,
  tenant_id: tenant,
  storage_path: `${tenant}/documents/original.pdf`,
  size_bytes: content.length,
  ...overrides,
});
const destination = (row: Document) =>
  `tenant/${row.tenant_id}/documents/backfill/${row.id}`;

function fixture(initial: Document[] = [document()]) {
  let committed = structuredClone(initial),
    pending = structuredClone(initial);
  const events: string[] = [];
  const objects = new Map<string, Buffer>(
    initial.map((row) => [row.storage_path, Buffer.from(content)]),
  );
  const faults = {
    casAt: 0,
    commit: false,
    copy: false,
    corruptCopy: false,
    mainAt: 0,
    manifest: false,
    lock: false,
  };
  let writes = 0,
    mainChecks = 0;
  let manifest: RollbackEntry[] | null = null;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes("pg_try_advisory_lock")) {
        events.push("lock");
        return { rows: [{ acquired: !faults.lock }], rowCount: 1 };
      }
      if (sql.includes("pg_advisory_unlock")) {
        events.push("unlock");
        return { rows: [{ released: true }], rowCount: 1 };
      }
      if (sql.startsWith("BEGIN")) {
        events.push(sql.includes("READ ONLY") ? "begin-read" : "begin-write");
        pending = structuredClone(committed);
      } else if (sql.startsWith("SET LOCAL")) {
        /* transaction timeout configuration */
      } else if (sql.startsWith("LOCK TABLE")) events.push("table-lock");
      else if (sql === DOCUMENT_QUERY) {
        events.push("select");
        return { rows: structuredClone(pending), rowCount: pending.length };
      } else if (sql === CAS_QUERY) {
        events.push("cas");
        writes++;
        const [rowId, tenantId, oldPath, newPath, size] = values;
        const row = pending.find(
          (row) =>
            row.id === rowId &&
            row.tenant_id === tenantId &&
            row.storage_path === oldPath &&
            row.size_bytes === size,
        );
        if (faults.casAt === writes || !row) return { rows: [], rowCount: 0 };
        row.storage_path = String(newPath);
        return { rows: [{ id: row.id }], rowCount: 1 };
      } else if (sql === "COMMIT") {
        events.push("commit");
        if (faults.commit)
          throw new Error("private database connection diagnostic");
        committed = structuredClone(pending);
      } else if (sql === "ROLLBACK") {
        events.push("rollback");
        pending = structuredClone(committed);
      } else throw new Error("unexpected fixture query");
      return { rows: [], rowCount: 0 };
    },
  } as AuthorizationQueryable;
  const storage: Storage = {
    async head(path) {
      events.push("head");
      const bytes = objects.get(path);
      return { exists: bytes !== undefined, size: bytes?.length ?? null };
    },
    async fingerprint(path) {
      events.push("fingerprint");
      const bytes = objects.get(path);
      if (!bytes) throw new Error("private object identifier");
      return { size: bytes.length, sha256: digest(bytes) };
    },
    async copy(source, target) {
      events.push("copy");
      if (faults.copy || objects.has(target) || !objects.has(source))
        throw new Error("private storage diagnostic");
      objects.set(
        target,
        faults.corruptCopy
          ? Buffer.alloc(content.length, 120)
          : Buffer.from(objects.get(source)!),
      );
    },
  };
  const save = async (entries: RollbackEntry[]) => {
    events.push("manifest");
    if (faults.manifest) throw new Error("private filesystem diagnostic");
    manifest = structuredClone(entries);
    return {
      manifestId: "rollback-fixture1",
      sha256: digest(JSON.stringify(entries)),
    };
  };
  const verify = async () => {
    events.push("main");
    mainChecks++;
    if (faults.mainAt === mainChecks)
      throw new Error("private GitHub diagnostic");
  };
  return {
    client,
    storage,
    objects,
    events,
    faults,
    save,
    verify,
    rows: () => committed,
    manifest: () => manifest,
    run: (mode: "diagnose" | "apply") =>
      runDocumentStorageBackfill(client, storage, mode, save, verify),
  };
}

test("CLI accepts only bounded operations and an exact reviewed SHA", () => {
  assert.deepEqual(parseBackfillArgs(["--check"]), {
    mode: "check",
    expectedSha: "",
  });
  for (const mode of ["apply", "diagnose"] as const)
    assert.deepEqual(parseBackfillArgs([`--${mode}`, "--expected-sha", sha]), {
      mode,
      expectedSha: sha,
    });
  for (const args of [
    [],
    ["--apply"],
    ["--apply", "--diagnose"],
    ["--check", "--bucket", "other"],
    ["--apply", "--expected-sha", "HEAD"],
    ["--apply", "--expected-sha", sha, "--expected-sha", sha],
  ]) {
    assert.throws(() => parseBackfillArgs(args), /configuration_invalid/u);
  }
});

test("live configuration rejects foreign projects, environments, credentials and weakened TLS before I/O", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldgrid-storage-config-"));
  const cert = join(directory, "root.crt");
  writeFileSync(cert, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
  const runtimePassword = randomBytes(24).toString("hex"),
    migrationPassword = randomBytes(24).toString("hex");
  const env = {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_NAME: "main",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_RUN_ID: "1234",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: sha,
    EXPECTED_SUPABASE_PROJECT_REF: PROJECT,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT}.supabase.co`,
    DATABASE_URL: `postgresql://fieldgrid_runtime_app:${runtimePassword}@db.${PROJECT}.supabase.co:5432/postgres`,
    FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://postgres:${migrationPassword}@db.${PROJECT}.supabase.co:5432/postgres`,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_DOCUMENT_STORAGE_BACKFILL_CONFIRMATION: CONTRACT,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: cert,
    DB_SSL: "true",
    DB_SSL_REJECT_UNAUTHORIZED: "true",
    PGSSLMODE: "verify-full",
    SUPABASE_SERVICE_ROLE_KEY: randomBytes(32).toString("hex"),
  };
  try {
    for (const mode of ["diagnose", "apply"] as const)
      assert.doesNotThrow(() =>
        validateBackfillConfig({ mode, expectedSha: sha }, env),
      );
    for (const [key, value] of [
      ["APP_ENV", "production"],
      ["TARGET_ENVIRONMENT", "production"],
      ["GITHUB_ACTIONS", "false"],
      ["GITHUB_REF", "refs/heads/staging"],
      ["GITHUB_SHA", "b".repeat(40)],
      ["GITHUB_RUN_ID", "../../private"],
      ["EXPECTED_SUPABASE_PROJECT_REF", "ckdtiuemeygrnujjibnw"],
      ["NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid"],
      ["SUPABASE_URL", "https://example.invalid"],
      ["SUPABASE_SERVICE_ROLE_KEY", ""],
      ["FIELDGRID_DOCUMENT_STORAGE_BACKFILL_CONFIRMATION", "wrong"],
      ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
      ["DB_SSL", "false"],
      ["DB_SSL_REJECT_UNAUTHORIZED", "false"],
      ["PGSSLMODE", "require"],
      ["FIELDGRID_DATABASE_SSL_ROOT_CERT", "/missing/root.crt"],
      ["DATABASE_URL", env.DATABASE_URL + "?sslmode=disable"],
      [
        "FIELDGRID_MIGRATION_DATABASE_URL",
        env.FIELDGRID_MIGRATION_DATABASE_URL.replace(":5432/", ":6543/"),
      ],
      ["FIELDGRID_MIGRATION_DATABASE_URL", env.DATABASE_URL],
      [
        "FIELDGRID_MIGRATION_DATABASE_URL",
        env.FIELDGRID_MIGRATION_DATABASE_URL.replace(
          migrationPassword,
          runtimePassword,
        ),
      ],
      [
        "DATABASE_URL",
        env.DATABASE_URL.replace(PROJECT, "ckdtiuemeygrnujjibnw"),
      ],
    ])
      assert.throws(
        () =>
          validateBackfillConfig(
            { mode: "apply", expectedSha: sha },
            { ...env, [key!]: value },
          ),
        /configuration_invalid/u,
        key,
      );
    chmodSync(cert, 0o640);
    assert.throws(
      () => validateBackfillConfig({ mode: "apply", expectedSha: sha }, env),
      /configuration_invalid/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("path planning binds each legacy source and canonical destination to the recorded tenant", () => {
  assert.equal(planDocument(document()).destination, destination(document()));
  assert.equal(
    planDocument(document({ storage_path: destination(document()) })).kind,
    "canonical",
  );
  for (const storage_path of [
    `${otherTenant}/file`,
    `tenant/${otherTenant}/documents/file`,
    "general/file",
    "tenants/anything/file",
  ])
    assert.equal(planDocument(document({ storage_path })).kind, "unsupported");
  for (const storage_path of [
    `/${tenant}/file`,
    `${tenant}/../file`,
    `${tenant}/%2e%2e/file`,
    `${tenant}/file?token=private`,
    `${tenant}/file#secret`,
    `${tenant}/file\n`,
    `${tenant}/\\file`,
    `${tenant}//file`,
  ])
    assert.equal(planDocument(document({ storage_path })).kind, "unsafe");
  assert.equal(planDocument(document({ tenant_id: null })).kind, "unresolved");
  assert.throws(
    () => planDocument(document({ id: "invalid" })),
    /catalog_invalid/u,
  );
  assert.throws(
    () => planDocument(document({ size_bytes: -1 })),
    /catalog_invalid/u,
  );
});

test("diagnose counts missing sources and canonical objects without reading contents or mutating anything", async () => {
  const rows = [
    document(),
    document({
      id: otherId,
      storage_path: `tenant/${tenant}/documents/missing`,
    }),
  ];
  const f = fixture(rows);
  f.objects.clear();
  const result = await f.run("diagnose");
  assert.equal(result.status, "diagnosed");
  assert.equal(result.ready, false);
  assert.equal(result.counts.missingSource, 1);
  assert.equal(result.counts.missingCanonical, 1);
  assert.equal(result.counts.destinationMissing, 1);
  assert.equal(f.events.includes("begin-read"), true);
  assert.equal(
    f.events.some((event) =>
      [
        "copy",
        "fingerprint",
        "cas",
        "manifest",
        "commit",
        "table-lock",
      ].includes(event),
    ),
    false,
  );
  assert.deepEqual(f.rows(), rows);
  assert.equal(f.manifest(), null);
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${tenant}|${id}|original|missing$|private`, "u"),
  );
});

test("apply proves both byte streams, saves mapping before CAS, retains original objects and repeats unchanged", async () => {
  const f = fixture();
  const original = document();
  const result = await f.run("apply");
  assert.equal(result.status, "applied");
  assert.equal(result.counts.updated, 1);
  assert.equal(result.counts.copied, 1);
  assert.equal(result.counts.verified, 1);
  assert.deepEqual(f.rows(), [
    { ...original, storage_path: destination(original) },
  ]);
  assert.deepEqual(f.objects.get(original.storage_path), content);
  assert.deepEqual(f.objects.get(destination(original)), content);
  assert.deepEqual(f.manifest(), [
    {
      id,
      tenantId: tenant,
      oldPath: original.storage_path,
      newPath: destination(original),
      size: content.length,
      sha256: digest(content),
    },
  ]);
  assert.ok(f.events.indexOf("table-lock") < f.events.indexOf("select"));
  assert.ok(f.events.indexOf("copy") < f.events.indexOf("manifest"));
  assert.ok(f.events.indexOf("manifest") < f.events.indexOf("cas"));
  assert.equal(f.events.filter((event) => event === "main").length, 2);
  assert.ok(f.events.indexOf("cas") < f.events.indexOf("commit"));
  assert.equal(f.events.at(-1), "unlock");
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${tenant}|${id}|original.pdf`, "u"),
  );
  f.events.length = 0;
  const repeated = await f.run("apply");
  assert.equal(repeated.status, "unchanged");
  assert.equal(repeated.counts.updated, 0);
  assert.equal(
    f.events.some((event) =>
      ["copy", "fingerprint", "cas", "manifest", "commit"].includes(event),
    ),
    false,
  );
});

test("an identical pre-existing copy resumes safely but a same-size content collision never changes rows", async () => {
  for (const identical of [true, false]) {
    const f = fixture();
    f.objects.set(
      destination(document()),
      identical ? Buffer.from(content) : Buffer.alloc(content.length, 120),
    );
    const result = await f.run("apply");
    assert.equal(result.status, identical ? "applied" : "failed");
    assert.equal(result.counts.copied, 0);
    assert.equal(f.events.includes("copy"), false);
    if (!identical) {
      assert.equal(result.errorCode, "content_mismatch");
      assert.deepEqual(f.rows(), [document()]);
      assert.equal(f.events.includes("cas"), false);
    }
  }
});

test("dangling sources, unsafe paths, unresolved tenants and references owned by another row block all writes", async () => {
  for (const condition of [
    "missing",
    "canonical-missing",
    "unsafe",
    "tenant",
    "collision",
    "metadata",
  ] as const) {
    const first =
      condition === "canonical-missing"
        ? document({ storage_path: destination(document()) })
        : document();
    if (condition === "unsafe") first.storage_path = `${tenant}/../private`;
    if (condition === "tenant") first.tenant_id = null;
    const f = fixture(
      condition === "collision"
        ? [first, document({ id: otherId, storage_path: destination(first) })]
        : [first],
    );
    if (condition === "missing" || condition === "canonical-missing")
      f.objects.clear();
    if (condition === "metadata")
      f.objects.set(first.storage_path, Buffer.from("wrong size"));
    const result = await f.run("apply");
    assert.equal(result.status, "blocked", condition);
    assert.equal(result.errorCode, "not_ready", condition);
    assert.equal(
      f.events.some((event) =>
        ["copy", "cas", "manifest", "commit"].includes(event),
      ),
      false,
      condition,
    );
  }
});

test("a changed second CAS rolls back all references and retains verified copies for a retry", async () => {
  const rows = [
    document(),
    document({ id: otherId, storage_path: `${tenant}/documents/second.pdf` }),
  ];
  const f = fixture(rows);
  f.faults.casAt = 2;
  const result = await f.run("apply");
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "row_changed");
  assert.equal(result.counts.updated, 0);
  assert.deepEqual(f.rows(), rows);
  assert.equal(f.events.includes("commit"), false);
  assert.equal(f.objects.size, 4);
  assert.equal(f.manifest()?.length, 2);
  f.faults.casAt = 0;
  const retry = await f.run("apply");
  assert.equal(retry.status, "applied");
  assert.equal(retry.counts.copied, 0);
  assert.equal(retry.counts.updated, 2);
});

test("copy errors, corrupted bytes, missing durable manifests and moved main fail before a database write", async () => {
  for (const fault of ["copy", "corruptCopy", "manifest", "mainAt"] as const) {
    const f = fixture();
    if (fault === "mainAt") f.faults.mainAt = 2;
    else f.faults[fault] = true;
    const result = await f.run("apply");
    assert.equal(result.status, "failed", fault);
    assert.equal(result.counts.updated, 0, fault);
    assert.deepEqual(f.rows(), [document()], fault);
    assert.equal(f.events.includes("cas"), false, fault);
    assert.equal(f.events.at(-2), "rollback", fault);
    assert.equal(f.events.at(-1), "unlock", fault);
    assert.doesNotMatch(JSON.stringify(result), /private|diagnostic/u);
  }
});

test("unknown commit outcome is explicitly uncertain and never reported as zero or success", async () => {
  const f = fixture();
  f.faults.commit = true;
  const result = await f.run("apply");
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "commit_uncertain");
  assert.equal(result.counts.updated, null);
  assert.ok(result.rollbackManifest);
  assert.equal(f.objects.size, 2);
});

test("catalog and advisory-lock bounds reject before any object request", async () => {
  for (const kind of ["lock", "rows", "bytes", "duplicate"] as const) {
    const rows =
      kind === "rows"
        ? Array.from({ length: MAX_DOCUMENTS + 1 }, () => document())
        : kind === "duplicate"
          ? [document(), document()]
          : [
              document({
                size_bytes:
                  kind === "bytes" ? 201 * 1024 * 1024 : content.length,
              }),
            ];
    const f = fixture(rows);
    f.faults.lock = kind === "lock";
    const result = await f.run("apply");
    assert.equal(result.status, "failed");
    assert.equal(
      result.errorCode,
      {
        lock: "lock_unavailable",
        rows: "row_limit",
        bytes: "byte_limit",
        duplicate: "catalog_invalid",
      }[kind],
    );
    assert.equal(f.events.includes("head"), false);
  }
});

test("storage transport fixes staging origin and bucket, disables redirects and has no overwrite operation", async () => {
  const key = randomBytes(32).toString("hex"),
    calls: Array<{ url: string; options: RequestInit }> = [];
  const request = (async (
    input: string | URL | Request,
    options: RequestInit,
  ) => {
    calls.push({ url: String(input), options });
    if (options.method === "HEAD")
      return new Response(null, {
        status: 200,
        headers: { "Content-Length": String(content.length) },
      });
    if (options.method === "GET")
      return new Response(content, {
        status: 200,
        headers: { "Content-Length": String(content.length) },
      });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const storage = createStorageClient(key, request),
    row = document();
  assert.deepEqual(await storage.head(row.storage_path), {
    exists: true,
    size: content.length,
  });
  assert.deepEqual(await storage.fingerprint(row.storage_path), {
    size: content.length,
    sha256: digest(content),
  });
  await storage.copy(row.storage_path, destination(row));
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, `https://${PROJECT}.supabase.co`);
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.cache, "no-store");
    assert.ok(call.options.signal);
    const headers = new Headers(call.options.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${key}`);
    assert.equal(headers.get("apikey"), key);
  }
  assert.equal(
    calls.at(-1)?.url,
    `https://${PROJECT}.supabase.co/storage/v1/object/copy`,
  );
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.options.body)), {
    bucketId: "documents",
    sourceKey: row.storage_path,
    destinationKey: destination(row),
  });
  await assert.rejects(
    storage.head("https://foreign.invalid/private"),
    /object_metadata_invalid/u,
  );
  assert.equal(calls.length, 3);
});

test("HEAD400 fallback accepts only bounded, precise missing-object info and rejects authentication and bucket errors", async () => {
  for (const candidate of [
    { status: 404, body: { code: "NoSuchKey" }, missing: true },
    {
      status: 400,
      body: { code: "ObjectNotFound", statusCode: "404" },
      missing: true,
    },
    { status: 400, body: { code: "NoSuchKey" }, missing: false },
    { status: 404, body: { code: "NoSuchBucket" }, missing: false },
    {
      status: 401,
      body: { code: "InvalidJWT", statusCode: "404" },
      missing: false,
    },
    {
      status: 400,
      body: { message: "private secret missing object", statusCode: 404 },
      missing: false,
    },
    {
      status: 200,
      body: { code: "NoSuchKey", statusCode: 404 },
      missing: false,
    },
  ]) {
    const calls: string[] = [];
    const request = (async (
      input: string | URL | Request,
      options: RequestInit,
    ) => {
      calls.push(String(input));
      return options.method === "HEAD"
        ? new Response(null, { status: 400 })
        : Response.json(candidate.body, { status: candidate.status });
    }) as typeof fetch;
    const storage = createStorageClient("synthetic-key", request);
    if (candidate.missing)
      assert.deepEqual(await storage.head(document().storage_path), {
        exists: false,
        size: null,
      });
    else
      await assert.rejects(
        storage.head(document().storage_path),
        (error) =>
          safeErrorCode(error) === "storage_request_failed" &&
          !String(error).includes("private"),
      );
    assert.equal(
      calls[1],
      `https://${PROJECT}.supabase.co/storage/v1/object/info/documents/${document().storage_path}`,
    );
  }
  const oversized = createStorageClient("synthetic-key", (async (
    _input,
    options,
  ) =>
    options?.method === "HEAD"
      ? new Response(null, { status: 400 })
      : new Response("x".repeat(8193), { status: 404 })) as typeof fetch);
  await assert.rejects(
    oversized.head(document().storage_path),
    /storage_request_failed/u,
  );
});

test("object streams enforce size and digest boundaries and failed copies never expose response bodies", async () => {
  const make = (response: () => Response) =>
    createStorageClient("synthetic-key", (async () =>
      response()) as typeof fetch);
  await assert.rejects(
    make(
      () =>
        new Response(null, {
          status: 200,
          headers: { "Content-Length": String(MAX_OBJECT_BYTES + 1) },
        }),
    ).fingerprint(document().storage_path),
    /object_metadata_invalid/u,
  );
  await assert.rejects(
    make(
      () =>
        new Response(content, {
          headers: { "Content-Length": String(content.length + 1) },
        }),
    ).fingerprint(document().storage_path),
    /content_mismatch/u,
  );
  let cancelled = false;
  const streaming = make(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MAX_OBJECT_BYTES));
            controller.enqueue(new Uint8Array(1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    streaming.fingerprint(document().storage_path),
    /byte_limit/u,
  );
  assert.equal(cancelled, true);
  await assert.rejects(
    make(
      () => new Response("private storage credentials", { status: 409 }),
    ).copy(document().storage_path, destination(document())),
    (error) =>
      safeErrorCode(error) === "copy_failed" &&
      !String(error).includes("private"),
  );
  assert.equal(
    safeErrorCode(new Error("private raw diagnostic")),
    "operation_failed",
  );
});

test("rollback mappings persist under an owner-only directory and expose only an opaque ID and content hash", async () => {
  assert.equal(
    PRIVATE_BACKUP_DIRECTORY,
    "/var/www/veele/staging/shared/document-storage-backfill",
  );
  const temporary = mkdtempSync(join(tmpdir(), "fieldgrid-storage-manifest-")),
    base = join(temporary, "private");
  const entries: RollbackEntry[] = [
    {
      id,
      tenantId: tenant,
      oldPath: document().storage_path,
      newPath: destination(document()),
      size: content.length,
      sha256: digest(content),
    },
  ];
  try {
    const result = await savePrivateRollbackManifest(entries, sha, base);
    assert.deepEqual(Object.keys(result).sort(), ["manifestId", "sha256"]);
    assert.match(result.manifestId, /^rollback-[a-zA-Z0-9]+$/u);
    assert.equal(lstatSync(base).mode & 0o7777, 0o700);
    const directory = join(base, result.manifestId),
      file = join(directory, "document-storage.json");
    assert.equal(lstatSync(directory).mode & 0o7777, 0o700);
    assert.equal(lstatSync(file).mode & 0o7777, 0o600);
    const bytes = readFileSync(file);
    assert.equal(digest(bytes), result.sha256);
    assert.deepEqual(JSON.parse(bytes.toString()), {
      contract: CONTRACT,
      expectedMainSha: sha,
      entries,
    });
    const second = await savePrivateRollbackManifest(entries, sha, base);
    assert.notEqual(second.manifestId, result.manifestId);
    assert.equal(readdirSync(base).length, 2);
    chmodSync(base, 0o755);
    await assert.rejects(
      savePrivateRollbackManifest(entries, sha, base),
      /configuration_invalid/u,
    );
    mkdirSync(join(temporary, "real"), { mode: 0o700 });
    symlinkSync(join(temporary, "real"), join(temporary, "alias"));
    await assert.rejects(
      savePrivateRollbackManifest(entries, sha, join(temporary, "alias")),
      /configuration_invalid/u,
    );
    await assert.rejects(
      savePrivateRollbackManifest(
        entries,
        sha,
        join(temporary, "alias", "nested"),
      ),
      /configuration_invalid/u,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
