import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRMATION,
  EXPECTED_GITHUB_PROMOTION_ACTOR,
  EXPECTED_GITHUB_REPOSITORY,
  PHASE2E_PREFLIGHT_WORKFLOW_PATH,
  STAGING_DEPLOY_CONFIRMATION,
  acquireAuthenticatedPreflightEvidence,
  assertPromotionContract,
  buildAtomicRefUpdates,
  dispatchStagingDeployment,
  materializeAuthenticatedEvidenceArchive,
  parseArgs,
  promoteExactMainToStaging,
  runStrictPromotionEvidenceGate,
  selectAuthenticatedPreflightArtifact,
  updateGithubRefsAtomically,
} from "../scripts/fieldgrid-phase2e-staging-promote.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function makeFixture({ unrelatedMain = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-phase2e-promotion-"));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const operator = join(root, "operator");

  git(root, ["init", "--bare", remote]);
  git(root, ["init", seed]);
  git(seed, ["config", "user.name", "Fieldgrid Test"]);
  git(seed, ["config", "user.email", "fieldgrid-test@example.invalid"]);
  writeFileSync(join(seed, "release.txt"), "staging\n");
  git(seed, ["add", "release.txt"]);
  git(seed, ["commit", "-m", "staging baseline"]);
  git(seed, ["branch", "-M", "staging"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "origin", "staging"]);
  const stagingSha = git(seed, ["rev-parse", "HEAD"]);

  if (unrelatedMain) {
    git(seed, ["switch", "--orphan", "main"]);
    writeFileSync(join(seed, "release.txt"), "unrelated main\n");
  } else {
    git(seed, ["switch", "-c", "main"]);
    writeFileSync(join(seed, "release.txt"), "approved main\n");
  }
  git(seed, ["add", "release.txt"]);
  git(seed, ["commit", "-m", "approved main"]);
  git(seed, ["push", "origin", "main"]);
  const mainSha = git(seed, ["rev-parse", "HEAD"]);

  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["clone", remote, operator]);

  return { root, remote, seed, operator, mainSha, stagingSha };
}

function remoteRef(remote, branch) {
  return git(remote, ["rev-parse", `refs/heads/${branch}`]);
}

function updateFixtureRefsAtomically(fixture) {
  return ({ approvedMain, expectedStaging }) => {
    const transaction = [
      "start",
      `update refs/heads/main ${approvedMain} ${approvedMain}`,
      `update refs/heads/staging ${approvedMain} ${expectedStaging}`,
      "prepare",
      "commit",
      "",
    ].join("\n");
    const result = spawnSync("git", ["update-ref", "--stdin"], {
      cwd: fixture.remote,
      encoding: "utf8",
      input: transaction,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || "atomic fixture ref update failed");
    }
    return true;
  };
}

function validOptions(fixture) {
  return {
    run: true,
    check: false,
    source: "main",
    target: "staging",
    approvedMain: fixture.mainSha,
    expectedStaging: fixture.stagingSha,
    preflightRunId: "123456789",
    confirmation: CONFIRMATION,
  };
}

function githubEvidenceFixture({
  approvedMain = "a".repeat(40),
  preflightRunId = "123456789",
  archiveBytes = Buffer.from("authenticated-phase2e-archive"),
  nowMs = Date.parse("2026-09-08T09:00:00.000Z"),
} = {}) {
  const updatedAt = new Date(nowMs - 60_000).toISOString();
  const repositoryId = 1_253_788_801;
  const run = {
    id: Number(preflightRunId),
    name: "Phase 2E Staging Promotion Preflight",
    path: PHASE2E_PREFLIGHT_WORKFLOW_PATH,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: approvedMain,
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
    updated_at: updatedAt,
    repository: {
      id: repositoryId,
      full_name: EXPECTED_GITHUB_REPOSITORY,
    },
  };
  const artifactId = 10_042_783_079;
  const artifact = {
    id: artifactId,
    name: `phase2e-staging-preflight-${preflightRunId}-${approvedMain}`,
    size_in_bytes: archiveBytes.length,
    digest: `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}`,
    expired: false,
    updated_at: updatedAt,
    archive_download_url: `https://api.github.com/repos/${EXPECTED_GITHUB_REPOSITORY}/actions/artifacts/${artifactId}/zip`,
    workflow_run: {
      id: Number(preflightRunId),
      head_branch: "main",
      head_sha: approvedMain,
      repository_id: repositoryId,
    },
  };
  return {
    approvedMain,
    archiveBytes,
    artifact,
    artifactsPayload: { artifacts: [artifact] },
    nowMs,
    preflightRunId,
    run,
  };
}

