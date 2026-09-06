import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

import {
  assertSafeEvidencePath,
  expectedCommandIds,
  findForbiddenEvidenceOutcomes,
  parseEvidenceArgs,
  runEvidenceCli,
} from "../scripts/fieldgrid-fieldflow-calm-evidence.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(root, path, contents) {
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(root, message) {
  git(root, "add", ".");
  git(
    root,
    "-c",
    "user.name=Fieldflow Test",
    "-c",
    "user.email=fieldflow-test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    message,
  );
  return git(root, "rev-parse", "HEAD");
}

function fixtureRepository() {
  const root = mkdtempSync(resolve(tmpdir(), "fieldflow-calm-evidence-"));
  git(root, "init", "--initial-branch=test");
  const workflow = "name: trusted-fieldflow-evidence\n";
  write(root, ".github/workflows/fieldflow-calm-evidence.yml", workflow);
  write(
    root,
    "docs/uiux/fieldflow-calm-handoff/manifests/acceptance.json",
    `${JSON.stringify({ requirements: [] })}\n`,
  );
  write(
    root,
    "docs/uiux/fieldflow-calm-handoff/manifests/risks.json",
    `${JSON.stringify({ risks: [{ id: "R-001", state: "OPEN" }] })}\n`,
  );
  write(
    root,
    "docs/uiux/fieldflow-calm-handoff/manifests/verification-matrix.json",
    `${JSON.stringify({ requirementBindings: [] })}\n`,
  );
  const base = commit(root, "trusted base");
  write(root, "implementation.txt", "candidate implementation\n");
  const head = commit(root, "implementation");

  const attachmentPath = "outputs/fieldflow-calm/attachments/R-001.junit.xml";
  const attachment = '{"tests":1,"failures":0}\n';
  write(root, attachmentPath, attachment);
  const inputPath = "outputs/fieldflow-calm/input/R-001.runtime.json";
  const payload = {
    schemaVersion: 1,
    subjectId: "R-001",
    headCommit: head,
    coverage: {
      routes: [],
      themes: [],
      viewports: [],
      densities: [],
      commandIds: ["fieldflow-runtime"],
      testIds: ["risk-runtime"],
    },
    assertions: [
      {
        id: "R-001-runtime",
        testId: "risk-runtime",
        status: "passed",
        message: "Tenant-RBAC runtime assertion passed.",
      },
    ],
    summary: { passed: 1, failed: 0, skipped: 0, notRun: 0, manual: 0 },
    errors: { console: [], page: [], request: [], server: [], hydration: [] },
    attachments: [
      { type: "junit", path: attachmentPath, sha256: sha256(attachment) },
    ],
  };
  write(root, inputPath, `${JSON.stringify(payload, null, 2)}\n`);
  const env = {
    FIELDGRID_EXACT_HEAD: head,
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_BASE_SHA: base,
    GITHUB_PR_NUMBER: "449",
    GITHUB_RUN_ID: "34000000000",
    GITHUB_RUN_ATTEMPT: "1",
    FIELDFLOW_CHECK_SUITE_ID: "89000000000",
    FIELDFLOW_JOB_ID: "90000000000",
    FIELDFLOW_JOB_NAME: "Fieldflow Calm evidence",
    GITHUB_EVENT_NAME: "pull_request_target",
    FIELDFLOW_WORKFLOW_BLOB_SHA256: sha256(workflow),
    FIELDFLOW_EXECUTOR_WORKFLOW_SHA: base,
  };
  return { root, head, payload, inputPath, env };
}

test("typed modes require only their contracted flags", () => {
  assert.equal(parseEvidenceArgs(["--mode", "runtime"]).mode, "runtime");
  assert.equal(
    parseEvidenceArgs(["--mode", "visual", "--run", "--strict"]).mode,
    "visual",
  );
  assert.throws(
    () => parseEvidenceArgs(["--mode", "visual", "--strict"]),
    /vereist --run/u,
  );
  assert.throws(
    () => parseEvidenceArgs(["--mode", "runtime", "--verify"]),
    /niet toegestaan/u,
  );
  assert.throws(
    () => parseEvidenceArgs(["--mode", "anything"]),
    /moet exact één van/u,
  );
});

