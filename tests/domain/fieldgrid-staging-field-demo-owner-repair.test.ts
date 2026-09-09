import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthUnknownError,
  createClient,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";

import {
  FIELD_DEMO_OWNER_REPAIR_CONFIRMATION,
  FIELD_DEMO_OWNER_REPAIR_PROJECT_REF,
  FIELD_DEMO_OWNER_REPAIR_SUPABASE_URL,
  FIELD_DEMO_OWNER_REPAIR_VERSION,
  fieldDemoOwnerCreateOutcome,
  fieldDemoOwnerRepairCandidateIsExact,
  fieldDemoOwnerRepairCandidateIsSafe,
  fieldDemoOwnerRepairFetch,
  formatSafeFieldDemoOwnerRepairError,
  repairMissingFieldDemoOwner,
  reservedFieldDemoOwnerAttributes,
  safeFieldDemoOwnerRepairErrorCode,
  safeFieldDemoOwnerRepairFailureReason,
  validateFieldDemoOwnerRepairConfig,
  type FieldDemoOwnerRepairCandidate,
} from "../../scripts/fieldgrid-staging-field-demo-owner-repair.mts";

const sha = "a".repeat(40);
const userId = "10000000-0000-4000-8000-000000000071";

const exactCandidate: FieldDemoOwnerRepairCandidate = {
  user_id: userId,
  is_deleted: false,
  is_banned: false,
  is_anonymous: false,
  email_confirmed: true,
  password_set: true,
  authenticated_audience: true,
  authenticated_role: true,
  repair_contract: FIELD_DEMO_OWNER_REPAIR_VERSION,
  repair_environment: "staging",
  portal: "tenant-admin",
  activation_pending: true,
  profile_name_required: true,
  email_identity_count: 1,
  platform_user_count: 0,
};

const validEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_NAME: "main",
  GITHUB_REPOSITORY: "veele-services/platform",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_RUN_ID: "123456789",
  GITHUB_SHA: sha,
  EXPECTED_SUPABASE_PROJECT_REF: FIELD_DEMO_OWNER_REPAIR_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `${FIELD_DEMO_OWNER_REPAIR_SUPABASE_URL}/`,
  SUPABASE_SERVICE_ROLE_KEY: "s".repeat(48),
  DATABASE_URL: "postgresql://runtime:secret@example.invalid/db",
  FIELDGRID_MIGRATION_DATABASE_URL:
    "postgresql://migration:secret@example.invalid/db",
  FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  FIELDGRID_FIELD_DEMO_OWNER_REPAIR_CONFIRMATION:
    FIELD_DEMO_OWNER_REPAIR_CONFIRMATION,
};

function sequenceReader(
  sequence: FieldDemoOwnerRepairCandidate[][],
): () => Promise<FieldDemoOwnerRepairCandidate[]> {
  let index = 0;
  return async () => {
    const value = sequence[Math.min(index, sequence.length - 1)] ?? [];
    index += 1;
    return value;
  };
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("Expected owner repair to fail.");
}

test("owner repair configuration is exact staging and exact main only", () => {
  assert.deepEqual(
    validateFieldDemoOwnerRepairConfig(
      { mode: "create-missing", expectedSha: sha },
      validEnvironment,
    ),
    [],
  );

  for (const [key, value] of [
    ["APP_ENV", "production"],
    ["TARGET_ENVIRONMENT", "production"],
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "push"],
    ["GITHUB_REF", "refs/heads/staging"],
    ["GITHUB_REF_NAME", "staging"],
    ["GITHUB_REPOSITORY", "other/repository"],
    ["GITHUB_RUN_ATTEMPT", "0"],
    ["GITHUB_RUN_ID", "stale/path"],
    ["GITHUB_SHA", "b".repeat(40)],
    ["EXPECTED_SUPABASE_PROJECT_REF", "productionref"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.com/"],
    ["SUPABASE_SERVICE_ROLE_KEY", "short"],
    ["DATABASE_URL", ""],
    ["FIELDGRID_MIGRATION_DATABASE_URL", ""],
    ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
    ["FIELDGRID_FIELD_DEMO_OWNER_REPAIR_CONFIRMATION", "wrong"],
  ] as const) {
    const errors = validateFieldDemoOwnerRepairConfig(
      { mode: "create-missing", expectedSha: sha },
      { ...validEnvironment, [key]: value },
    );
    assert.ok(errors.length > 0, `${key} must fail closed`);
  }
});

