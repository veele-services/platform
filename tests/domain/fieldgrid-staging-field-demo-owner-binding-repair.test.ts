import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
  FIELD_DEMO_OWNER_BINDING_PROJECT_REF,
  FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY,
  FIELD_DEMO_OWNER_BINDING_SUPABASE_URL,
  FIELD_DEMO_OWNER_BINDING_VERSION,
  FIELD_DEMO_RETAINED_OWNER_ID,
  FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
  FIELD_DEMO_SUPERSEDED_OWNER_ID,
  classifyFieldDemoOwnerBinding,
  formatSafeFieldDemoOwnerBindingError,
  loadFieldDemoOwnerBindingSnapshot,
  repairFieldDemoOwnerBinding,
  reconcileFieldDemoOwnerBinding,
  safeFieldDemoOwnerBindingErrorCode,
  safeFieldDemoOwnerBindingFailureReason,
  validateFieldDemoOwnerBindingConfig,
  type FieldDemoOwnerBindingFailureReason,
  type FieldDemoOwnerBindingSnapshot,
} from "../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts";
import { FIELD_DEMO_OWNER_EMAIL } from "../../scripts/fieldgrid-staging-field-demo-domain-repair.mts";

const sha = "a".repeat(40);
const tenantId = "10000000-0000-4000-8000-000000000081";
const ownerUserId = "10000000-0000-4000-8000-000000000082";
const managementRoleId = "10000000-0000-4000-8000-000000000083";

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
  EXPECTED_SUPABASE_PROJECT_REF: FIELD_DEMO_OWNER_BINDING_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `${FIELD_DEMO_OWNER_BINDING_SUPABASE_URL}/`,
  DATABASE_URL: "postgresql://runtime:secret@example.invalid/db",
  FIELDGRID_MIGRATION_DATABASE_URL:
    "postgresql://migration:secret@example.invalid/db",
  FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION:
    FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
};

const exactSnapshot: FieldDemoOwnerBindingSnapshot = {
  tenant_id: tenantId,
  owner_user_id: ownerUserId,
  management_role_id: managementRoleId,
  slug_tenant_count: 1,
  target_tenant_core_valid_count: 1,
  exact_domain_global_count: 0,
  legacy_domain_global_count: 1,
  target_domain_count: 1,
  target_exact_domain_count: 0,
  target_legacy_domain_count: 1,
  target_primary_domain_count: 1,
  target_legacy_ready_count: 1,
  legacy_domain_check_count: 0,
  organization_settings_count: 1,
  active_subscription_count: 1,
  active_enterprise_subscription_count: 1,
  website_site_count: 0,
  website_binding_count: 0,
  exact_domain_binding_count: 0,
  legacy_domain_binding_count: 0,
  auth_email_count: 1,
  auth_exact_count: 1,
  email_identity_count: 1,
  platform_user_count: 0,
  legacy_user_role_count: 0,
  management_template_role_count: 1,
  management_template_permission_count: 5,
  target_management_role_count: 1,
  target_management_permission_count: 5,
  management_missing_permission_count: 0,
  management_extra_permission_count: 0,
  owner_global_membership_count: 1,
  owner_target_membership_count: 1,
  owner_target_exact_active_count: 1,
  target_any_owner_count: 1,
  target_active_owner_count: 1,
  owner_global_role_link_count: 1,
  owner_target_role_link_count: 1,
  owner_target_management_link_count: 1,
  owner_target_nonmanagement_link_count: 0,
};

function snapshot(
  overrides: Partial<FieldDemoOwnerBindingSnapshot> = {},
): FieldDemoOwnerBindingSnapshot {
  return { ...exactSnapshot, ...overrides };
}

const missingBothSnapshot = snapshot({
  owner_global_membership_count: 0,
  owner_target_membership_count: 0,
  owner_target_exact_active_count: 0,
  target_any_owner_count: 0,
  target_active_owner_count: 0,
  owner_global_role_link_count: 0,
  owner_target_role_link_count: 0,
  owner_target_management_link_count: 0,
});