function fakeUnzip(entries, files = {}) {
  return (_archivePath, args, { binary = false } = {}) => {
    if (args[0] === "-Z1") {
      return {
        error: null,
        status: 0,
        stdout: `${entries.join("\n")}\n`,
      };
    }
    assert.equal(args[0], "-p");
    const bytes = files[args[1]] ?? Buffer.from('{"status":"pass"}\n');
    return {
      error: null,
      status: 0,
      stdout: binary ? Buffer.from(bytes) : String(bytes),
    };
  };
}

function githubProtectionFixture(branch, enforceAdmins = true) {
  const isMain = branch === "main";
  return {
    required_status_checks: {
      strict: true,
      checks: [
        {
          context: isMain
            ? "Main exact-head gate"
            : "Backup, restore and migration rehearsal",
          app_id: 15368,
        },
      ],
    },
    enforce_admins: { enabled: enforceAdmins },
    required_pull_request_reviews: isMain
      ? {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: false,
          require_last_push_approval: true,
          required_approving_review_count: 1,
        }
      : null,
    restrictions: isMain
      ? null
      : {
          users: [{ login: EXPECTED_GITHUB_PROMOTION_ACTOR }],
          teams: [],
          apps: [],
        },
    required_linear_history: { enabled: true },
    required_conversation_resolution: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    block_creations: { enabled: false },
    lock_branch: { enabled: false },
  };
}

function githubProtectionApiFixture(events = []) {
  const states = new Map([
    ["main", githubProtectionFixture("main")],
    ["staging", githubProtectionFixture("staging")],
  ]);
  return {
    states,
    run(method, branch) {
      events.push(`protection:${method}:${branch}`);
      const state = states.get(branch);
      assert.ok(state, `unexpected protection branch ${branch}`);
      if (method === "DELETE") state.enforce_admins.enabled = false;
      if (method === "POST") state.enforce_admins.enabled = true;
      return method === "GET" ? structuredClone(state) : true;
    },
  };
}