test("mode command coverage follows browser, visual, staging and release types", () => {
  const visualItem = { verification: "permission-e2e+visual-diff" };
  assert.deepEqual(expectedCommandIds("runtime", visualItem), [
    "fieldflow-runtime",
    "fieldflow-browser",
    "fieldflow-visual",
  ]);
  assert.deepEqual(expectedCommandIds("browser", visualItem), [
    "fieldflow-runtime",
    "fieldflow-browser",
    "fieldflow-visual",
  ]);
  assert.deepEqual(expectedCommandIds("staging", visualItem), [
    "fieldflow-staging",
  ]);
  assert.deepEqual(expectedCommandIds("release", visualItem), [
    "fieldflow-staging",
    "fieldflow-release",
  ]);
});

test("safe evidence paths reject traversal, absolute paths and non-JSON output", () => {
  assert.match(
    assertSafeEvidencePath("outputs/fieldflow-calm/runtime/R-001.json"),
    /outputs\/fieldflow-calm\/runtime\/R-001\.json$/u,
  );
  assert.match(
    assertSafeEvidencePath(
      "outputs/fieldflow-calm/screenshots/R-001.png",
      undefined,
      "attachment",
      false,
    ),
    /outputs\/fieldflow-calm\/screenshots\/R-001\.png$/u,
  );
  for (const path of [
    "../outputs/fieldflow-calm/report.json",
    "/tmp/report.json",
    "artifacts/report.json",
    "outputs/fieldflow-calm/report.xml",
  ]) {
    assert.throws(
      () => assertSafeEvidencePath(path),
      /veilig repository-relatief/u,
    );
  }
});

test("forbidden outcomes are found recursively and zero counts remain valid", () => {
  const found = findForbiddenEvidenceOutcomes({
    summary: { failed: 0, skipped: 1, notRun: 0, manual: 0 },
    assertions: [{ status: "NOT_RUN" }, { status: "passed" }],
  });
  assert.deepEqual(found, [
    "evidence.summary.skipped",
    "evidence.assertions[0].status",
  ]);
});