test("reserved owner create attributes are fixed and least privileged", () => {
  const password = "p".repeat(32);
  const attributes = reservedFieldDemoOwnerAttributes(password);
  assert.equal(attributes.password, password);
  assert.equal(attributes.email_confirm, true);
  assert.deepEqual(attributes.user_metadata, {});
  assert.deepEqual(attributes.app_metadata, {
    portal: "tenant-admin",
    credential_activation_pending: true,
    backoffice_profile_name_required: true,
    fieldgrid_automation_contract: FIELD_DEMO_OWNER_REPAIR_VERSION,
    fieldgrid_environment: "staging",
  });
  const serialized = JSON.stringify(attributes);
  assert.doesNotMatch(serialized, /platform_role|tenant_id|service_role/u);
  assert.throws(
    () => reservedFieldDemoOwnerAttributes("too-short"),
    /password is invalid/u,
  );
});

test("an already valid tenant owner is an exact no-op", async () => {
  let creates = 0;
  const result = await repairMissingFieldDemoOwner({
    readCandidates: sequenceReader([[exactCandidate]]),
    createOwner: async () => {
      creates += 1;
      return "accepted";
    },
  });
  assert.equal(result, "already-valid");
  assert.equal(creates, 0);
});

test("every non-missing invalid owner state fails before mutation", async () => {
  const cases: Array<[FieldDemoOwnerRepairCandidate[], string | null]> = [
    [[exactCandidate, { ...exactCandidate }], "field_demo_owner_ambiguous"],
    [[{ ...exactCandidate, is_deleted: true }], "field_demo_owner_deleted"],
    [[{ ...exactCandidate, is_banned: true }], "field_demo_owner_banned"],
    [[{ ...exactCandidate, is_anonymous: true }], "field_demo_owner_anonymous"],
    [
      [{ ...exactCandidate, email_confirmed: false }],
      "field_demo_owner_email_unconfirmed",
    ],
    [
      [{ ...exactCandidate, password_set: false }],
      "field_demo_owner_password_unset",
    ],
    [
      [{ ...exactCandidate, authenticated_audience: false }],
      "field_demo_owner_audience_invalid",
    ],
    [
      [{ ...exactCandidate, authenticated_role: false }],
      "field_demo_owner_role_invalid",
    ],
    [
      [{ ...exactCandidate, user_id: "not-a-uuid" }],
      "field_demo_owner_id_invalid",
    ],
    [[{ ...exactCandidate, email_identity_count: 0 }], null],
    [[{ ...exactCandidate, platform_user_count: 1 }], null],
    [[{ ...exactCandidate, repair_contract: "external" }], null],
  ];

  for (const [rows, expectedReason] of cases) {
    let creates = 0;
    const error = await captureError(() =>
      repairMissingFieldDemoOwner({
        readCandidates: sequenceReader([rows]),
        createOwner: async () => {
          creates += 1;
          return "accepted";
        },
      }),
    );
    assert.equal(creates, 0);
    assert.equal(
      safeFieldDemoOwnerRepairErrorCode(error),
      "field_demo_owner_repair_precondition_invalid",
    );
    assert.equal(safeFieldDemoOwnerRepairFailureReason(error), expectedReason);
  }
});

test("a missing owner is created once and accepted only after exact postcheck", async () => {
  let creates = 0;
  const result = await repairMissingFieldDemoOwner({
    readCandidates: sequenceReader([[], [], [exactCandidate]]),
    createOwner: async () => {
      creates += 1;
      return "accepted";
    },
    wait: async () => {},
  });
  assert.equal(result, "created-and-verified");
  assert.equal(creates, 1);
  assert.equal(fieldDemoOwnerRepairCandidateIsSafe(exactCandidate), true);
  assert.equal(fieldDemoOwnerRepairCandidateIsExact(exactCandidate), true);
});