test("valid exact-ref promotion performs one atomic provider transaction", () => {
  const fixture = makeFixture();
  try {
    let evidenceGateCalls = 0;
    let deploymentDispatchCalls = 0;
    assert.deepEqual(
      buildAtomicRefUpdates(fixture.mainSha, fixture.stagingSha),
      [
        {
          name: "refs/heads/main",
          beforeOid: fixture.mainSha,
          afterOid: fixture.mainSha,
          force: false,
        },
        {
          name: "refs/heads/staging",
          beforeOid: fixture.stagingSha,
          afterOid: fixture.mainSha,
          force: false,
        },
      ],
    );

    const result = promoteExactMainToStaging(validOptions(fixture), {
      repoDir: fixture.operator,
      runPromotionEvidenceGate: (refs, context) => {
        evidenceGateCalls += 1;
        assert.deepEqual(refs, {
          approvedMain: fixture.mainSha,
          expectedStaging: fixture.stagingSha,
          preflightRunId: "123456789",
        });
        assert.equal(context.repoDir, fixture.operator);
        assert.equal(
          remoteRef(fixture.remote, "staging"),
          fixture.stagingSha,
          "strict evidence must run before the staging push",
        );
        return true;
      },
      updateRemoteRefs: updateFixtureRefsAtomically(fixture),
      dispatchDeployment: (approvedMain, context) => {
        deploymentDispatchCalls += 1;
        assert.equal(approvedMain, fixture.mainSha);
        assert.equal(context.repoDir, fixture.operator);
        assert.equal(remoteRef(fixture.remote, "main"), fixture.mainSha);
        assert.equal(remoteRef(fixture.remote, "staging"), fixture.mainSha);
        return true;
      },
    });
    assert.equal(evidenceGateCalls, 1);
    assert.equal(deploymentDispatchCalls, 1);
    assert.equal(result.deploymentDispatched, true);
    assert.equal(result.previousStaging, fixture.stagingSha);
    assert.equal(result.promotedStaging, fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "staging"), fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "main"), fixture.mainSha);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("GitHub ref transaction binds both before values in one updateRefs mutation", () => {
  const approvedMain = "a".repeat(40);
  const expectedStaging = "b".repeat(40);
  const calls = [];
  const events = [];
  const protection = githubProtectionApiFixture(events);
  const result = updateGithubRefsAtomically(
    { approvedMain, expectedStaging },
    {
      repoDir: repoRoot,
      env: {},
      runGraphql: (query, variables, context) => {
        calls.push({ query, variables, context });
        if (query.includes("FieldgridPromotionRepository")) {
          events.push("graphql:repository");
          return {
            viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
            repository: {
              id: "R_fixture",
              nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
            },
          };
        }
        events.push("graphql:mutation");
        assert.equal(
          protection.states.get("main").enforce_admins.enabled,
          false,
        );
        assert.equal(
          protection.states.get("staging").enforce_admins.enabled,
          false,
        );
        return {
          updateRefs: {
            clientMutationId: `fieldgrid-phase2e-${approvedMain}`,
          },
        };
      },
      runProtectionRequest: protection.run,
    },
  );

  assert.equal(result, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].query, /updateRefs\(input: \$input\)/u);
  assert.deepEqual(calls[1].variables.input.refUpdates, [
    {
      name: "refs/heads/main",
      beforeOid: approvedMain,
      afterOid: approvedMain,
      force: false,
    },
    {
      name: "refs/heads/staging",
      beforeOid: expectedStaging,
      afterOid: approvedMain,
      force: false,
    },
  ]);
  assert.equal(protection.states.get("main").enforce_admins.enabled, true);
  assert.equal(protection.states.get("staging").enforce_admins.enabled, true);
  assert.deepEqual(events, [
    "graphql:repository",
    "protection:GET:main",
    "protection:GET:staging",
    "protection:DELETE:main",
    "protection:DELETE:staging",
    "protection:GET:main",
    "protection:GET:staging",
    "graphql:mutation",
    "protection:POST:staging",
    "protection:POST:main",
    "protection:GET:main",
    "protection:GET:staging",
  ]);
});

test("GitHub ref transaction failure restores protection before returning", () => {
  const events = [];
  const protection = githubProtectionApiFixture(events);
  let graphqlCalls = 0;
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: (query) => {
            graphqlCalls += 1;
            if (query.includes("FieldgridPromotionRepository")) {
              return {
                viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
                repository: {
                  id: "R_fixture",
                  nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
                },
              };
            }
            throw new Error("provider transaction rejected");
          },
          runProtectionRequest: protection.run,
        },
      ),
    /provider transaction rejected/u,
  );
  assert.equal(graphqlCalls, 2);
  assert.equal(protection.states.get("main").enforce_admins.enabled, true);
  assert.equal(protection.states.get("staging").enforce_admins.enabled, true);
  assert.deepEqual(events.slice(-4), [
    "protection:POST:staging",
    "protection:POST:main",
    "protection:GET:main",
    "protection:GET:staging",
  ]);
});

test("ambiguous protection removal restores every promotion branch", () => {
  const events = [];
  const protection = githubProtectionApiFixture(events);
  let graphqlCalls = 0;
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: () => {
            graphqlCalls += 1;
            return {
              viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
              repository: {
                id: "R_fixture",
                nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
              },
            };
          },
          runProtectionRequest: (method, branch) => {
            const response = protection.run(method, branch);
            if (method === "DELETE" && branch === "main") {
              throw new Error("simulated response loss after remote mutation");
            }
            return response;
          },
        },
      ),
    /simulated response loss after remote mutation/u,
  );
  assert.equal(graphqlCalls, 1);
  assert.equal(protection.states.get("main").enforce_admins.enabled, true);
  assert.equal(protection.states.get("staging").enforce_admins.enabled, true);
  assert.deepEqual(events.slice(-4), [
    "protection:POST:staging",
    "protection:POST:main",
    "protection:GET:main",
    "protection:GET:staging",
  ]);
});

