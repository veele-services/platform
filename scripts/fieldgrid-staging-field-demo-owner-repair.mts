#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateInternalAuthPassword } from "../lib/db/src/credential-recovery.ts";
import {
  FIELD_DEMO_OWNER_EMAIL,
  fieldDemoOwnerFailureReason,
  type FieldDemoOwnerCandidate,
  type FieldDemoOwnerFailureReason,
} from "./fieldgrid-website-staging-proof-state.mts";

export const FIELD_DEMO_OWNER_REPAIR_VERSION =
  "fieldgrid-staging-field-demo-owner-repair-v1";
export const FIELD_DEMO_OWNER_REPAIR_CONFIRMATION =
  "fieldgrid-staging-field-demo-owner-repair-v1";
export const FIELD_DEMO_OWNER_REPAIR_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const FIELD_DEMO_OWNER_REPAIR_SUPABASE_URL =
  "https://olyfmekyqozxrbrwwszu.supabase.co";

const OWNER_REPAIR_LOCK_KEY = "fieldgrid:staging:field-demo-owner-repair:v1";
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const RUN_NUMBER_PATTERN = /^[1-9][0-9]{0,19}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POSTCHECK_ATTEMPTS = 20;
const POSTCHECK_DELAY_MS = 500;
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type RepairMode = "check" | "create-missing";

type RepairOptions = {
  mode: RepairMode;
  expectedSha: string;
};

type RepairEnvironment = Record<string, string | undefined> & {
  APP_ENV?: string;
  TARGET_ENVIRONMENT?: string;
  GITHUB_ACTIONS?: string;
  GITHUB_EVENT_NAME?: string;
  GITHUB_REF?: string;
  GITHUB_REF_NAME?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_RUN_ATTEMPT?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_SHA?: string;
  EXPECTED_SUPABASE_PROJECT_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DATABASE_URL?: string;
  FIELDGRID_MIGRATION_DATABASE_URL?: string;
  FIELDGRID_DATABASE_CONNECTION_PURPOSE?: string;
  FIELDGRID_FIELD_DEMO_OWNER_REPAIR_CONFIRMATION?: string;
};

export type FieldDemoOwnerRepairCandidate = FieldDemoOwnerCandidate & {
  repair_contract: string | null;
  repair_environment: string | null;
  portal: string | null;
  activation_pending: boolean;
  profile_name_required: boolean;
  email_identity_count: number;
  platform_user_count: number;
};

export type FieldDemoOwnerCreateOutcome = "accepted" | "rejected" | "uncertain";

export type FieldDemoOwnerRepairResult =
  | "already-valid"
  | "created-and-verified";

type FieldDemoOwnerRepairErrorCode =
  | "field_demo_owner_repair_configuration_invalid"
  | "field_demo_owner_repair_lock_unavailable"
  | "field_demo_owner_repair_precondition_invalid"
  | "field_demo_owner_repair_create_rejected"
  | "field_demo_owner_repair_create_outcome_uncertain"
  | "field_demo_owner_repair_postcondition_invalid"
  | "field_demo_owner_repair_failed";

type FieldDemoOwnerRepairFailureStage =
  | "configuration"
  | "database_bootstrap"
  | "database_lock"
  | "owner_precondition"
  | "auth_create"
  | "owner_postcondition"
  | null;

class FieldDemoOwnerRepairError extends Error {
  readonly code: FieldDemoOwnerRepairErrorCode;
  readonly failureStage: FieldDemoOwnerRepairFailureStage;
  readonly failureReason: FieldDemoOwnerFailureReason | null;

  constructor(
    code: FieldDemoOwnerRepairErrorCode,
    message: string,
    failureStage: FieldDemoOwnerRepairFailureStage,
    failureReason: FieldDemoOwnerFailureReason | null = null,
  ) {
    super(message);
    this.name = "FieldDemoOwnerRepairError";
    this.code = code;
    this.failureStage = failureStage;
    this.failureReason = failureReason;
  }
}