test("a timeout-after-commit is never retried and succeeds through post-read", async () => {
  let creates = 0;
  const result = await repairMissingFieldDemoOwner({
    readCandidates: sequenceReader([[], [exactCandidate]]),
    createOwner: async () => {
      creates += 1;
      throw new Error("provider PII and token shaped detail");
    },
    wait: async () => {},
  });
  assert.equal(result, "created-and-verified");
  assert.equal(creates, 1);
});

test("the pinned auth adapter classifies transient returned errors as uncertain", () => {
  assert.equal(fieldDemoOwnerCreateOutcome(true, null), "accepted");
  assert.equal(fieldDemoOwnerCreateOutcome(false, null), "uncertain");
  assert.equal(
    fieldDemoOwnerCreateOutcome(
      false,
      new AuthRetryableFetchError("bounded retryable error", 0),
    ),
    "uncertain",
  );
  assert.equal(
    fieldDemoOwnerCreateOutcome(
      false,
      new AuthUnknownError(
        "bounded unknown response",
        new Error("untrusted response detail"),
      ),
    ),
    "uncertain",
  );
  assert.equal(
    fieldDemoOwnerCreateOutcome(
      false,
      new AuthApiError("bounded server error", 503, "unexpected_failure"),
    ),
    "uncertain",
  );
  assert.equal(
    fieldDemoOwnerCreateOutcome(
      false,
      new AuthApiError("bounded duplicate", 422, "user_already_exists"),
    ),
    "rejected",
  );
});

test("transport exceptions are sanitized before the pinned auth adapter can log them", async () => {
  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => {
    logged.push(values);
  };
  try {
    const throwingFetch = (async () => {
      throw new Error("services@fieldgrid.nl provider token-shaped detail");
    }) as typeof fetch;
    const supabase = createClient(
      "https://owner-repair-test.supabase.co",
      "s".repeat(48),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) =>
            fieldDemoOwnerRepairFetch(input, init, throwingFetch),
        },
      },
    );
    const { data, error } = await supabase.auth.admin.createUser(
      reservedFieldDemoOwnerAttributes("p".repeat(32)),
    );
    assert.equal(data.user, null);
    assert.equal(isAuthRetryableFetchError(error), true);
    assert.equal(fieldDemoOwnerCreateOutcome(false, error), "uncertain");
    assert.deepEqual(logged, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test("provider failures and invalid postconditions stay bounded and are not retried", async () => {
  for (const [outcome, expectedCode] of [
    ["rejected", "field_demo_owner_repair_create_rejected"],
    ["uncertain", "field_demo_owner_repair_create_outcome_uncertain"],
    ["accepted", "field_demo_owner_repair_postcondition_invalid"],
  ] as const) {
    let creates = 0;
    const error = await captureError(() =>
      repairMissingFieldDemoOwner({
        readCandidates: sequenceReader([[], []]),
        createOwner: async () => {
          creates += 1;
          return outcome;
        },
        wait: async () => {},
      }),
    );
    assert.equal(creates, 1);
    assert.equal(safeFieldDemoOwnerRepairErrorCode(error), expectedCode);
    assert.doesNotMatch(
      formatSafeFieldDemoOwnerRepairError(error),
      /services@|token shaped|10000000/u,
    );
  }

  const markerError = await captureError(() =>
    repairMissingFieldDemoOwner({
      readCandidates: sequenceReader([
        [],
        [{ ...exactCandidate, repair_contract: "external" }],
      ]),
      createOwner: async () => "rejected",
      wait: async () => {},
    }),
  );
  assert.equal(
    safeFieldDemoOwnerRepairErrorCode(markerError),
    "field_demo_owner_repair_postcondition_invalid",
  );
  assert.equal(safeFieldDemoOwnerRepairFailureReason(markerError), null);
});

test("arbitrary external error fields never reach safe diagnostics", () => {
  const external = Object.assign(new Error("PII services@fieldgrid.nl"), {
    code: "token-shaped-code",
    failureReason: "field_demo_owner_not_found",
  });
  assert.equal(
    safeFieldDemoOwnerRepairErrorCode(external),
    "field_demo_owner_repair_failed",
  );
  assert.equal(safeFieldDemoOwnerRepairFailureReason(external), null);
  assert.equal(
    formatSafeFieldDemoOwnerRepairError(external),
    `${FIELD_DEMO_OWNER_REPAIR_VERSION}: field_demo_owner_repair_failed`,
  );
});