const missingRoleSnapshot = snapshot({
  owner_global_role_link_count: 0,
  owner_target_role_link_count: 0,
  owner_target_management_link_count: 0,
});

function sequenceReader(
  sequence: FieldDemoOwnerBindingSnapshot[],
): () => Promise<FieldDemoOwnerBindingSnapshot> {
  let index = 0;
  return async () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    assert.ok(value, "snapshot sequence must not be empty");
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
  assert.fail("Expected owner-binding repair to fail.");
}

test("owner-binding configuration is exact staging and exact main only", () => {
  for (const mode of ["diagnose", "repair", "reconcile"] as const) {
    assert.deepEqual(
      validateFieldDemoOwnerBindingConfig(
        { mode, expectedSha: sha },
        mode === "reconcile"
          ? {
              ...validEnvironment,
              FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION:
                "fieldgrid-staging-field-demo-owner-reconcile-v1",
            }
          : validEnvironment,
      ),
      [],
    );
  }
  assert.deepEqual(
    validateFieldDemoOwnerBindingConfig({ mode: "check", expectedSha: "" }, {}),
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
    ["DATABASE_URL", ""],
    ["FIELDGRID_MIGRATION_DATABASE_URL", ""],
    ["FIELDGRID_DATABASE_CONNECTION_PURPOSE", "runtime"],
    ["FIELDGRID_FIELD_DEMO_OWNER_BINDING_CONFIRMATION", "wrong"],
  ] as const) {
    const errors = validateFieldDemoOwnerBindingConfig(
      { mode: "repair", expectedSha: sha },
      { ...validEnvironment, [key]: value },
    );
    assert.ok(errors.length > 0, `${key} must fail closed`);
  }
});

test("owner-binding constants remain exact and staging-scoped", () => {
  assert.equal(
    FIELD_DEMO_OWNER_BINDING_CONFIRMATION,
    FIELD_DEMO_OWNER_BINDING_VERSION,
  );
  assert.equal(FIELD_DEMO_OWNER_BINDING_PROJECT_REF, "olyfmekyqozxrbrwwszu");
  assert.equal(
    FIELD_DEMO_OWNER_BINDING_SUPABASE_URL,
    `https://${FIELD_DEMO_OWNER_BINDING_PROJECT_REF}.supabase.co`,
  );
});

test("classifier accepts only the three exact owner-binding shapes", () => {
  assert.deepEqual(classifyFieldDemoOwnerBinding(exactSnapshot), {
    state: "already-valid",
    failureReason: null,
  });
  assert.deepEqual(classifyFieldDemoOwnerBinding(missingBothSnapshot), {
    state: "missing-membership-and-role",
    failureReason: null,
  });
  assert.deepEqual(classifyFieldDemoOwnerBinding(missingRoleSnapshot), {
    state: "missing-management-role",
    failureReason: null,
  });
});

const failClosedCases: Array<
  [
    label: string,
    overrides: Partial<FieldDemoOwnerBindingSnapshot>,
    reason: FieldDemoOwnerBindingFailureReason,
  ]
> = [
  [
    "invalid aggregate count",
    { owner_target_role_link_count: -1 },
    "tenant-identity-invalid",
  ],
  [
    "tenant identity",
    { slug_tenant_count: 0, tenant_id: null },
    "tenant-identity-invalid",
  ],
  [
    "tenant runtime",
    { target_tenant_core_valid_count: 0 },
    "tenant-runtime-invalid",
  ],
  [
    "domain prerequisite",
    { exact_domain_global_count: 1 },
    "domain-prerequisite-invalid",
  ],
  [
    "domain history",
    { legacy_domain_check_count: 1 },
    "domain-history-present",
  ],
  [
    "organization settings",
    { organization_settings_count: 0 },
    "organization-settings-invalid",
  ],
  [
    "subscription",
    { active_enterprise_subscription_count: 0 },
    "subscription-invalid",
  ],
  ["website state", { website_site_count: 1 }, "website-state-present"],
  ["auth owner", { auth_exact_count: 0 }, "auth-owner-invalid"],
  [
    "legacy global role",
    { legacy_user_role_count: 1 },
    "legacy-role-state-present",
  ],
  [
    "Management role",
    { target_management_role_count: 0, management_role_id: null },
    "management-role-invalid",
  ],
  [
    "Management permissions",
    {
      target_management_permission_count: 4,
      management_missing_permission_count: 1,
    },
    "management-permissions-invalid",
  ],
  [
    "cross-tenant membership",
    { owner_global_membership_count: 2 },
    "cross-tenant-owner-state",
  ],
  [
    "conflicting owner",
    { target_any_owner_count: 2, target_active_owner_count: 2 },
    "conflicting-owner-state",
  ],
  [
    "invalid owner membership",
    {
      owner_target_exact_active_count: 0,
      target_any_owner_count: 0,
      target_active_owner_count: 0,
    },
    "owner-membership-invalid",
  ],
  [
    "invalid owner role link",
    {
      owner_target_management_link_count: 0,
      owner_target_nonmanagement_link_count: 1,
    },
    "owner-role-link-invalid",
  ],
];