test("protection restoration failure is read back and fails closed", () => {
  const events = [];
  const protection = githubProtectionApiFixture(events);
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: (query) =>
            query.includes("FieldgridPromotionRepository")
              ? {
                  viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
                  repository: {
                    id: "R_fixture",
                    nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
                  },
                }
              : {
                  updateRefs: {
                    clientMutationId: `fieldgrid-phase2e-${"a".repeat(40)}`,
                  },
                },
          runProtectionRequest: (method, branch) => {
            if (method === "POST" && branch === "staging") {
              events.push("protection:POST:staging");
              throw new Error("restore failed");
            }
            return protection.run(method, branch);
          },
        },
      ),
    /protection restoration or readback failed/u,
  );
  assert.equal(protection.states.get("main").enforce_admins.enabled, true);
  assert.equal(protection.states.get("staging").enforce_admins.enabled, false);
  assert.deepEqual(events.slice(-4), [
    "protection:POST:staging",
    "protection:POST:main",
    "protection:GET:main",
    "protection:GET:staging",
  ]);
});

test("restored protection readback mismatch fails closed", () => {
  const events = [];
  const protection = githubProtectionApiFixture(events);
  const getCounts = new Map();
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: (query) =>
            query.includes("FieldgridPromotionRepository")
              ? {
                  viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
                  repository: {
                    id: "R_fixture",
                    nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
                  },
                }
              : {
                  updateRefs: {
                    clientMutationId: `fieldgrid-phase2e-${"a".repeat(40)}`,
                  },
                },
          runProtectionRequest: (method, branch) => {
            const response = protection.run(method, branch);
            if (method !== "GET") return response;
            const count = (getCounts.get(branch) ?? 0) + 1;
            getCounts.set(branch, count);
            if (branch === "main" && count === 3) {
              response.allow_deletions.enabled = true;
            }
            return response;
          },
        },
      ),
    /protection restoration or readback failed/u,
  );
  assert.equal(protection.states.get("main").enforce_admins.enabled, true);
  assert.equal(protection.states.get("staging").enforce_admins.enabled, true);
  assert.deepEqual(events.slice(-2), [
    "protection:GET:main",
    "protection:GET:staging",
  ]);
});

test("unexpected staging actor restriction fails before bypass opens", () => {
  const events = [];
  const protection = githubProtectionApiFixture(events);
  protection.states.get("staging").restrictions.users[0].login =
    "unexpected-actor";
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: () => ({
            viewer: { login: EXPECTED_GITHUB_PROMOTION_ACTOR },
            repository: {
              id: "R_fixture",
              nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
            },
          }),
          runProtectionRequest: protection.run,
        },
      ),
    /staging protection does not match/u,
  );
  assert.deepEqual(events, ["protection:GET:main", "protection:GET:staging"]);
});

test("unexpected promotion actor fails before protection is changed", () => {
  let protectionCalls = 0;
  assert.throws(
    () =>
      updateGithubRefsAtomically(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
        },
        {
          runGraphql: () => ({
            viewer: { login: "unexpected-actor" },
            repository: {
              id: "R_fixture",
              nameWithOwner: EXPECTED_GITHUB_REPOSITORY,
            },
          }),
          runProtectionRequest: () => {
            protectionCalls += 1;
          },
        },
      ),
    /promotion actor mismatch/u,
  );
  assert.equal(protectionCalls, 0);
});

test("staging deployment dispatch is exact-SHA and confirmation bound", () => {
  const approvedMain = "a".repeat(40);
  const calls = [];
  const result = dispatchStagingDeployment(approvedMain, {
    repoDir: repoRoot,
    env: { FIELDGRID_TEST: "true" },
    runDispatch: (payload, context) => {
      calls.push({ payload, context });
      return true;
    },
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    {
      payload: {
        ref: "staging",
        inputs: {
          expected_staging_sha: approvedMain,
          confirmation: STAGING_DEPLOY_CONFIRMATION,
        },
      },
      context: {
        repoDir: repoRoot,
        env: { FIELDGRID_TEST: "true" },
      },
    },
  ]);
  assert.throws(
    () => dispatchStagingDeployment("not-a-sha", { runDispatch: () => true }),
    /deployment SHA is invalid/u,
  );
});