type RepairEvidence = {
  schemaVersion: 1;
  contract: typeof FIELD_DEMO_OWNER_REPAIR_VERSION;
  environment: "staging";
  operation: "create-missing";
  expectedMainSha: string;
  status: "passed" | "failed";
  result: FieldDemoOwnerRepairResult | null;
  mutationAttempted: boolean;
  errorCode: FieldDemoOwnerRepairErrorCode | null;
  failureStage: FieldDemoOwnerRepairFailureStage;
  failureReason: FieldDemoOwnerFailureReason | null;
  startedAt: string;
  completedAt: string;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

type RepairDependencies = {
  readCandidates: () => Promise<FieldDemoOwnerRepairCandidate[]>;
  createOwner: () => Promise<FieldDemoOwnerCreateOutcome>;
  wait?: (milliseconds: number) => Promise<void>;
};

function parseArgs(argv: string[]): RepairOptions {
  let mode: RepairMode | null = null;
  let expectedSha = "";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      if (mode) throw new Error("Choose exactly one owner-repair mode.");
      mode = "check";
      continue;
    }
    if (argument === "--create-missing") {
      if (mode) throw new Error("Choose exactly one owner-repair mode.");
      mode = "create-missing";
      continue;
    }
    if (argument === "--expected-sha") {
      expectedSha = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown owner-repair argument: ${argument}`);
  }

  if (!mode) throw new Error("Choose exactly one owner-repair mode.");
  if (mode === "create-missing" && !SHA_PATTERN.test(expectedSha)) {
    throw new Error("Owner repair requires an exact main SHA.");
  }
  return { mode, expectedSha };
}

function exactStagingSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.origin === FIELD_DEMO_OWNER_REPAIR_SUPABASE_URL &&
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export function validateFieldDemoOwnerRepairConfig(
  options: RepairOptions,
  environment: RepairEnvironment,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  if (environment.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (environment.TARGET_ENVIRONMENT !== "staging") {
    errors.push("TARGET_ENVIRONMENT must be staging");
  }
  if (environment.GITHUB_ACTIONS !== "true") {
    errors.push("owner repair may run only in GitHub Actions");
  }
  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    errors.push("owner repair requires workflow_dispatch");
  }
  if (environment.GITHUB_REPOSITORY !== "veele-services/platform") {
    errors.push("owner repair repository is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ID ?? "")) {
    errors.push("owner repair run id is invalid");
  }
  if (!RUN_NUMBER_PATTERN.test(environment.GITHUB_RUN_ATTEMPT ?? "")) {
    errors.push("owner repair run attempt is invalid");
  }
  if (
    environment.GITHUB_REF !== "refs/heads/main" ||
    environment.GITHUB_REF_NAME !== "main"
  ) {
    errors.push("owner repair must run from main");
  }
  if (
    !SHA_PATTERN.test(options.expectedSha) ||
    environment.GITHUB_SHA !== options.expectedSha
  ) {
    errors.push("checkout SHA differs from the expected main SHA");
  }
  if (
    environment.FIELDGRID_FIELD_DEMO_OWNER_REPAIR_CONFIRMATION !==
    FIELD_DEMO_OWNER_REPAIR_CONFIRMATION
  ) {
    errors.push("confirmation does not authorize owner repair");
  }
  if (
    environment.EXPECTED_SUPABASE_PROJECT_REF !==
    FIELD_DEMO_OWNER_REPAIR_PROJECT_REF
  ) {
    errors.push("owner repair project ref is invalid");
  }
  if (!exactStagingSupabaseUrl(environment.NEXT_PUBLIC_SUPABASE_URL)) {
    errors.push("owner repair Supabase URL is invalid");
  }
  if ((environment.SUPABASE_SERVICE_ROLE_KEY?.trim().length ?? 0) < 32) {
    errors.push("owner repair service credential is unavailable");
  }
  if (!environment.DATABASE_URL?.trim()) {
    errors.push("runtime database URL is required");
  }
  if (!environment.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
    errors.push("migration database URL is required");
  }
  if (environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE !== "migration") {
    errors.push("owner repair requires the migration connection purpose");
  }
  return errors;
}

export function reservedFieldDemoOwnerAttributes(password: string) {
  if (password.length < 32)
    throw new Error("Internal auth password is invalid.");
  return {
    email: FIELD_DEMO_OWNER_EMAIL,
    password,
    email_confirm: true,
    app_metadata: {
      portal: "tenant-admin",
      credential_activation_pending: true,
      backoffice_profile_name_required: true,
      fieldgrid_automation_contract: FIELD_DEMO_OWNER_REPAIR_VERSION,
      fieldgrid_environment: "staging",
    },
    user_metadata: {},
  } as const;
}

export function fieldDemoOwnerRepairCandidateIsSafe(
  candidate: FieldDemoOwnerRepairCandidate | undefined,
): boolean {
  return Boolean(
    candidate &&
    fieldDemoOwnerFailureReason([candidate]) === null &&
    candidate.email_identity_count === 1 &&
    candidate.platform_user_count === 0,
  );
}

export function fieldDemoOwnerRepairCandidateIsExact(
  candidate: FieldDemoOwnerRepairCandidate | undefined,
): boolean {
  return Boolean(
    fieldDemoOwnerRepairCandidateIsSafe(candidate) &&
    candidate?.repair_contract === FIELD_DEMO_OWNER_REPAIR_VERSION &&
    candidate.repair_environment === "staging" &&
    candidate.portal === "tenant-admin" &&
    candidate.activation_pending &&
    candidate.profile_name_required,
  );
}

export function fieldDemoOwnerCreateOutcome(
  response: Pick<Response, "ok" | "status">,
): FieldDemoOwnerCreateOutcome {
  if (response.ok && response.status >= 200 && response.status < 300) {
    return "accepted";
  }
  if (
    response.status >= 400 &&
    response.status < 500 &&
    response.status !== 408 &&
    response.status !== 425 &&
    response.status !== 429
  ) {
    return "rejected";
  }
  return "uncertain";
}

export async function fieldDemoOwnerRepairFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  fetchImplementation: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "field_demo_owner_transport_unavailable" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

export async function repairMissingFieldDemoOwner(
  dependencies: RepairDependencies,
): Promise<FieldDemoOwnerRepairResult> {
  const before = await dependencies.readCandidates();
  const beforeReason = fieldDemoOwnerFailureReason(before);
  if (beforeReason === null) {
    if (
      before.length === 1 &&
      fieldDemoOwnerRepairCandidateIsExact(before[0])
    ) {
      return "already-valid";
    }
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_precondition_invalid",
      "Existing reserved owner is not safe for a no-op.",
      "owner_precondition",
    );
  }
  if (beforeReason !== "field_demo_owner_not_found") {
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_precondition_invalid",
      "Reserved owner state changed before repair.",
      "owner_precondition",
      beforeReason,
    );
  }

  let createOutcome: FieldDemoOwnerCreateOutcome;
  try {
    createOutcome = await dependencies.createOwner();
  } catch {
    createOutcome = "uncertain";
  }

  let after: FieldDemoOwnerRepairCandidate[] = [];
  const delay = dependencies.wait ?? wait;
  for (let attempt = 0; attempt < POSTCHECK_ATTEMPTS; attempt += 1) {
    after = await dependencies.readCandidates();
    if (after.length === 1 && fieldDemoOwnerRepairCandidateIsExact(after[0])) {
      return "created-and-verified";
    }
    if (attempt + 1 < POSTCHECK_ATTEMPTS) {
      await delay(POSTCHECK_DELAY_MS);
    }
  }

  const afterReason = fieldDemoOwnerFailureReason(after);
  if (afterReason !== "field_demo_owner_not_found") {
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_postcondition_invalid",
      "Reserved owner postcondition is not exact.",
      "owner_postcondition",
      afterReason,
    );
  }
  if (createOutcome === "rejected") {
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_create_rejected",
      "Auth provider rejected the create request.",
      "auth_create",
    );
  }
  if (createOutcome === "uncertain") {
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_create_outcome_uncertain",
      "Auth provider create outcome is uncertain.",
      "auth_create",
    );
  }
  throw new FieldDemoOwnerRepairError(
    "field_demo_owner_repair_postcondition_invalid",
    "Created owner did not satisfy the database postcondition.",
    "owner_postcondition",
    afterReason,
  );
}

export function safeFieldDemoOwnerRepairErrorCode(
  error: unknown,
): FieldDemoOwnerRepairErrorCode {
  return error instanceof FieldDemoOwnerRepairError
    ? error.code
    : "field_demo_owner_repair_failed";
}

export function safeFieldDemoOwnerRepairFailureReason(
  error: unknown,
): FieldDemoOwnerFailureReason | null {
  return error instanceof FieldDemoOwnerRepairError
    ? error.failureReason
    : null;
}

export function formatSafeFieldDemoOwnerRepairError(error: unknown): string {
  const reason = safeFieldDemoOwnerRepairFailureReason(error);
  return `${FIELD_DEMO_OWNER_REPAIR_VERSION}: ${safeFieldDemoOwnerRepairErrorCode(
    error,
  )}${reason ? `:${reason}` : ""}`;
}

const OWNER_CANDIDATE_QUERY = `SELECT id::text AS user_id,
       deleted_at IS NOT NULL AS is_deleted,
       (banned_until IS NOT NULL AND banned_until > now()) AS is_banned,
       is_anonymous IS NOT FALSE AS is_anonymous,
       email_confirmed_at IS NOT NULL AS email_confirmed,
       coalesce(length(encrypted_password), 0) > 0 AS password_set,
       aud IS NOT DISTINCT FROM 'authenticated' AS authenticated_audience,
       role IS NOT DISTINCT FROM 'authenticated' AS authenticated_role,
       raw_app_meta_data ->> 'fieldgrid_automation_contract'
         AS repair_contract,
       raw_app_meta_data ->> 'fieldgrid_environment'
         AS repair_environment,
       raw_app_meta_data ->> 'portal' AS portal,
       (raw_app_meta_data ->> 'credential_activation_pending')
         IS NOT DISTINCT FROM 'true' AS activation_pending,
       (raw_app_meta_data ->> 'backoffice_profile_name_required')
         IS NOT DISTINCT FROM 'true' AS profile_name_required,
       (SELECT COUNT(*)::integer
          FROM auth.identities AS identity
         WHERE identity.user_id = auth_user.id
           AND identity.provider = 'email'
           AND lower(identity.identity_data ->> 'email') = lower($1))
         AS email_identity_count,
       (SELECT COUNT(*)::integer
          FROM public.platform_users AS platform_user
         WHERE platform_user.user_id = auth_user.id)
         AS platform_user_count
  FROM auth.users AS auth_user
 WHERE lower(auth_user.email) = lower($1)
 ORDER BY auth_user.id`;

export async function loadFieldDemoOwnerRepairCandidates(
  queryable: Queryable,
): Promise<FieldDemoOwnerRepairCandidate[]> {
  const result = await queryable.query<FieldDemoOwnerRepairCandidate>(
    OWNER_CANDIDATE_QUERY,
    [FIELD_DEMO_OWNER_EMAIL],
  );
  return result.rows;
}

async function acquireOwnerRepairLock(queryable: Queryable): Promise<void> {
  const result = await queryable.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
    [OWNER_REPAIR_LOCK_KEY],
  );
  if (result.rows.length !== 1 || result.rows[0]?.acquired !== true) {
    throw new FieldDemoOwnerRepairError(
      "field_demo_owner_repair_lock_unavailable",
      "Owner repair lock is unavailable.",
      "database_lock",
    );
  }
}

async function releaseOwnerRepairLock(queryable: Queryable): Promise<void> {
  await queryable.query(
    `SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released`,
    [OWNER_REPAIR_LOCK_KEY],
  );
}

function createReservedOwner(
  environment: RepairEnvironment,
): () => Promise<FieldDemoOwnerCreateOutcome> {
  return async () => {
    let password = generateInternalAuthPassword();
    try {
      const serviceCredential = environment.SUPABASE_SERVICE_ROLE_KEY!.trim();
      const response = await fieldDemoOwnerRepairFetch(
        new URL("/auth/v1/admin/users", FIELD_DEMO_OWNER_REPAIR_SUPABASE_URL),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            apikey: serviceCredential,
            authorization: `Bearer ${serviceCredential}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(reservedFieldDemoOwnerAttributes(password)),
        },
      );
      return fieldDemoOwnerCreateOutcome(response);
    } catch {
      return "uncertain";
    } finally {
      password = "";
    }
  };
}