test("every bounded core category fails closed", () => {
  for (const [label, overrides, failureReason] of failClosedCases) {
    assert.deepEqual(
      classifyFieldDemoOwnerBinding(snapshot(overrides)),
      { state: "unsafe", failureReason },
      label,
    );
  }
});

test("cross-tenant, stale and conflicting identities are distinguished", () => {
  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_role_link_count: 2,
        owner_target_role_link_count: 1,
      }),
    ),
    { state: "unsafe", failureReason: "cross-tenant-owner-state" },
  );

  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_membership_count: 0,
        owner_target_membership_count: 0,
        owner_target_exact_active_count: 0,
        target_any_owner_count: 1,
        target_active_owner_count: 1,
        owner_global_role_link_count: 0,
        owner_target_role_link_count: 0,
        owner_target_management_link_count: 0,
      }),
    ),
    { state: "unsafe", failureReason: "conflicting-owner-state" },
  );

  assert.deepEqual(
    classifyFieldDemoOwnerBinding(
      snapshot({
        owner_global_membership_count: 0,
        owner_target_membership_count: 0,
        owner_target_exact_active_count: 0,
        target_any_owner_count: 0,
        target_active_owner_count: 0,
      }),
    ),
    { state: "unsafe", failureReason: "owner-role-link-invalid" },
  );
});

test("an exact owner binding is a read-once no-op", async () => {
  let reads = 0;
  let memberships = 0;
  let roleLinks = 0;
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return exactSnapshot;
    },
    createMembership: async () => {
      memberships += 1;
    },
    createManagementRoleLink: async () => {
      roleLinks += 1;
    },
  });

  assert.equal(result, "already-valid");
  assert.equal(reads, 1);
  assert.equal(memberships, 0);
  assert.equal(roleLinks, 0);
});

test("owner reconciliation retains the exact info owner and demotes only the superseded owner", async () => {
  let demotions = 0;
  const result = await reconcileFieldDemoOwnerBinding({
    readTarget: async () => ({
      tenantId,
      retainedUser: {
        id: FIELD_DEMO_RETAINED_OWNER_ID,
        email: FIELD_DEMO_OWNER_EMAIL,
      },
      supersededUser: {
        id: FIELD_DEMO_SUPERSEDED_OWNER_ID,
        email: FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
      },
      ownerMemberships: [
        {
          userId: FIELD_DEMO_RETAINED_OWNER_ID,
          role: "owner",
          status: "active",
        },
        {
          userId: FIELD_DEMO_SUPERSEDED_OWNER_ID,
          role: "owner",
          status: "active",
        },
      ],
    }),
    demoteSupersededOwner: async (receivedTenantId, receivedUserId) => {
      assert.equal(receivedTenantId, tenantId);
      assert.equal(receivedUserId, FIELD_DEMO_SUPERSEDED_OWNER_ID);
      demotions += 1;
    },
    readSnapshot: async () => exactSnapshot,
  });

  assert.equal(result, "reconciled-retained-owner");
  assert.equal(demotions, 1);
});