test("provider update failure never dispatches deployment", () => {
  const fixture = makeFixture();
  try {
    let dispatchCalls = 0;
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
          runPromotionEvidenceGate: () => true,
          updateRemoteRefs: () => {
            throw new Error("provider transaction failed");
          },
          dispatchDeployment: () => {
            dispatchCalls += 1;
            return true;
          },
        }),
      /provider transaction failed/u,
    );
    assert.equal(dispatchCalls, 0);
    assert.equal(remoteRef(fixture.remote, "staging"), fixture.stagingSha);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a concurrent main advance during evidence validation aborts atomically", () => {
  const fixture = makeFixture();
  try {
    const stagingBefore = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
          runPromotionEvidenceGate: () => {
            writeFileSync(join(fixture.seed, "release.txt"), "newer main\n");
            git(fixture.seed, ["add", "release.txt"]);
            git(fixture.seed, ["commit", "-m", "concurrent main advance"]);
            git(fixture.seed, ["push", "origin", "main"]);
            return true;
          },
          updateRemoteRefs: updateFixtureRefsAtomically(fixture),
        }),
      Error,
    );
    assert.notEqual(remoteRef(fixture.remote, "main"), fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "staging"), stagingBefore);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a concurrent main rollback during evidence validation aborts atomically", () => {
  const fixture = makeFixture();
  try {
    const stagingBefore = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
          runPromotionEvidenceGate: () => {
            git(fixture.remote, [
              "update-ref",
              "refs/heads/main",
              fixture.stagingSha,
              fixture.mainSha,
            ]);
            return true;
          },
          updateRemoteRefs: updateFixtureRefsAtomically(fixture),
        }),
      Error,
    );
    assert.equal(remoteRef(fixture.remote, "main"), fixture.stagingSha);
    assert.equal(remoteRef(fixture.remote, "staging"), stagingBefore);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a concurrent staging advance during evidence validation aborts atomically", () => {
  const fixture = makeFixture();
  try {
    let concurrentStaging = "";
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
          runPromotionEvidenceGate: () => {
            git(fixture.seed, [
              "switch",
              "-c",
              "concurrent-staging",
              fixture.stagingSha,
            ]);
            writeFileSync(
              join(fixture.seed, "release.txt"),
              "concurrent staging\n",
            );
            git(fixture.seed, ["add", "release.txt"]);
            git(fixture.seed, ["commit", "-m", "concurrent staging advance"]);
            concurrentStaging = git(fixture.seed, ["rev-parse", "HEAD"]);
            git(fixture.seed, ["push", "origin", "HEAD:staging"]);
            return true;
          },
          updateRemoteRefs: updateFixtureRefsAtomically(fixture),
        }),
      Error,
    );
    assert.equal(remoteRef(fixture.remote, "main"), fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "staging"), concurrentStaging);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("strict semantic evidence failure leaves remote staging unchanged", () => {
  const fixture = makeFixture();
  try {
    const before = remoteRef(fixture.remote, "staging");
    let evidenceGateCalls = 0;
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
          runPromotionEvidenceGate: (refs) => {
            evidenceGateCalls += 1;
            assert.deepEqual(refs, {
              approvedMain: fixture.mainSha,
              expectedStaging: fixture.stagingSha,
              preflightRunId: "123456789",
            });
            assert.equal(remoteRef(fixture.remote, "staging"), before);
            throw new Error("strict evidence rejected");
          },
        }),
      /strict evidence rejected/u,
    );
    assert.equal(evidenceGateCalls, 1);
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stale staging SHA is rejected without moving a ref", () => {
  const fixture = makeFixture();
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(
          { ...validOptions(fixture), expectedStaging: "c".repeat(40) },
          { repoDir: fixture.operator },
        ),
      /origin\/staging changed/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stale main SHA is rejected without moving a ref", () => {
  const fixture = makeFixture();
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(
          { ...validOptions(fixture), approvedMain: "d".repeat(40) },
          { repoDir: fixture.operator },
        ),
      /origin\/main changed/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a checkout at a different SHA is rejected without moving staging", () => {
  const fixture = makeFixture();
  try {
    git(fixture.operator, ["switch", "-c", "local-staging", "origin/staging"]);
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
        }),
      /HEAD is not the approved main SHA/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("tracked checkout changes are rejected without moving staging", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(join(fixture.operator, "release.txt"), "dirty checkout\n");
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
        }),
      /tracked changes/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("non-ancestor staging is rejected without moving a ref", () => {
  const fixture = makeFixture({ unrelatedMain: true });
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
        }),
      /not an ancestor/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("forced-update arguments are rejected", () => {
  assert.throws(() => parseArgs(["--force"]), /forbidden/u);
  assert.throws(
    () => parseArgs(["--force-with-lease", "origin"]),
    /forbidden/u,
  );
  assert.throws(
    () => parseArgs(["--force-with-lease=refs\/heads\/staging:abc"]),
    /forbidden/u,
  );
});

