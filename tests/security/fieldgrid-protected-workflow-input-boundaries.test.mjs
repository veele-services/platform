import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

function jobPreamble(source, jobName) {
  const jobStart = source.indexOf(`  ${jobName}:`);
  const stepsStart = source.indexOf("\n    steps:", jobStart);
  assert.ok(jobStart >= 0 && stepsStart > jobStart, `missing ${jobName} job`);
  return source.slice(jobStart, stepsStart);
}

function firstStepHeader(source, jobName) {
  const jobStart = source.indexOf(`  ${jobName}:`);
  const stepsStart = source.indexOf("\n    steps:", jobStart);
  const firstStep = source.indexOf("\n      - ", stepsStart);
  assert.ok(firstStep > stepsStart, `missing first ${jobName} step`);
  return source.slice(firstStep + 1, source.indexOf("\n", firstStep + 1));
}

const PROTECTED_SHA_WORKFLOWS = [
  {
    path: ".github/workflows/deploy.yml",
    input: "expected_staging_sha",
    binding: "EXPECTED_STAGING_SHA",
    branch: "staging",
  },
  {
    path: ".github/workflows/phase2e-staging-preflight.yml",
    input: "expected_main_sha",
    binding: "EXPECTED_MAIN_SHA",
    branch: "main",
  },
  {
    path: ".github/workflows/fieldgrid-staging-field-demo-owner-repair.yml",
    input: "expected_main_sha",
    binding: "EXPECTED_MAIN_SHA",
    branch: "main",
  },
  {
    path: ".github/workflows/website-staging-stack-deploy.yml",
    input: "expected_staging_sha",
    binding: "EXPECTED_STAGING_SHA",
    branch: "staging",
  },
  {
    path: ".github/workflows/website-staging-proof-state.yml",
    input: "expected_sha",
    binding: "EXPECTED_SHA",
    branch: "main",
  },
  {
    path: ".github/workflows/website-staging-acceptance.yml",
    input: "expected_staging_sha",
    binding: "EXPECTED_STAGING_SHA",
    branch: "staging",
  },
];

test("protected dispatch inputs never select or shell-interpolate repository code", () => {
  for (const workflow of PROTECTED_SHA_WORKFLOWS) {
    const source = read(workflow.path);
    const checkoutIndex = source.indexOf("ref: ${{ github.sha }}");
    const verifyIndex = source.indexOf("Verify immutable");
    const nextStepIndex = source.indexOf("\n      - ", checkoutIndex);
    const nextStepHeader = source.slice(
      nextStepIndex + 1,
      source.indexOf("\n", nextStepIndex + 1),
    );

    assert.ok(checkoutIndex >= 0, `${workflow.path} must checkout github.sha`);
    assert.doesNotMatch(
      source,
      new RegExp(`ref:\\s*\\$\\{\\{\\s*inputs\\.${workflow.input}`, "u"),
    );
    assert.match(
      source,
      new RegExp(
        `${workflow.binding}:\\s*\\$\\{\\{\\s*inputs\\.${workflow.input}\\s*\\}\\}`,
        "u",
      ),
    );
    assert.ok(
      verifyIndex > checkoutIndex && nextStepIndex > checkoutIndex,
      `${workflow.path} must contain an immutable-ref step after checkout`,
    );
    assert.match(
      nextStepHeader,
      /^\s+- name: Verify immutable/u,
      `${workflow.path} must make immutable-ref verification the immediate next step after checkout`,
    );
    assert.match(
      source,
      new RegExp(`test "\\$GITHUB_SHA" = "\\$${workflow.binding}"`, "u"),
    );
    assert.match(
      source,
      new RegExp(`git/ref/heads/(?:${workflow.branch}|\\$\\{branch\\})`, "u"),
    );

    for (const line of source.split("\n")) {
      if (!line.includes(`inputs.${workflow.input}`)) continue;
      assert.match(
        line,
        new RegExp(`^\\s*${workflow.binding}:`),
        `${workflow.path} interpolates an untrusted SHA outside its environment binding: ${line.trim()}`,
      );
    }
  }
});

test("the W00 partial rollout keeps production deployment frozen", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const operations = read("docs/operations/main-staging-promotion.md");

  assert.match(deploy, /^  workflow_dispatch:$/mu);
  assert.doesNotMatch(deploy, /^  push:$/mu);
  assert.match(deploy, /^    environment: staging$/mu);
  assert.doesNotMatch(deploy, /github\.ref_name == 'production'/u);
  assert.doesNotMatch(jobPreamble(deploy, "deploy"), /^    if:/mu);
  assert.match(
    deploy,
    /DEPLOY_CONFIRMATION:\s*\$\{\{ inputs\.confirmation \}\}/u,
  );
  assert.match(
    deploy,
    /test "\$DEPLOY_CONFIRMATION" = "fieldgrid-staging-deploy-exact-sha"/u,
  );
  assert.match(
    operations,
    /shared deploy workflow therefore accepts only an exact-SHA manual `staging` dispatch/u,
  );
  assert.match(operations, /separate reviewed package/u);
});

test("required preflight and deploy jobs fail invalid dispatches before checkout", () => {
  const phase2e = read(".github/workflows/phase2e-staging-preflight.yml");
  const deploy = read(".github/workflows/deploy.yml");

  assert.doesNotMatch(jobPreamble(phase2e, "preflight"), /^    if:/mu);
  assert.match(
    firstStepHeader(phase2e, "preflight"),
    /^\s+- name: Reject non-main preflight dispatch$/u,
  );
  assert.match(phase2e, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(phase2e, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);

  assert.match(
    firstStepHeader(deploy, "deploy"),
    /^\s+- name: Verify exact staging dispatch before repository code$/u,
  );
  assert.match(deploy, /test "\$GITHUB_REF" = "refs\/heads\/staging"/u);
  assert.match(deploy, /test "\$GITHUB_SHA" = "\$EXPECTED_STAGING_SHA"/u);
  assert.match(deploy, /\["main", "staging"\]/u);
});

test("database utilities expose secrets only from their matching protected head", () => {
  for (const path of [
    ".github/workflows/database-baseline.yml",
    ".github/workflows/database-inspect.yml",
  ]) {
    const workflow = read(path);
    const checkoutIndex = workflow.indexOf("ref: ${{ github.sha }}");
    const verifyIndex = workflow.indexOf(
      "Verify immutable protected source before repository code",
    );
    const repositoryCodeIndex = workflow.indexOf(
      "node scripts/fieldgrid-database-root-cert.mjs",
    );

    assert.match(
      workflow,
      /\(inputs\.target == 'staging' && github\.ref == 'refs\/heads\/staging'\) \|\|\n\s+\(inputs\.target == 'production' && github\.ref == 'refs\/heads\/production'\)/u,
    );
    assert.ok(checkoutIndex >= 0, `${path} must checkout github.sha`);
    assert.match(workflow, /persist-credentials: false/u);
    assert.ok(
      verifyIndex > checkoutIndex && repositoryCodeIndex > verifyIndex,
      `${path} must prove its protected head before repository code`,
    );
    assert.match(workflow, /git\/ref\/heads\/\$\{branch\}/u);
    assert.match(workflow, /object\?\.sha !== expected/u);
  }
});

test("pull-request promotion checks run on an ephemeral hosted runner", () => {
  const workflow = read(".github/workflows/promotion-guard.yml");

  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.doesNotMatch(
    workflow,
    /runs-on:\s*(?:\[[^\]]*self-hosted|self-hosted)/u,
  );
});