test("owner reconciliation fails closed for any identity or owner-shape mismatch", async () => {
  let demotions = 0;
  const error = await captureError(() =>
    reconcileFieldDemoOwnerBinding({
      readTarget: async () => ({
        tenantId,
        retainedUser: {
          id: FIELD_DEMO_RETAINED_OWNER_ID,
          email: "wrong@example.invalid",
        },
        supersededUser: {
          id: FIELD_DEMO_SUPERSEDED_OWNER_ID,
          email: FIELD_DEMO_SUPERSEDED_OWNER_EMAIL,
        },
        ownerMemberships: [],
      }),
      demoteSupersededOwner: async () => {
        demotions += 1;
      },
      readSnapshot: async () => exactSnapshot,
    }),
  );

  assert.equal(demotions, 0);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(error),
    "field_demo_owner_binding_precondition_invalid",
  );
  assert.equal(
    safeFieldDemoOwnerBindingFailureReason(error),
    "conflicting-owner-state",
  );
});

test("missing membership and role invokes both exact callbacks once", async () => {
  let reads = 0;
  const calls: Array<{ kind: string; ids: string[] }> = [];
  const readSnapshot = sequenceReader([missingBothSnapshot, exactSnapshot]);
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return readSnapshot();
    },
    createMembership: async (receivedTenantId, receivedUserId) => {
      calls.push({
        kind: "membership",
        ids: [receivedTenantId, receivedUserId],
      });
    },
    createManagementRoleLink: async (
      receivedTenantId,
      receivedUserId,
      receivedRoleId,
    ) => {
      calls.push({
        kind: "role",
        ids: [receivedTenantId, receivedUserId, receivedRoleId],
      });
    },
  });

  assert.equal(result, "membership-and-role-created");
  assert.equal(reads, 2);
  assert.deepEqual(calls, [
    { kind: "membership", ids: [tenantId, ownerUserId] },
    { kind: "role", ids: [tenantId, ownerUserId, managementRoleId] },
  ]);
});

test("an exact membership with no role invokes only the Management callback", async () => {
  let reads = 0;
  let memberships = 0;
  const roleCalls: string[][] = [];
  const readSnapshot = sequenceReader([missingRoleSnapshot, exactSnapshot]);
  const result = await repairFieldDemoOwnerBinding({
    readSnapshot: async () => {
      reads += 1;
      return readSnapshot();
    },
    createMembership: async () => {
      memberships += 1;
    },
    createManagementRoleLink: async (...ids) => {
      roleCalls.push(ids);
    },
  });

  assert.equal(result, "management-role-created");
  assert.equal(reads, 2);
  assert.equal(memberships, 0);
  assert.deepEqual(roleCalls, [[tenantId, ownerUserId, managementRoleId]]);
});

test("unsafe snapshots never invoke a mutation callback", async () => {
  for (const [label, overrides, failureReason] of failClosedCases) {
    let memberships = 0;
    let roleLinks = 0;
    const error = await captureError(() =>
      repairFieldDemoOwnerBinding({
        readSnapshot: async () => snapshot(overrides),
        createMembership: async () => {
          memberships += 1;
        },
        createManagementRoleLink: async () => {
          roleLinks += 1;
        },
      }),
    );

    assert.equal(memberships, 0, label);
    assert.equal(roleLinks, 0, label);
    assert.equal(
      safeFieldDemoOwnerBindingErrorCode(error),
      "field_demo_owner_binding_precondition_invalid",
      label,
    );
    assert.equal(
      safeFieldDemoOwnerBindingFailureReason(error),
      failureReason,
      label,
    );
  }
});