test("release sources and production targets are rejected", () => {
  const base = {
    source: "main",
    target: "staging",
    approvedMain: "a".repeat(40),
    expectedStaging: "b".repeat(40),
    preflightRunId: "123456789",
    confirmation: CONFIRMATION,
  };
  assert.throws(
    () => assertPromotionContract({ ...base, source: "release/phase2" }),
    /release branches are forbidden/u,
  );
  assert.throws(
    () => assertPromotionContract({ ...base, target: "production" }),
    /production is forbidden/u,
  );
});

test("run promotion requires one positive authenticated preflight run ID", () => {
  const base = {
    source: "main",
    target: "staging",
    approvedMain: "a".repeat(40),
    expectedStaging: "b".repeat(40),
    preflightRunId: "123456789",
    confirmation: CONFIRMATION,
  };
  assert.equal(
    parseArgs(["--preflight-run-id", "987654321"]).preflightRunId,
    "987654321",
  );
  assert.equal(assertPromotionContract(base), true);
  assert.throws(
    () => assertPromotionContract({ ...base, preflightRunId: "" }),
    /preflight-run-id/u,
  );
  assert.throws(
    () => assertPromotionContract({ ...base, preflightRunId: "0" }),
    /preflight-run-id/u,
  );
  assert.throws(
    () => assertPromotionContract({ ...base, preflightRunId: "12x" }),
    /preflight-run-id/u,
  );
  assert.equal(
    assertPromotionContract(parseArgs(["--check"]), {
      requireRunInputs: false,
    }),
    true,
    "the static check remains offline and needs no workflow run",
  );
});

test("authenticated preflight artifact selection binds every GitHub trust signal", () => {
  const fixture = githubEvidenceFixture();
  assert.equal(
    selectAuthenticatedPreflightArtifact(fixture, fixture).id,
    fixture.artifact.id,
  );

  const rejected = [
    [
      "workflow path",
      (copy) => (copy.run.path = ".github/workflows/deploy.yml"),
    ],
    ["event", (copy) => (copy.run.event = "push")],
    ["branch", (copy) => (copy.run.head_branch = "staging")],
    ["head SHA", (copy) => (copy.run.head_sha = "f".repeat(40))],
    ["conclusion", (copy) => (copy.run.conclusion = "failure")],
    ["repository", (copy) => (copy.run.repository.full_name = "attacker/fork")],
    [
      "expired artifact",
      (copy) => (copy.artifactsPayload.artifacts[0].expired = true),
    ],
    [
      "artifact digest",
      (copy) => (copy.artifactsPayload.artifacts[0].digest = "sha256:invalid"),
    ],
    [
      "artifact run",
      (copy) => (copy.artifactsPayload.artifacts[0].workflow_run.id = 1),
    ],
    [
      "artifact branch",
      (copy) =>
        (copy.artifactsPayload.artifacts[0].workflow_run.head_branch =
          "staging"),
    ],
    [
      "artifact head",
      (copy) =>
        (copy.artifactsPayload.artifacts[0].workflow_run.head_sha = "e".repeat(
          40,
        )),
    ],
    [
      "download URL",
      (copy) =>
        (copy.artifactsPayload.artifacts[0].archive_download_url =
          "https://example.invalid/evidence.zip"),
    ],
    ["stale run", (copy) => (copy.run.updated_at = "2026-09-08T06:00:00.000Z")],
  ];

  for (const [label, mutate] of rejected) {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(
      () => selectAuthenticatedPreflightArtifact(copy, copy),
      Error,
      label,
    );
  }

  const duplicate = structuredClone(fixture);
  duplicate.artifactsPayload.artifacts.push(
    structuredClone(duplicate.artifactsPayload.artifacts[0]),
  );
  assert.throws(
    () => selectAuthenticatedPreflightArtifact(duplicate, duplicate),
    /duplicated/u,
  );
});

