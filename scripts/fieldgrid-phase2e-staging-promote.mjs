import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIRMATION = "phase2e-fast-forward-staging";
export const SOURCE_BRANCH = "main";
export const TARGET_BRANCH = "staging";
export const REMOTE = "origin";
export const EXPECTED_GITHUB_REPOSITORY = "veele-services/platform";
export const EXPECTED_GITHUB_PROMOTION_ACTOR = "TIXOCEO";
export const STAGING_DEPLOY_CONFIRMATION = "fieldgrid-staging-deploy-exact-sha";
export const PHASE2E_PREFLIGHT_WORKFLOW_PATH =
  ".github/workflows/phase2e-staging-preflight.yml";
export const PHASE2E_PREFLIGHT_RUN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const MAX_PREFLIGHT_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_PREFLIGHT_EXTRACTED_BYTES = 50 * 1024 * 1024;
const MAX_PREFLIGHT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PREFLIGHT_ARCHIVE_ENTRIES = 256;
const ALLOWED_EVIDENCE_PREFIXES = Object.freeze([
  "phase2e-staging-preflight/",
  "staging-smoke/",
  "migration-smoke/",
]);

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FORBIDDEN_UPDATE_ARGUMENTS = new Set(["--force", "--force-with-lease"]);
const PROMOTION_BRANCHES = Object.freeze([SOURCE_BRANCH, TARGET_BRANCH]);
const EXPECTED_PROTECTION_CHECKS = Object.freeze({
  [SOURCE_BRANCH]: "Main exact-head gate",
  [TARGET_BRANCH]: "Backup, restore and migration rehearsal",
});
const GITHUB_ACTIONS_APP_ID = 15368;