test("membership and role insert failures remain bounded and stop immediately", async () => {
  let membershipCalls = 0;
  let roleCalls = 0;
  const membershipError = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: sequenceReader([missingBothSnapshot]),
      createMembership: async () => {
        membershipCalls += 1;
        throw new Error("tenant UUID and database credential-shaped detail");
      },
      createManagementRoleLink: async () => {
        roleCalls += 1;
      },
    }),
  );
  assert.equal(membershipCalls, 1);
  assert.equal(roleCalls, 0);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(membershipError),
    "field_demo_owner_binding_mutation_failed",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(membershipError), null);
  assert.doesNotMatch(
    formatSafeFieldDemoOwnerBindingError(membershipError),
    /credential|tenant UUID/u,
  );

  membershipCalls = 0;
  roleCalls = 0;
  const roleError = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: sequenceReader([missingBothSnapshot]),
      createMembership: async () => {
        membershipCalls += 1;
      },
      createManagementRoleLink: async () => {
        roleCalls += 1;
        throw new Error("services@fieldgrid.nl private role detail");
      },
    }),
  );
  assert.equal(membershipCalls, 1);
  assert.equal(roleCalls, 1);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(roleError),
    "field_demo_owner_binding_mutation_failed",
  );
  assert.doesNotMatch(
    formatSafeFieldDemoOwnerBindingError(roleError),
    /services@|private/u,
  );
});

test("a non-exact postcondition fails after one bounded mutation attempt", async () => {
  let reads = 0;
  let memberships = 0;
  let roleLinks = 0;
  const error = await captureError(() =>
    repairFieldDemoOwnerBinding({
      readSnapshot: async () => {
        reads += 1;
        return missingBothSnapshot;
      },
      createMembership: async () => {
        memberships += 1;
      },
      createManagementRoleLink: async () => {
        roleLinks += 1;
      },
    }),
  );

  assert.equal(reads, 2);
  assert.equal(memberships, 1);
  assert.equal(roleLinks, 1);
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(error),
    "field_demo_owner_binding_postcondition_invalid",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(error), null);
});

test("snapshot helper binds fixed identities and requires one aggregate row", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];
  const loaded = await loadFieldDemoOwnerBindingSnapshot({
    async query<T extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) {
      capturedSql = text;
      capturedValues = values ?? [];
      return { rows: [exactSnapshot as T], rowCount: 1 };
    },
  });

  assert.equal(loaded, exactSnapshot);
  assert.equal(capturedSql, FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY);
  assert.deepEqual(capturedValues, [
    "field-demo",
    FIELD_DEMO_OWNER_EMAIL,
    "field-demo.staging.fieldgrid.nl",
    "field-demo.fieldgrid.nl",
    "fieldgrid-staging-field-demo-owner-repair-v1",
  ]);
  assert.doesNotMatch(
    capturedSql,
    /services@fieldgrid\.nl|field-demo(?:\.staging)?\.fieldgrid\.nl/u,
  );
  for (const alias of [
    "auth_exact_count",
    "management_missing_permission_count",
    "management_extra_permission_count",
    "owner_global_membership_count",
    "owner_target_management_link_count",
  ]) {
    assert.match(capturedSql, new RegExp(`AS ${alias}`, "u"));
  }

  for (const rows of [[], [exactSnapshot, exactSnapshot]]) {
    const error = await captureError(() =>
      loadFieldDemoOwnerBindingSnapshot({
        async query<T extends Record<string, unknown>>() {
          return { rows: rows as T[], rowCount: rows.length };
        },
      }),
    );
    assert.equal(
      safeFieldDemoOwnerBindingErrorCode(error),
      "field_demo_owner_binding_precondition_invalid",
    );
    assert.equal(
      safeFieldDemoOwnerBindingFailureReason(error),
      "tenant-identity-invalid",
    );
  }
});

test("arbitrary external error fields never reach safe diagnostics", () => {
  const external = Object.assign(
    new Error("services@fieldgrid.nl and token-shaped private detail"),
    {
      code: "field_demo_owner_binding_precondition_invalid",
      failureReason: "auth-owner-invalid",
    },
  );
  assert.equal(
    safeFieldDemoOwnerBindingErrorCode(external),
    "field_demo_owner_binding_failed",
  );
  assert.equal(safeFieldDemoOwnerBindingFailureReason(external), null);
  assert.equal(
    formatSafeFieldDemoOwnerBindingError(external),
    `${FIELD_DEMO_OWNER_BINDING_VERSION}: field_demo_owner_binding_failed`,
  );
});