test("authenticated acquisition verifies API endpoints and downloaded digest", () => {
  const fixture = githubEvidenceFixture();
  const endpoints = [];
  let materializedRoot = "";
  const acquired = acquireAuthenticatedPreflightEvidence(fixture, {
    nowMs: fixture.nowMs,
    readGithubJson: (endpoint) => {
      endpoints.push(endpoint);
      return endpoint.includes("/artifacts?")
        ? fixture.artifactsPayload
        : fixture.run;
    },
    readGithubBytes: (endpoint) => {
      endpoints.push(endpoint);
      return fixture.archiveBytes;
    },
    materializeArchive: (archivePath, evidenceRoot) => {
      assert.deepEqual(readFileSync(archivePath), fixture.archiveBytes);
      materializedRoot = evidenceRoot;
      return [];
    },
  });
  try {
    assert.equal(acquired.evidenceRoot, materializedRoot);
    assert.equal(acquired.artifactId, fixture.artifact.id);
    assert.equal(acquired.artifactDigest, fixture.artifact.digest);
    assert.equal(existsSync(acquired.evidenceRoot), true);
    assert.deepEqual(endpoints, [
      `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/runs/${fixture.preflightRunId}`,
      `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/runs/${fixture.preflightRunId}/artifacts?per_page=100`,
      `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/artifacts/${fixture.artifact.id}/zip`,
    ]);
  } finally {
    acquired.dispose();
  }
  assert.equal(existsSync(materializedRoot), false);

  const tampered = Buffer.from(fixture.archiveBytes);
  tampered[0] ^= 0xff;
  let materializeCalls = 0;
  assert.throws(
    () =>
      acquireAuthenticatedPreflightEvidence(fixture, {
        nowMs: fixture.nowMs,
        readGithubJson: (endpoint) =>
          endpoint.includes("/artifacts?")
            ? fixture.artifactsPayload
            : fixture.run,
        readGithubBytes: () => tampered,
        materializeArchive: () => {
          materializeCalls += 1;
        },
      }),
    /digest does not match GitHub/u,
  );
  assert.equal(materializeCalls, 0);
});