function ownerRepairEvidencePath(environment: RepairEnvironment): string {
  const runId = environment.GITHUB_RUN_ID ?? "";
  const runAttempt = environment.GITHUB_RUN_ATTEMPT ?? "";
  if (!RUN_NUMBER_PATTERN.test(runId) || !RUN_NUMBER_PATTERN.test(runAttempt)) {
    throw new Error("Owner repair evidence identity is invalid.");
  }
  return join(
    repoRoot,
    "artifacts",
    "field-demo-owner-repair",
    `create-missing-${runId}-${runAttempt}.json`,
  );
}

async function writeEvidence(
  evidence: RepairEvidence,
  environment: RepairEnvironment,
): Promise<void> {
  const evidencePath = ownerRepairEvidencePath(environment);
  const directory = dirname(evidencePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(evidencePath, 0o600);
}

async function runRepair(
  options: RepairOptions,
  environment: RepairEnvironment,
): Promise<FieldDemoOwnerRepairResult> {
  const startedAt = new Date().toISOString();
  let failureStage: FieldDemoOwnerRepairFailureStage = "configuration";
  let mutationAttempted = false;
  let dbModule: typeof import("../lib/db/src/index.ts") | null = null;
  let client:
    | (Queryable & { release: (error?: Error | boolean) => void })
    | null = null;
  let lockAcquired = false;
  const evidence: RepairEvidence = {
    schemaVersion: 1,
    contract: FIELD_DEMO_OWNER_REPAIR_VERSION,
    environment: "staging",
    operation: "create-missing",
    expectedMainSha: options.expectedSha,
    status: "failed",
    result: null,
    mutationAttempted: false,
    errorCode: null,
    failureStage: null,
    failureReason: null,
    startedAt,
    completedAt: startedAt,
  };

  try {
    const errors = validateFieldDemoOwnerRepairConfig(options, environment);
    if (errors.length > 0) {
      throw new FieldDemoOwnerRepairError(
        "field_demo_owner_repair_configuration_invalid",
        "Owner repair configuration is invalid.",
        "configuration",
      );
    }

    failureStage = "database_bootstrap";
    dbModule = await import("../lib/db/src/index.ts");
    client = await dbModule.pool.connect();
    failureStage = "database_lock";
    await acquireOwnerRepairLock(client);
    lockAcquired = true;

    failureStage = "owner_precondition";
    let candidateReadCount = 0;
    const result = await repairMissingFieldDemoOwner({
      readCandidates: () => {
        failureStage =
          candidateReadCount === 0
            ? "owner_precondition"
            : "owner_postcondition";
        candidateReadCount += 1;
        return loadFieldDemoOwnerRepairCandidates(client!);
      },
      createOwner: async () => {
        failureStage = "auth_create";
        mutationAttempted = true;
        return createReservedOwner(environment)();
      },
    });
    failureStage = "owner_postcondition";
    evidence.status = "passed";
    evidence.result = result;
    evidence.mutationAttempted = mutationAttempted;
    return result;
  } catch (error) {
    evidence.errorCode = safeFieldDemoOwnerRepairErrorCode(error);
    evidence.failureStage =
      error instanceof FieldDemoOwnerRepairError
        ? error.failureStage
        : failureStage;
    evidence.failureReason = safeFieldDemoOwnerRepairFailureReason(error);
    evidence.mutationAttempted = mutationAttempted;
    throw error;
  } finally {
    if (client && lockAcquired) {
      try {
        await releaseOwnerRepairLock(client);
      } catch {
        // Closing the dedicated pool connection below also releases the lock.
      }
    }
    client?.release();
    await dbModule?.pool.end();
    evidence.completedAt = new Date().toISOString();
    await writeEvidence(evidence, environment);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "check") {
    const attributes = reservedFieldDemoOwnerAttributes(
      "fieldgrid-static-check-password-32-bytes",
    );
    if (
      attributes.email !== FIELD_DEMO_OWNER_EMAIL ||
      attributes.app_metadata.fieldgrid_automation_contract !==
        FIELD_DEMO_OWNER_REPAIR_VERSION
    ) {
      throw new Error("Owner repair static contract is invalid.");
    }
    console.log(`${FIELD_DEMO_OWNER_REPAIR_VERSION}: static checks passed`);
    return;
  }
  const result = await runRepair(options, process.env);
  console.log(`${FIELD_DEMO_OWNER_REPAIR_VERSION}: ${result}`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(formatSafeFieldDemoOwnerRepairError(error));
    process.exitCode = 1;
  });
}