test("runtime mode writes only an exact-subject, exact-head, trusted-base report", () => {
  const fixture = fixtureRepository();
  try {
    const reportPath = "outputs/fieldflow-calm/runtime/R-001.json";
    const result = runEvidenceCli(
      [
        "--mode",
        "runtime",
        "--evidence-subject",
        "R-001",
        "--report",
        reportPath,
      ],
      { root: fixture.root, env: fixture.env },
    );
    assert.equal(result.headCommit, fixture.head);
    assert.match(result.reportSha256, /^[0-9a-f]{64}$/u);
    const report = JSON.parse(
      readFileSync(resolve(fixture.root, reportPath), "utf8"),
    );
    assert.equal(report.subjectId, "R-001");
    assert.equal(report.headCommit, fixture.head);
    assert.equal(report.kind, "runtime");
    assert.equal(report.provenance.baseCommit, fixture.env.GITHUB_BASE_SHA);
    assert.equal(
      report.provenance.executorWorkflowSha,
      fixture.env.FIELDFLOW_EXECUTOR_WORKFLOW_SHA,
    );
    assert.equal(
      report.provenance.checkSuiteId,
      Number(fixture.env.FIELDFLOW_CHECK_SUITE_ID),
    );
    assert.equal(report.provenance.evidenceMode, "runtime");
    assert.equal("artifactId" in report.provenance, false);
    assert.equal("artifactName" in report.provenance, false);
    assert.equal("artifactDigest" in report.provenance, false);
    assert.equal("attestationBundlePath" in report.provenance, false);
    assert.equal("attestationBundleSha256" in report.provenance, false);
    assert.equal(report.summary.passed, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("missing fields, forbidden status and stale head fail before a report is written", () => {
  const fixture = fixtureRepository();
  try {
    const input = resolve(fixture.root, fixture.inputPath);
    const invalid = structuredClone(fixture.payload);
    invalid.summary.skipped = 1;
    writeFileSync(input, `${JSON.stringify(invalid)}\n`);
    assert.throws(
      () =>
        runEvidenceCli(
          [
            "--mode",
            "runtime",
            "--evidence-subject",
            "R-001",
            "--report",
            "outputs/fieldflow-calm/runtime/invalid.json",
          ],
          { root: fixture.root, env: fixture.env },
        ),
      /manual\/skipped\/notRun\/failed evidence is verboden/u,
    );

    const missing = structuredClone(fixture.payload);
    delete missing.assertions;
    writeFileSync(input, `${JSON.stringify(missing)}\n`);
    assert.throws(
      () =>
        runEvidenceCli(
          [
            "--mode",
            "runtime",
            "--evidence-subject",
            "R-001",
            "--report",
            "outputs/fieldflow-calm/runtime/missing.json",
          ],
          { root: fixture.root, env: fixture.env },
        ),
      /ontbrekende, extra of verkeerd getypeerde/u,
    );

    assert.throws(
      () =>
        runEvidenceCli(
          [
            "--mode",
            "runtime",
            "--evidence-subject",
            "R-001",
            "--report",
            "outputs/fieldflow-calm/runtime/stale.json",
            "--expected-head",
            "f".repeat(40),
          ],
          { root: fixture.root, env: fixture.env },
        ),
      /wijkt af van de vereiste evidence-HEAD/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("browser wrapper remains backwards compatible without promotion arguments", () => {
  assert.deepEqual(runEvidenceCli(["--mode", "browser"]), {
    legacyBrowserValidationOnly: true,
  });
  for (const argv of [
    ["--mode", "runtime"],
    ["--mode", "visual", "--run", "--strict"],
    ["--mode", "staging", "--strict"],
    ["--mode", "release", "--verify"],
  ]) {
    assert.throws(
      () => runEvidenceCli(argv),
      /--evidence-subject en --report zijn samen verplicht/u,
    );
  }
  assert.throws(
    () => runEvidenceCli(["--mode", "browser", "--evidence-subject", "R-001"]),
    /--evidence-subject en --report zijn samen verplicht/u,
  );
});

test("package commands and browser wrapper expose the exact contracted interface", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["fieldgrid:fieldflow-calm:check"],
    "node scripts/fieldgrid-fieldflow-calm-evidence.mjs --mode runtime",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:fieldflow-calm:visual"],
    "node scripts/fieldgrid-fieldflow-calm-evidence.mjs --mode visual",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:fieldflow-calm:staging"],
    "node scripts/fieldgrid-fieldflow-calm-evidence.mjs --mode staging",
  );
  assert.equal(
    packageJson.scripts["fieldgrid:fieldflow-calm:release"],
    "node scripts/fieldgrid-fieldflow-calm-evidence.mjs --mode release",
  );
  const browserValidator = readFileSync(
    "e2e/fieldgrid/validate-runtime-evidence.mjs",
    "utf8",
  );
  assert.match(
    browserValidator,
    /runEvidenceCli\(\[\s*['"]--mode['"],\s*['"]browser['"]/u,
  );
  assert.match(browserValidator, /process\.argv\.slice\(2\)/u);
});

test("evidence workflows are base-owned, exact-head, pinned, and secret-free", () => {
  for (const path of [
    ".github/workflows/fieldflow-calm-evidence.yml",
    ".github/workflows/fieldflow-calm-visual-baseline.yml",
  ]) {
    assert.equal(existsSync(path), true);
    const workflow = readFileSync(path, "utf8");
    assert.match(workflow, /^on:\n  pull_request_target:/mu);
    assert.doesNotMatch(workflow, /workflow_dispatch|environment:|secrets\./u);
    assert.match(workflow, /^      - edited$/mu);
    assert.match(workflow, /EXPECTED_EVENT_REF: refs\/heads\/main/u);
    assert.match(workflow, /@refs\/heads\/\$\{EXPECTED_EXECUTION_BRANCH\}/u);
    assert.match(workflow, /EXECUTOR_WORKFLOW_SHA:.*github\.workflow_sha/u);
    assert.match(workflow, /Checkout main workflow executor identity/u);
    assert.match(
      workflow,
      /refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/head/u,
    );
    assert.match(workflow, /persist-credentials: false/u);
    assert.doesNotMatch(
      workflow,
      /^\s*(?:cache|cache-dependency-path):/gmu,
      `${path}: privileged pull_request_target producers may not persist candidate-influenced dependency caches`,
    );
    assert.match(workflow, /git merge-base --is-ancestor/u);
    assert.match(workflow, /':\(glob\)\*\*\/package\.json'/u);
    assert.match(workflow, /':\(glob\)patches\/\*\*'/u);
    assert.match(workflow, /retention-days: 90/u);
    assert.match(
      workflow,
      /actions\/runs\/\$GITHUB_RUN_ID\/attempts\/\$GITHUB_RUN_ATTEMPT\/jobs/u,
    );
    assert.doesNotMatch(workflow, /jobs\?filter=all|tail -n 1/u);
    assert.match(workflow, /attestations: write/u);
    assert.match(workflow, /id-token: write/u);
    assert.doesNotMatch(workflow, /\beval\b|bash -c|source /u);
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) {
      assert.match(match[1], /@[0-9a-f]{40}$/u, `${path}: ${match[1]}`);
    }
  }
  const evidence = readFileSync(
    ".github/workflows/fieldflow-calm-evidence.yml",
    "utf8",
  );
  const job = (workflow, name, next) => {
    const start = workflow.indexOf(`\n  ${name}:`);
    const end = next ? workflow.indexOf(`\n  ${next}:`, start + 1) : -1;
    assert.ok(start >= 0, `workflow job ${name} ontbreekt`);
    if (next) assert.ok(end > start, `workflow job ${next} ontbreekt`);
    return workflow.slice(start, end < 0 ? undefined : end);
  };
  const assertUniqueJobAndStepNames = (workflow, jobNames, stepNames) => {
    for (const name of jobNames) {
      assert.equal(
        (workflow.match(new RegExp(`^  ${name}:$`, "gmu")) ?? []).length,
        1,
        `workflow job ${name} moet exact één keer voorkomen`,
      );
    }
    for (const name of stepNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      assert.equal(
        (workflow.match(new RegExp(`^      - name: ${escaped}$`, "gmu")) ?? [])
          .length,
        1,
        `workflowstep ${name} moet exact één keer voorkomen`,
      );
    }
  };
  assertUniqueJobAndStepNames(
    evidence,
    ["produce", "validate", "attest", "status"],
    [
      "Checkout main workflow executor identity for clean validation",
      "Recheck exact artifact and head binding",
    ],
  );
  const evidenceProducer = job(evidence, "produce", "validate");
  const evidenceValidator = job(evidence, "validate", "attest");
  const evidenceAttestationJob = job(evidence, "attest", "status");
  assert.match(
    evidenceProducer,
    /Trusted evidence runner is not installed on the PR base/u,
  );
  assert.match(
    evidenceProducer,
    /git cat-file -e "\$GITHUB_BASE_SHA:\$runner"/u,
  );
  assert.match(evidenceProducer, /--transport-root "\$transport_root"/u);
  assert.match(evidenceProducer, /path: candidate\/fieldflow-untrusted/u);
  assert.match(evidenceProducer, /fieldflow-calm-raw-.*run-.*attempt-/u);
  assert.equal((evidenceProducer.match(/node "\$runner"/gu) ?? []).length, 1);
  const evidenceAfterCandidate = evidenceProducer.slice(
    evidenceProducer.indexOf('node "$runner"'),
  );
  assert.doesNotMatch(evidenceAfterCandidate, /GITHUB_OUTPUT|^\s+run:\s*\|/gmu);
  assert.doesNotMatch(evidenceProducer, /outputs:\n|id-token:|attestations:/u);

  assert.match(evidenceValidator, /path: untrusted/u);
  assert.match(
    evidenceValidator,
    /Checkout candidate as inert validation data/u,
  );
  assert.match(evidenceValidator, /working-directory: trusted/u);
  assert.match(evidenceValidator, /runEvidenceCli\(args, \{ root/u);
  assert.match(evidenceValidator, /producer_conclusion.*success/u);
  assert.match(evidenceValidator, /raw_artifact_name=/u);
  assert.match(evidenceValidator, /\.workflow_run\.head_sha/u);
  assert.match(evidenceValidator, /find untrusted -type f -print0/u);
  assert.match(evidenceValidator, /stat -c '%h'/u);
  assert.match(evidenceValidator, /realpath -e/u);
  assert.match(evidenceValidator, /raw_files\[@\].*raw_expected\[@\]/u);
  assert.match(
    evidenceValidator,
    /validated_root='fieldflow-validated'[\s\S]*package_root="\$validated_root\/promotion-ready"/u,
  );
  assert.match(evidenceValidator, /fieldflow-calm-validated-.*run-.*attempt-/u);
  assert.match(evidenceValidator, /\.nonceSha256 \| test/u);
  assert.doesNotMatch(evidenceValidator, /nonce_sha|node "\$runner"/u);
  assert.doesNotMatch(
    evidenceValidator,
    /pnpm fieldgrid:|working-directory: candidate\s*$/mu,
  );
  assert.match(
    evidenceValidator,
    /scripts\/fieldgrid-playwright-journey-evidence\.mjs/u,
  );
  assert.match(evidenceValidator, /\.verificationMatrix\.sharedMatrices/u);
  assert.match(
    evidenceValidator,
    /\.attachments\[\]\? \| \[\.path, \.sha256\]/u,
  );
  assert.match(
    evidenceValidator,
    /artifact_name=.*-attempt-%s.*\$GITHUB_RUN_ATTEMPT/u,
  );
  assert.match(evidence, /id: attest/u);
  assert.match(evidence, /steps\.attest\.outputs\.bundle-path/u);
  assert.match(
    evidence,
    /\$\{EXPECTED_SUBJECT\}\.\$\{EXPECTED_MODE\}\.\$\{EXPECTED_HEAD\}\.bundle\.json/u,
  );
  assert.match(evidence, /--bundle "\$bundle_target"/u);
  assert.doesNotMatch(evidence, /--limit/u);
  assert.match(
    evidence,
    /name: \$\{\{ needs\.validate\.outputs\.artifact-name \}\}/u,
  );
  assert.match(evidenceAttestationJob, /Checkout the trusted PR base/u);
  assert.match(
    evidenceAttestationJob,
    /repository: \$\{\{ github\.event\.pull_request\.base\.repo\.full_name \}\}[\s\S]*ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
  );
  assert.doesNotMatch(
    evidenceAttestationJob,
    /ref: \$\{\{ needs\.validate\.outputs\.base-sha \}\}/u,
  );
  assert.match(
    evidenceAttestationJob,
    /EXPECTED_BASE: \$\{\{ needs\.validate\.outputs\.base-sha \}\}[\s\S]*git -C trusted rev-parse --verify 'HEAD\^\{commit\}'\)" = "\$EXPECTED_BASE"/u,
  );
  assert.match(evidenceAttestationJob, /\.summary\.manual == 0/u);
  assert.match(evidenceAttestationJob, /pull_request_target/u);
  assert.doesNotMatch(
    evidenceAttestationJob,
    /working-directory: candidate|pnpm |node candidate/u,
  );
  assert.match(
    evidenceAttestationJob,
    /actions\/artifacts\/\$EXPECTED_ARTIFACT_ID/u,
  );
  assert.doesNotMatch(
    evidenceAttestationJob,
    /node "\$runner"|pnpm fieldgrid:/u,
  );
  assert.equal((evidence.match(/id-token: write/gu) ?? []).length, 1);
  assert.match(evidenceAttestationJob, /id-token: write/u);

  const visual = readFileSync(
    ".github/workflows/fieldflow-calm-visual-baseline.yml",
    "utf8",
  );
  const visualProducer = job(visual, "produce", "validate");
  const visualValidator = job(visual, "validate", "attest");
  const visualAttestationJob = job(visual, "attest", "status");
  assertUniqueJobAndStepNames(
    visual,
    ["produce", "validate", "attest", "status"],
    [
      "Checkout main workflow executor identity for clean validation",
      "Recheck capture manifest and PNG cardinality",
    ],
  );
  assert.match(visualProducer, /Capture is intentionally fail-closed/u);
  assert.match(visualProducer, /git cat-file -e "\$BASE_SHA:\$runner"/u);
  assert.match(visualProducer, /--transport-root "\$transport_root"/u);
  assert.match(visualProducer, /path: candidate\/fieldflow-untrusted/u);
  assert.match(visualProducer, /baseline-raw-.*run-.*attempt-/u);
  assert.equal((visualProducer.match(/node "\$runner"/gu) ?? []).length, 1);
  const visualAfterCandidate = visualProducer.slice(
    visualProducer.indexOf('node "$runner"'),
  );
  assert.doesNotMatch(visualAfterCandidate, /GITHUB_OUTPUT|^\s+run:\s*\|/gmu);
  assert.doesNotMatch(visualProducer, /outputs:\n|id-token:|attestations:/u);

  assert.match(visualValidator, /path: untrusted/u);
  assert.match(visualValidator, /capture candidate as inert validation data/u);
  assert.match(visualValidator, /producer_conclusion.*success/u);
  assert.match(visualValidator, /raw_artifact_name=/u);
  assert.match(visualValidator, /\.workflow_run\.head_sha/u);
  assert.match(visualValidator, /stat -c '%h'/u);
  assert.match(visualValidator, /realpath -e/u);
  assert.match(visualValidator, /all_raw_files\[@\]/u);
  assert.match(visualValidator, /\.artifacts\[\]\.scenarioId/u);
  assert.match(visualValidator, /baseline-validated-.*run-.*attempt-/u);
  assert.match(visualValidator, /\.nonceSha256 \| test/u);
  assert.doesNotMatch(visualValidator, /nonce_sha|node "\$runner"/u);
  assert.doesNotMatch(
    visualValidator,
    /pnpm fieldgrid:|working-directory: candidate\s*$/mu,
  );
  assert.match(
    visualValidator,
    /artifact_name=.*-attempt-%s.*\$GITHUB_RUN_ATTEMPT/u,
  );
  assert.match(visual, /id: attest/u);
  assert.match(visual, /steps\.attest\.outputs\.bundle-path/u);
  assert.match(
    visual,
    /normalized\/attestations\/\$\{EXPECTED_HEAD\}\.bundle\.json/u,
  );
  assert.match(visual, /attested\/attestation-manifest\.json/u);
  assert.match(visual, /attested\/\*\*\/\*\.png/u);
  assert.match(visual, /fieldflow-baseline-expected-subjects\.json/u);
  assert.match(visual, /--bundle "\$bundle_target"/u);
  assert.doesNotMatch(visual, /--limit/u);
  assert.match(
    visual,
    /name: \$\{\{ needs\.validate\.outputs\.artifact-name \}\}/u,
  );
  assert.match(visualAttestationJob, /Checkout the trusted PR base/u);
  assert.match(
    visualAttestationJob,
    /repository: \$\{\{ github\.event\.pull_request\.base\.repo\.full_name \}\}[\s\S]*ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
  );
  assert.doesNotMatch(
    visualAttestationJob,
    /ref: \$\{\{ needs\.validate\.outputs\.base-sha \}\}/u,
  );
  assert.match(
    visualAttestationJob,
    /EXPECTED_BASE: \$\{\{ needs\.validate\.outputs\.base-sha \}\}[\s\S]*git -C trusted rev-parse --verify 'HEAD\^\{commit\}'\)" = "\$EXPECTED_BASE"/u,
  );
  assert.match(visualAttestationJob, /EXPECTED_WORKFLOW_SHA256/u);
  assert.match(visualAttestationJob, /\.artifacts \| all/u);
  assert.doesNotMatch(
    visualAttestationJob,
    /working-directory: candidate|pnpm |node candidate/u,
  );
  assert.match(
    visualAttestationJob,
    /actions\/artifacts\/\$EXPECTED_ARTIFACT_ID/u,
  );
  assert.doesNotMatch(visualAttestationJob, /node "\$runner"|pnpm fieldgrid:/u);
  assert.equal((visual.match(/id-token: write/gu) ?? []).length, 1);
  assert.match(visualAttestationJob, /id-token: write/u);
});