test("authenticated archive materialization accepts only bounded expected JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-phase2e-extract-"));
  const archivePath = join(root, "artifact.zip");
  writeFileSync(archivePath, "fixture", "utf8");
  const entries = [
    "artifacts/",
    "artifacts/phase2e-staging-preflight/phase2e-staging-preflight.json",
    "staging-smoke/smoke.json",
    "migration-smoke/migration.json",
  ];
  try {
    const extracted = materializeAuthenticatedEvidenceArchive(
      archivePath,
      root,
      { runUnzip: fakeUnzip(entries) },
    );
    assert.deepEqual(extracted, [
      "phase2e-staging-preflight/phase2e-staging-preflight.json",
      "staging-smoke/smoke.json",
      "migration-smoke/migration.json",
    ]);
    for (const path of extracted) {
      assert.equal(existsSync(join(root, "artifacts", path)), true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authenticated archive materialization rejects unsafe or incomplete layouts", () => {
  const required = [
    "phase2e-staging-preflight/phase2e-staging-preflight.json",
    "staging-smoke/smoke.json",
    "migration-smoke/migration.json",
  ];
  const cases = [
    ["traversal", [...required, "staging-smoke/../escape.json"]],
    ["absolute", [...required, "/staging-smoke/escape.json"]],
    ["backslash", [...required, "staging-smoke\\escape.json"]],
    ["empty segment", [...required, "staging-smoke//escape.json"]],
    ["unexpected", [...required, "other/evidence.json"]],
    ["non-JSON", [...required, "staging-smoke/payload.sh"]],
    [
      "normalized duplicate",
      [...required, "artifacts/staging-smoke/smoke.json"],
    ],
    [
      "missing staging smoke",
      required.filter((entry) => !entry.startsWith("staging-smoke/")),
    ],
  ];

  for (const [label, entries] of cases) {
    const root = mkdtempSync(join(tmpdir(), "fieldgrid-phase2e-reject-"));
    const archivePath = join(root, "artifact.zip");
    writeFileSync(archivePath, "fixture", "utf8");
    try {
      assert.throws(
        () =>
          materializeAuthenticatedEvidenceArchive(archivePath, root, {
            runUnzip: fakeUnzip(entries),
          }),
        Error,
        label,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const oversizedRoot = mkdtempSync(
    join(tmpdir(), "fieldgrid-phase2e-oversized-"),
  );
  const oversizedArchive = join(oversizedRoot, "artifact.zip");
  writeFileSync(oversizedArchive, "fixture", "utf8");
  try {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
    assert.throws(
      () =>
        materializeAuthenticatedEvidenceArchive(
          oversizedArchive,
          oversizedRoot,
          {
            runUnzip: fakeUnzip(required, {
              "staging-smoke/smoke.json": oversized,
            }),
          },
        ),
      /safely/u,
    );
  } finally {
    rmSync(oversizedRoot, { recursive: true, force: true });
  }
});

test("strict gate uses only isolated authenticated evidence and always disposes it", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "fieldgrid-local-evidence-"));
  const evidenceRoot = mkdtempSync(
    join(tmpdir(), "fieldgrid-authenticated-evidence-"),
  );
  mkdirSync(join(repoDir, "artifacts", "staging-smoke"), {
    recursive: true,
  });
  writeFileSync(
    join(repoDir, "artifacts", "staging-smoke", "forged.json"),
    "{}\n",
    "utf8",
  );
  let disposed = false;
  try {
    assert.equal(
      runStrictPromotionEvidenceGate(
        {
          approvedMain: "a".repeat(40),
          expectedStaging: "b".repeat(40),
          preflightRunId: "123456789",
        },
        {
          repoDir,
          acquireEvidence: () => ({
            evidenceRoot,
            dispose() {
              disposed = true;
            },
          }),
          spawnEvidenceGate: (command, args, options) => {
            assert.equal(command, process.execPath);
            assert.equal(options.cwd, repoDir);
            const rootIndex = args.indexOf("--evidence-root");
            assert.ok(rootIndex >= 0);
            assert.equal(args[rootIndex + 1], evidenceRoot);
            assert.equal(
              args.includes(join(repoDir, "artifacts")),
              false,
              "locally forged evidence is never passed to the gate",
            );
            return { error: null, status: 0 };
          },
        },
      ),
      true,
    );
    assert.equal(disposed, true);

    disposed = false;
    assert.throws(
      () =>
        runStrictPromotionEvidenceGate(
          {
            approvedMain: "a".repeat(40),
            expectedStaging: "b".repeat(40),
            preflightRunId: "123456789",
          },
          {
            repoDir,
            acquireEvidence: () => ({
              evidenceRoot,
              dispose() {
                disposed = true;
              },
            }),
            spawnEvidenceGate: () => ({ error: null, status: 1 }),
          },
        ),
      /semantic promotion evidence failed/u,
    );
    assert.equal(disposed, true);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
});

test("Phase 2E preflight check does not move main or staging", () => {
  const fixture = makeFixture();
  try {
    const beforeMain = remoteRef(fixture.remote, "main");
    const beforeStaging = remoteRef(fixture.remote, "staging");
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, "scripts/fieldgrid-phase2e-staging-preflight.mjs"),
        "--check",
      ],
      { cwd: fixture.operator, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(remoteRef(fixture.remote, "main"), beforeMain);
    assert.equal(remoteRef(fixture.remote, "staging"), beforeStaging);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