export function isFullSha(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

export function isRunId(value) {
  return /^[1-9][0-9]{0,19}$/u.test(String(value ?? ""));
}

function takeValue(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${argument} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const options = {
    check: false,
    run: false,
    source: SOURCE_BRANCH,
    target: TARGET_BRANCH,
    approvedMain: "",
    expectedStaging: "",
    preflightRunId: "",
    confirmation: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const argumentName = argument.split("=", 1)[0];
    if (FORBIDDEN_UPDATE_ARGUMENTS.has(argumentName))
      throw new Error(
        `${argumentName} is forbidden by the staging promotion contract`,
      );

    switch (argument) {
      case "--check":
        options.check = true;
        break;
      case "--run":
        options.run = true;
        break;
      case "--source":
        options.source = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--target":
        options.target = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--approved-main":
        options.approvedMain = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--expected-staging":
        options.expectedStaging = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--preflight-run-id":
        options.preflightRunId = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--confirm":
        options.confirmation = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }

  return options;
}

export function assertPromotionContract(
  options,
  { requireRunInputs = true } = {},
) {
  if (options.source !== SOURCE_BRANCH) {
    if (options.source.startsWith("release/"))
      throw new Error(
        "release branches are forbidden as a staging promotion source",
      );
    throw new Error(`promotion source must be ${SOURCE_BRANCH}`);
  }
  if (options.target === "production")
    throw new Error("production is forbidden as a Phase 2E promotion target");
  if (options.target !== TARGET_BRANCH)
    throw new Error(`promotion target must be ${TARGET_BRANCH}`);

  if (!requireRunInputs) return true;
  if (!isFullSha(options.approvedMain))
    throw new Error(
      "--approved-main must be a lowercase 40-character commit SHA",
    );
  if (!isFullSha(options.expectedStaging))
    throw new Error(
      "--expected-staging must be a lowercase 40-character commit SHA",
    );
  if (!isRunId(options.preflightRunId))
    throw new Error("--preflight-run-id must be a positive GitHub run ID");
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`--confirm must equal ${CONFIRMATION}`);
  return true;
}

function gitResult(repoDir, args) {
  return spawnSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(repoDir, args) {
  const result = gitResult(repoDir, args);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (
      result.stderr ||
      result.stdout ||
      "Git command failed"
    ).trim();
    throw new Error(detail);
  }
  return result.stdout.trim();
}

export function buildAtomicRefUpdates(approvedMain, expectedStaging) {
  if (!isFullSha(approvedMain)) throw new Error("approved main SHA is invalid");
  if (!isFullSha(expectedStaging))
    throw new Error("expected staging SHA is invalid");
  return [
    {
      name: `refs/heads/${SOURCE_BRANCH}`,
      beforeOid: approvedMain,
      afterOid: approvedMain,
      force: false,
    },
    {
      name: `refs/heads/${TARGET_BRANCH}`,
      beforeOid: expectedStaging,
      afterOid: approvedMain,
      force: false,
    },
  ];
}

function authenticatedGithubGraphql(query, variables, { repoDir, env }) {
  const result = spawnSync(
    "gh",
    ["api", "graphql", "--hostname", "github.com", "--input", "-"],
    {
      cwd: repoDir,
      encoding: "utf8",
      env,
      input: JSON.stringify({ query, variables }),
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Authenticated GitHub ref transaction failed.");
  }
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub GraphQL response was not valid JSON.");
  }
  if (response.errors?.length) {
    throw new Error("GitHub rejected the atomic ref transaction.");
  }
  return response.data;
}

function authenticatedGithubProtectionRequest(
  method,
  branch,
  { repoDir, env },
) {
  if (!["GET", "DELETE", "POST"].includes(method)) {
    throw new Error("GitHub protection method is invalid.");
  }
  if (!PROMOTION_BRANCHES.includes(branch)) {
    throw new Error("GitHub protection branch is invalid.");
  }
  const suffix = method === "GET" ? "" : "/enforce_admins";
  const endpoint = `repos/${EXPECTED_GITHUB_REPOSITORY}/branches/${branch}/protection${suffix}`;
  const result = spawnSync(
    "gh",
    ["api", "--hostname", "github.com", "--method", method, endpoint],
    {
      cwd: repoDir,
      encoding: "utf8",
      env,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Authenticated GitHub protection request failed.");
  }
  if (method !== "GET") return true;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub protection response was not valid JSON.");
  }
}

export function promotionProtectionState(branch, protection) {
  if (!PROMOTION_BRANCHES.includes(branch) || !protection) {
    throw new Error("GitHub protection state is invalid.");
  }
  const reviews = protection.required_pull_request_reviews;
  const restrictions = protection.restrictions;
  return {
    branch,
    enforceAdmins: protection.enforce_admins?.enabled === true,
    strictStatusChecks: protection.required_status_checks?.strict === true,
    checks: (protection.required_status_checks?.checks ?? [])
      .map(({ context, app_id: appId }) => ({ context, appId }))
      .sort((left, right) => left.context.localeCompare(right.context)),
    reviews:
      reviews === null || reviews === undefined
        ? null
        : {
            dismissStaleReviews: reviews.dismiss_stale_reviews === true,
            requireCodeOwnerReviews:
              reviews.require_code_owner_reviews === true,
            requireLastPushApproval:
              reviews.require_last_push_approval === true,
            requiredApprovingReviewCount:
              reviews.required_approving_review_count,
          },
    restrictions:
      restrictions === null || restrictions === undefined
        ? null
        : {
            users: (restrictions.users ?? []).map(({ login }) => login).sort(),
            teams: (restrictions.teams ?? []).map(({ slug }) => slug).sort(),
            apps: (restrictions.apps ?? []).map(({ slug }) => slug).sort(),
          },
    requiredLinearHistory: protection.required_linear_history?.enabled === true,
    requiredConversationResolution:
      protection.required_conversation_resolution?.enabled === true,
    allowForcePushes: protection.allow_force_pushes?.enabled === true,
    allowDeletions: protection.allow_deletions?.enabled === true,
    blockCreations: protection.block_creations?.enabled === true,
    lockBranch: protection.lock_branch?.enabled === true,
  };
}

export function assertPromotionProtectionState(
  state,
  { enforceAdmins = true } = {},
) {
  const expectedReviews =
    state.branch === SOURCE_BRANCH
      ? {
          dismissStaleReviews: true,
          requireCodeOwnerReviews: false,
          requireLastPushApproval: true,
          requiredApprovingReviewCount: 1,
        }
      : null;
  const expectedRestrictions =
    state.branch === TARGET_BRANCH
      ? { users: [EXPECTED_GITHUB_PROMOTION_ACTOR], teams: [], apps: [] }
      : null;
  const expected = {
    branch: state.branch,
    enforceAdmins,
    strictStatusChecks: true,
    checks: [
      {
        context: EXPECTED_PROTECTION_CHECKS[state.branch],
        appId: GITHUB_ACTIONS_APP_ID,
      },
    ],
    reviews: expectedReviews,
    restrictions: expectedRestrictions,
    requiredLinearHistory: true,
    requiredConversationResolution: true,
    allowForcePushes: false,
    allowDeletions: false,
    blockCreations: false,
    lockBranch: false,
  };
  if (JSON.stringify(state) !== JSON.stringify(expected)) {
    throw new Error(
      `GitHub ${state.branch} protection does not match the promotion contract.`,
    );
  }
  return true;
}

export function withScopedPromotionAdminBypass(
  operation,
  {
    repoDir = repoRoot,
    env = process.env,
    runProtectionRequest = authenticatedGithubProtectionRequest,
  } = {},
) {
  const context = { repoDir, env };
  const originalStates = new Map();
  for (const branch of PROMOTION_BRANCHES) {
    const state = promotionProtectionState(
      branch,
      runProtectionRequest("GET", branch, context),
    );
    assertPromotionProtectionState(state);
    originalStates.set(branch, state);
  }

  let operationError;
  let operationResult;
  let cleanupError;
  try {
    for (const branch of PROMOTION_BRANCHES) {
      runProtectionRequest("DELETE", branch, context);
    }
    for (const branch of PROMOTION_BRANCHES) {
      const openState = promotionProtectionState(
        branch,
        runProtectionRequest("GET", branch, context),
      );
      assertPromotionProtectionState(openState, { enforceAdmins: false });
    }
    operationResult = operation();
  } catch (error) {
    operationError = error;
  } finally {
    const restoreFailures = [];
    for (const branch of [...PROMOTION_BRANCHES].reverse()) {
      try {
        runProtectionRequest("POST", branch, context);
      } catch {
        restoreFailures.push(branch);
      }
    }
    const readbackFailures = [];
    for (const branch of PROMOTION_BRANCHES) {
      try {
        const restoredState = promotionProtectionState(
          branch,
          runProtectionRequest("GET", branch, context),
        );
        assertPromotionProtectionState(restoredState);
        if (
          JSON.stringify(restoredState) !==
          JSON.stringify(originalStates.get(branch))
        ) {
          readbackFailures.push(branch);
        }
      } catch {
        readbackFailures.push(branch);
      }
    }
    if (restoreFailures.length > 0 || readbackFailures.length > 0) {
      cleanupError = new Error(
        "GitHub promotion protection restoration or readback failed; deployment was not dispatched.",
      );
    }
  }

  if (cleanupError) throw cleanupError;
  if (operationError) throw operationError;
  return operationResult;
}

export function updateGithubRefsAtomically(
  { approvedMain, expectedStaging },
  {
    repoDir = repoRoot,
    env = process.env,
    runGraphql = authenticatedGithubGraphql,
    runProtectionRequest = authenticatedGithubProtectionRequest,
  } = {},
) {
  const [owner, name, extra] = EXPECTED_GITHUB_REPOSITORY.split("/");
  if (!owner || !name || extra) {
    throw new Error("Expected GitHub repository identity is invalid.");
  }
  const repositoryQuery = `
    query FieldgridPromotionRepository($owner: String!, $name: String!) {
      viewer {
        login
      }
      repository(owner: $owner, name: $name) {
        id
        nameWithOwner
      }
    }
  `;
  const repositoryData = runGraphql(
    repositoryQuery,
    { owner, name },
    { repoDir, env },
  );
  const repository = repositoryData?.repository;
  if (
    !repository?.id ||
    repository.nameWithOwner !== EXPECTED_GITHUB_REPOSITORY
  ) {
    throw new Error("Authenticated GitHub repository identity mismatch.");
  }
  if (repositoryData?.viewer?.login !== EXPECTED_GITHUB_PROMOTION_ACTOR) {
    throw new Error("Authenticated GitHub promotion actor mismatch.");
  }

  const clientMutationId = `fieldgrid-phase2e-${approvedMain}`;
  const mutation = `
    mutation FieldgridAtomicPromotion($input: UpdateRefsInput!) {
      updateRefs(input: $input) {
        clientMutationId
      }
    }
  `;
  return withScopedPromotionAdminBypass(
    () => {
      const mutationData = runGraphql(
        mutation,
        {
          input: {
            repositoryId: repository.id,
            clientMutationId,
            refUpdates: buildAtomicRefUpdates(approvedMain, expectedStaging),
          },
        },
        { repoDir, env },
      );
      if (mutationData?.updateRefs?.clientMutationId !== clientMutationId) {
        throw new Error("GitHub did not confirm the atomic ref transaction.");
      }
      return true;
    },
    { repoDir, env, runProtectionRequest },
  );
}

function authenticatedStagingDeploymentDispatch(payload, { repoDir, env }) {
  const result = spawnSync(
    "gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/workflows/deploy.yml/dispatches`,
      "--input",
      "-",
    ],
    {
      cwd: repoDir,
      encoding: "utf8",
      env,
      input: JSON.stringify(payload),
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Authenticated staging deployment dispatch failed.");
  }
  return true;
}

export function dispatchStagingDeployment(
  approvedMain,
  {
    repoDir = repoRoot,
    env = process.env,
    runDispatch = authenticatedStagingDeploymentDispatch,
  } = {},
) {
  if (!isFullSha(approvedMain)) {
    throw new Error("staging deployment SHA is invalid");
  }
  return runDispatch(
    {
      ref: TARGET_BRANCH,
      inputs: {
        expected_staging_sha: approvedMain,
        confirmation: STAGING_DEPLOY_CONFIRMATION,
      },
    },
    { repoDir, env },
  );
}

function assertExactRef(actual, expected, branch) {
  if (actual !== expected)
    throw new Error(
      `origin/${branch} changed: expected ${expected}, received ${actual}`,
    );
}

function githubApiResult(endpoint, { repoDir, env, binary = false }) {
  return spawnSync("gh", ["api", "--hostname", "github.com", endpoint], {
    cwd: repoDir,
    encoding: binary ? null : "utf8",
    env,
    maxBuffer: binary ? MAX_PREFLIGHT_ARCHIVE_BYTES + 1 : 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function authenticatedGithubJson(endpoint, context) {
  const result = githubApiResult(endpoint, context);
  if (result.error || result.status !== 0) {
    throw new Error("Authenticated GitHub Actions metadata lookup failed.");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub Actions metadata was not valid JSON.");
  }
}

function authenticatedGithubBytes(endpoint, context) {
  const result = githubApiResult(endpoint, { ...context, binary: true });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("Authenticated GitHub Actions artifact download failed.");
  }
  return result.stdout;
}

function assertFreshGithubTimestamp(value, nowMs) {
  const timestampMs = Date.parse(value ?? "");
  if (
    !Number.isFinite(timestampMs) ||
    timestampMs > nowMs + 5 * 60 * 1000 ||
    nowMs - timestampMs > PHASE2E_PREFLIGHT_RUN_MAX_AGE_MS
  ) {
    throw new Error("GitHub Phase2E preflight run is stale or future-dated.");
  }
}

export function selectAuthenticatedPreflightArtifact(
  { approvedMain, preflightRunId },
  { run, artifactsPayload, nowMs = Date.now() },
) {
  if (!isFullSha(approvedMain) || !isRunId(preflightRunId)) {
    throw new Error("Authenticated Phase2E evidence inputs are invalid.");
  }
  if (
    String(run?.id) !== String(preflightRunId) ||
    run?.name !== "Phase 2E Staging Promotion Preflight" ||
    run?.path !== PHASE2E_PREFLIGHT_WORKFLOW_PATH ||
    run?.event !== "workflow_dispatch" ||
    run?.head_branch !== SOURCE_BRANCH ||
    run?.head_sha !== approvedMain ||
    run?.status !== "completed" ||
    run?.conclusion !== "success" ||
    !Number.isSafeInteger(run?.run_attempt) ||
    run.run_attempt < 1 ||
    run?.repository?.full_name !== EXPECTED_GITHUB_REPOSITORY ||
    !Number.isSafeInteger(run?.repository?.id) ||
    run.repository.id < 1
  ) {
    throw new Error(
      "GitHub run does not prove a successful exact-main Phase2E preflight.",
    );
  }
  assertFreshGithubTimestamp(run.updated_at, nowMs);

  const expectedName = `phase2e-staging-preflight-${preflightRunId}-${approvedMain}`;
  const artifacts = Array.isArray(artifactsPayload?.artifacts)
    ? artifactsPayload.artifacts.filter(
        (candidate) => candidate?.name === expectedName,
      )
    : [];
  const artifact = artifacts[0];
  const expectedArchiveUrl = `https://api.github.com/repos/${EXPECTED_GITHUB_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (
    artifacts.length !== 1 ||
    !Number.isSafeInteger(artifact?.id) ||
    artifact.id < 1 ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes > MAX_PREFLIGHT_ARCHIVE_BYTES ||
    artifact.archive_download_url !== expectedArchiveUrl ||
    !/^sha256:[0-9a-f]{64}$/u.test(artifact.digest ?? "") ||
    String(artifact.workflow_run?.id) !== String(preflightRunId) ||
    artifact.workflow_run?.head_branch !== SOURCE_BRANCH ||
    artifact.workflow_run?.head_sha !== approvedMain ||
    artifact.workflow_run?.repository_id !== run.repository.id
  ) {
    throw new Error(
      "GitHub Phase2E artifact is missing, duplicated, expired or not bound to the exact run.",
    );
  }
  assertFreshGithubTimestamp(artifact.updated_at, nowMs);
  return artifact;
}

const PYTHON_ZIP_COMMAND = String.raw`import os
import sys
import zipfile

mode = sys.argv[1]
archive_path = os.environ["FIELDGRID_ZIP_ARCHIVE_PATH"]
entry = os.environ.get("FIELDGRID_ZIP_ENTRY", "")
with zipfile.ZipFile(archive_path) as archive:
    if mode == "list":
        sys.stdout.write("\n".join(archive.namelist()))
    elif mode == "read" and entry:
        sys.stdout.buffer.write(archive.read(entry))
    else:
        raise SystemExit("invalid zip operation")
`;

function unzipResult(archivePath, args, { binary = false } = {}) {
  const [operation, entry] = args;
  const pythonOperation =
    operation === "-Z1" ? "list" : operation === "-p" && entry ? "read" : null;
  if (!pythonOperation) {
    return {
      error: new Error("Unsupported ZIP operation."),
      status: null,
      stdout: binary ? null : "",
      stderr: "Unsupported ZIP operation.",
    };
  }
  return spawnSync("python3", ["-c", PYTHON_ZIP_COMMAND, pythonOperation], {
    encoding: binary ? null : "utf8",
    maxBuffer: binary ? MAX_PREFLIGHT_FILE_BYTES + 1 : 1024 * 1024,
    env: {
      ...process.env,
      FIELDGRID_ZIP_ARCHIVE_PATH: archivePath,
      FIELDGRID_ZIP_ENTRY: entry ?? "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizedEvidenceEntry(entry) {
  if (
    !entry ||
    entry.length > 512 ||
    entry.startsWith("/") ||
    entry.startsWith("./") ||
    entry.includes("//") ||
    entry.includes("\\") ||
    !/^[A-Za-z0-9._/-]+$/u.test(entry) ||
    entry.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new Error("Phase2E artifact contains an unsafe archive path.");
  }
  const normalized = entry.startsWith("artifacts/")
    ? entry.slice("artifacts/".length)
    : entry;
  if (
    !ALLOWED_EVIDENCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error("Phase2E artifact contains an unexpected evidence path.");
  }
  return normalized;
}

export function materializeAuthenticatedEvidenceArchive(
  archivePath,
  evidenceRoot,
  { runUnzip = unzipResult } = {},
) {
  const listing = runUnzip(archivePath, ["-Z1"]);
  if (
    listing.error ||
    listing.status !== 0 ||
    typeof listing.stdout !== "string"
  ) {
    throw new Error("Phase2E evidence archive could not be listed.");
  }
  const entries = listing.stdout.split(/\r?\n/u).filter(Boolean);
  if (entries.length === 0 || entries.length > MAX_PREFLIGHT_ARCHIVE_ENTRIES) {
    throw new Error("Phase2E evidence archive has an invalid entry count.");
  }

  const normalizedEntries = new Set();
  const extractedFiles = [];
  let extractedBytes = 0;
  for (const entry of entries) {
    if (entry === "artifacts/") {
      if (normalizedEntries.has(entry)) {
        throw new Error("Phase2E evidence archive contains duplicate paths.");
      }
      normalizedEntries.add(entry);
      continue;
    }
    const isDirectory = entry.endsWith("/");
    const normalized = normalizedEvidenceEntry(entry);
    if (normalizedEntries.has(normalized)) {
      throw new Error("Phase2E evidence archive contains duplicate paths.");
    }
    normalizedEntries.add(normalized);
    if (isDirectory) continue;
    if (!normalized.endsWith(".json")) {
      throw new Error("Phase2E evidence archive contains a non-JSON file.");
    }

    const extracted = runUnzip(archivePath, ["-p", entry], { binary: true });
    if (
      extracted.error ||
      extracted.status !== 0 ||
      !Buffer.isBuffer(extracted.stdout) ||
      extracted.stdout.length < 1 ||
      extracted.stdout.length > MAX_PREFLIGHT_FILE_BYTES
    ) {
      throw new Error("Phase2E evidence file could not be extracted safely.");
    }
    extractedBytes += extracted.stdout.length;
    if (extractedBytes > MAX_PREFLIGHT_EXTRACTED_BYTES) {
      throw new Error(
        "Phase2E evidence archive expands beyond its size limit.",
      );
    }
    const destination = join(evidenceRoot, "artifacts", normalized);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, extracted.stdout, { mode: 0o600 });
    extractedFiles.push(normalized);
  }

  if (
    !extractedFiles.includes(
      "phase2e-staging-preflight/phase2e-staging-preflight.json",
    ) ||
    !extractedFiles.some(
      (entry) => entry.startsWith("staging-smoke/") && entry.endsWith(".json"),
    ) ||
    !extractedFiles.some(
      (entry) =>
        entry.startsWith("migration-smoke/") && entry.endsWith(".json"),
    )
  ) {
    throw new Error(
      "Phase2E artifact does not contain every required evidence class.",
    );
  }
  return extractedFiles;
}

export function acquireAuthenticatedPreflightEvidence(
  { approvedMain, preflightRunId },
  {
    repoDir = repoRoot,
    env = process.env,
    nowMs = Date.now(),
    readGithubJson = authenticatedGithubJson,
    readGithubBytes = authenticatedGithubBytes,
    materializeArchive = materializeAuthenticatedEvidenceArchive,
  } = {},
) {
  const runEndpoint = `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/runs/${preflightRunId}`;
  const artifactsEndpoint = `${runEndpoint}/artifacts?per_page=100`;
  const context = { repoDir, env };
  const run = readGithubJson(runEndpoint, context);
  const artifactsPayload = readGithubJson(artifactsEndpoint, context);
  const artifact = selectAuthenticatedPreflightArtifact(
    { approvedMain, preflightRunId },
    { run, artifactsPayload, nowMs },
  );
  const archiveBytes = readGithubBytes(
    `repos/${EXPECTED_GITHUB_REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
    context,
  );
  if (
    !Buffer.isBuffer(archiveBytes) ||
    archiveBytes.length !== artifact.size_in_bytes ||
    createHash("sha256").update(archiveBytes).digest("hex") !==
      artifact.digest.slice("sha256:".length)
  ) {
    throw new Error(
      "Downloaded Phase2E artifact digest does not match GitHub.",
    );
  }

  const evidenceRoot = mkdtempSync(
    join(tmpdir(), "fieldgrid-authenticated-phase2e-evidence-"),
  );
  chmodSync(evidenceRoot, 0o700);
  try {
    const archivePath = join(evidenceRoot, `artifact-${artifact.id}.zip`);
    writeFileSync(archivePath, archiveBytes, { mode: 0o600 });
    materializeArchive(archivePath, evidenceRoot);
    return {
      artifactDigest: artifact.digest,
      artifactId: artifact.id,
      evidenceRoot,
      dispose() {
        rmSync(evidenceRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(evidenceRoot, { recursive: true, force: true });
    throw error;
  }
}

export function runStrictPromotionEvidenceGate(
  { approvedMain, expectedStaging, preflightRunId },
  {
    repoDir = repoRoot,
    env = process.env,
    acquireEvidence = acquireAuthenticatedPreflightEvidence,
    spawnEvidenceGate = spawnSync,
  } = {},
) {
  const authenticatedEvidence = acquireEvidence(
    { approvedMain, preflightRunId },
    { repoDir, env },
  );
  try {
    const result = spawnEvidenceGate(
      process.execPath,
      [
        "scripts/fieldgrid-staging-promotion-gate.mjs",
        "--strict-evidence",
        "--expected-main",
        approvedMain,
        "--expected-staging",
        expectedStaging,
        "--evidence-root",
        authenticatedEvidence.evidenceRoot,
      ],
      {
        cwd: repoDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        "Strict semantic promotion evidence failed; staging was not promoted.",
      );
    }
    return true;
  } finally {
    authenticatedEvidence.dispose();
  }
}

export function promoteExactMainToStaging(
  options,
  {
    repoDir = repoRoot,
    env = process.env,
    runPromotionEvidenceGate = runStrictPromotionEvidenceGate,
    updateRemoteRefs = updateGithubRefsAtomically,
    dispatchDeployment = dispatchStagingDeployment,
  } = {},
) {
  assertPromotionContract(options);

  git(repoDir, [
    "fetch",
    "--prune",
    REMOTE,
    `refs/heads/${SOURCE_BRANCH}:refs/remotes/${REMOTE}/${SOURCE_BRANCH}`,
    `refs/heads/${TARGET_BRANCH}:refs/remotes/${REMOTE}/${TARGET_BRANCH}`,
  ]);

  const currentMain = git(repoDir, [
    "rev-parse",
    `refs/remotes/${REMOTE}/${SOURCE_BRANCH}`,
  ]);
  const currentStaging = git(repoDir, [
    "rev-parse",
    `refs/remotes/${REMOTE}/${TARGET_BRANCH}`,
  ]);
  assertExactRef(currentMain, options.approvedMain, SOURCE_BRANCH);
  assertExactRef(currentStaging, options.expectedStaging, TARGET_BRANCH);

  const checkoutHead = git(repoDir, ["rev-parse", "HEAD"]);
  if (checkoutHead !== options.approvedMain) {
    throw new Error("local checkout HEAD is not the approved main SHA");
  }
  const trackedChanges = git(repoDir, [
    "status",
    "--porcelain=v1",
    "--untracked-files=no",
  ]);
  if (trackedChanges) {
    throw new Error("local checkout has tracked changes");
  }

  const ancestor = gitResult(repoDir, [
    "merge-base",
    "--is-ancestor",
    options.expectedStaging,
    options.approvedMain,
  ]);
  if (ancestor.error) throw ancestor.error;
  if (ancestor.status !== 0)
    throw new Error(
      "expected staging SHA is not an ancestor of the approved main SHA",
    );

  // This semantic gate is mandatory before any staging push and binds every
  // pre-promotion artifact to the exact refs checked above. The W00 principal
  // gate runs after forward migrations and before activation in deploy.yml, so
  // the first ACL-hardening rollout cannot deadlock on its pre-migration schema.
  runPromotionEvidenceGate(
    {
      approvedMain: options.approvedMain,
      expectedStaging: options.expectedStaging,
      preflightRunId: options.preflightRunId,
    },
    { repoDir, env },
  );

  // GitHub's updateRefs mutation evaluates both beforeOid values and applies
  // both ref updates atomically. Unlike git push, it does not omit the no-op
  // main update, so even an advertise/receive race fails without moving staging.
  updateRemoteRefs(
    {
      approvedMain: options.approvedMain,
      expectedStaging: options.expectedStaging,
    },
    { repoDir, env },
  );

  const remoteLines = git(repoDir, [
    "ls-remote",
    "--exit-code",
    REMOTE,
    `refs/heads/${SOURCE_BRANCH}`,
    `refs/heads/${TARGET_BRANCH}`,
  ]);
  const remoteRefs = new Map(
    remoteLines.split("\n").map((line) => {
      const [sha, ref] = line.trim().split(/\s+/u);
      return [ref, sha];
    }),
  );
  const promotedMain = remoteRefs.get(`refs/heads/${SOURCE_BRANCH}`) ?? "";
  const promotedStaging = remoteRefs.get(`refs/heads/${TARGET_BRANCH}`) ?? "";
  assertExactRef(promotedMain, options.approvedMain, SOURCE_BRANCH);
  assertExactRef(promotedStaging, options.approvedMain, TARGET_BRANCH);

  if (dispatchDeployment(options.approvedMain, { repoDir, env }) !== true) {
    throw new Error("GitHub did not confirm the staging deploy dispatch.");
  }

  return {
    approvedMain: options.approvedMain,
    previousStaging: options.expectedStaging,
    promotedStaging,
    source: SOURCE_BRANCH,
    target: TARGET_BRANCH,
    deploymentDispatched: true,
  };
}

function usage() {
  return [
    "Fieldgrid Phase 2E exact-ref staging promotion",
    "",
    "Usage:",
    "  pnpm fieldgrid:phase2e-staging-promote:check",
    "  pnpm fieldgrid:phase2e-staging-promote --run \\",
    "    --approved-main SHA --expected-staging SHA --preflight-run-id RUN_ID \\",
    `    --confirm ${CONFIRMATION}`,
    "",
    "The run fetches only main and staging, verifies both exact refs and their",
    "fast-forward relationship plus the exact branch-protection contract, then",
    "temporarily disables only admin enforcement in a bounded try/finally block",
    "and performs one GitHub atomic ref transaction. Its beforeOid values keep",
    "main fixed and advance only the expected staging head to the approved SHA.",
    "Required reviews, status checks and staging push restrictions stay enabled.",
    "Admin enforcement is restored and read back before an exact-SHA staging",
    "deployment is explicitly dispatched. Before the ref transaction,",
    "an authenticated GitHub Actions",
    "artifact from the named preflight run and the exact-SHA semantic evidence",
    "gate must pass. The deploy proves W00 least privilege after migrations",
    "and before activation. Production is never a target.",
    "",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.check === options.run)
    throw new Error("choose exactly one of --check or --run");
  assertPromotionContract(options, { requireRunInputs: options.run });
  if (options.check) {
    process.stdout.write(
      "[fieldgrid:phase2e-staging-promote] PASS: main to staging, exact-ref, fast-forward-only contract\n",
    );
    return;
  }

  const result = promoteExactMainToStaging(options);
  process.stdout.write(
    `[fieldgrid:phase2e-staging-promote] PASS: staging moved from ${result.previousStaging} to ${result.promotedStaging}; exact-SHA deploy dispatched\n`,
  );
}

if (resolve(process.argv[1] ?? "") === resolve(scriptPath)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `[fieldgrid:phase2e-staging-promote] FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
