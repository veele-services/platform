import { readFileSync, writeFileSync } from "node:fs";

const reportUrl = new URL("../docs/testing/current-main-baseline-2026-07-14.json", import.meta.url);
const markdownUrl = new URL("../docs/testing/current-main-baseline-2026-07-14.md", import.meta.url);
const allowedStatuses = new Set(["pass", "fail", "blocked", "notRun", "required-on-reviewed-head"]);
const requiredWorkflowNames = ["Runtime Safety Harness", "Fieldgrid Deploy Health Gate"];
const requiredLaneNames = [
  "build",
  "PostgreSQL migration smoke",
  "Tenant A/B DB integration",
  "RLS security",
  "previous-release compatibility",
  "API runtime",
  "typecheck",
  "health gate",
];

export function loadBaselineReport() {
  return JSON.parse(readFileSync(reportUrl, "utf8"));
}

export function validateBaselineReport(report) {
  const errors = [];
  if (report.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  if (report.baseSha !== "42edb5664ed507ed914b8bebf8847ab1f6e39f74") errors.push("unexpected base SHA");
  if (report.pullRequest !== 300) errors.push("pullRequest must be 300");
  if (report.rootSuite.total !== report.rootSuite.passed + report.rootSuite.failed + report.rootSuite.skipped) errors.push("root totals do not add up");
  if (report.rootSuite.total !== 759 || report.rootSuite.passed !== 745 || report.rootSuite.failed !== 14 || report.rootSuite.skipped !== 0 || report.rootSuite.flaky !== 0) errors.push("root baseline totals changed");
  if (report.rootSuite.failed !== report.failures.length) errors.push("failure count does not match failure records");
  if (report.baselineDifferential.candidateOnlyFailures !== 0) errors.push("candidate-only failures must remain 0");
  if (report.baselineDifferential.permanentFailureAllowlistAdded !== false) errors.push("no permanent broad allowlist may be added");
  if (Object.hasOwn(report.baselineDifferential, "environmentBlocks")) errors.push("baselineDifferential.environmentBlocks must not duplicate local constraints");

  const serialized = JSON.stringify(report);
  const stalePendingMarker = ["pending", "run", "id", "update", "after", "push"].join("-");
  const runtimeRunField = ["runtime", "Safety", "Run"].join("");
  const healthRunField = ["health", "Gate", "Run"].join("");
  const rawOutputPath = ["outputs", "current-main-baseline-2026-07-14"].join("/");
  if (serialized.includes(stalePendingMarker)) errors.push("pending workflow marker must not be committed");
  if (Object.hasOwn(report.githubActionsEvidence, runtimeRunField)) errors.push("runtime safety run ID must not be a durable schema field");
  if (Object.hasOwn(report.githubActionsEvidence, healthRunField)) errors.push("health gate run ID must not be a durable schema field");
  if (serialized.includes(rawOutputPath)) errors.push("raw output path must not be committed in the compact report");
  if (!allowedStatuses.has(report.githubActionsEvidence.status)) errors.push("invalid GitHub Actions evidence status");
  if (report.githubActionsEvidence.source !== "GitHub pull-request checks for the reviewed head") errors.push("GitHub Actions evidence source is not durable");
  for (const workflow of requiredWorkflowNames) {
    if (!report.githubActionsEvidence.requiredWorkflows.includes(workflow)) errors.push(`missing required workflow: ${workflow}`);
  }
  for (const lane of requiredLaneNames) {
    if (!report.githubActionsEvidence.requiredLanes.includes(lane)) errors.push(`missing required lane: ${lane}`);
  }

  for (const run of report.localValidationCommands) {
    if (!allowedStatuses.has(run.status)) errors.push(`invalid local command status: ${run.command}`);
  }
  for (const block of report.localExecutionConstraints) {
    if (block.status !== "blocked") errors.push(`local constraint must be blocked: ${block.lane}`);
  }
  for (const failure of report.failures) {
    const complete = failure.test && failure.file && failure.error && failure.existingOrNew && failure.ownerTrack && failure.severity && failure.reproducibility && typeof failure.featureFreezeBlocker === "boolean" && failure.proposedRepairTask;
    if (!complete) errors.push(`incomplete failure record: ${failure.test ?? "unknown"}`);
  }
  return errors;
}

export function renderMarkdown(report) {
  const workflowRows = report.githubActionsEvidence.requiredWorkflows.map((workflow) => `| ${workflow} | required on reviewed head |`).join("\n");
  const laneRows = report.githubActionsEvidence.requiredLanes.map((lane) => `| ${lane} | required on reviewed head |`).join("\n");
  const failureRows = report.failures.map((failure) => `| ${failure.test} | \`${failure.file}\` | ${failure.ownerTrack} | ${failure.severity} | ${failure.featureFreezeBlocker ? "yes" : "no"} |`).join("\n");
  const localRows = report.localExecutionConstraints.map((block) => `| ${block.lane} | ${block.status} | ${block.reason} |`).join("\n");
  return `# Current main full test baseline — ${report.date}

Base SHA: \`${report.baseSha}\`

Branch: \`${report.branch}\`

PR: #${report.pullRequest}

## Root suite result

- Command: \`${report.rootSuite.command}\`
- Status: ${report.rootSuite.status}
- Total: ${report.rootSuite.total}
- Passed: ${report.rootSuite.passed}
- Failed: ${report.rootSuite.failed}
- Skipped: ${report.rootSuite.skipped}
- Flaky: ${report.rootSuite.flaky}
- Result: ${report.rootSuite.result}

## Baseline differential

- Current-main root failures: ${report.baselineDifferential.currentMainFailures}
- Shared failures: ${report.baselineDifferential.sharedFailures}
- Candidate-only failures: ${report.baselineDifferential.candidateOnlyFailures}
- Permanent broad failure allowlist added: ${report.baselineDifferential.permanentFailureAllowlistAdded ? "yes" : "no"}

## Local execution constraints

Local execution constraints are separate from product failures and separate from GitHub Actions evidence.

| Lane | Status | Reason |
|---|---|---|
${localRows}

## GitHub Actions evidence contract

Status: ${report.githubActionsEvidence.status}

Source: ${report.githubActionsEvidence.source}

Concrete workflow run IDs belong in the PR body or review evidence, not this durable baseline schema.

| Required workflow | Requirement |
|---|---|
${workflowRows}

| Required lane | Requirement |
|---|---|
${laneRows}

## Classification

- Test layer: ${report.classifications.testLayer}
- Security relevance: ${report.classifications.securityRelevance}
- Tenant relevance: ${report.classifications.tenantRelevance}
- Finance relevance: ${report.classifications.financeRelevance}
- Feature-freeze relevance: ${report.classifications.featureFreezeRelevance}

## Root failures

| Test | File | Owner track | Severity | Feature-freeze blocker |
|---|---|---|---|---|
${failureRows}

Full structured failure records are in the JSON companion file. Full command logs belong in GitHub Actions artifacts, not source control.
`;
}

export function writeMarkdown(report) {
  writeFileSync(markdownUrl, renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = loadBaselineReport();
  const errors = validateBaselineReport(report);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  if (process.argv.includes("--write")) writeMarkdown(report);
  console.log(JSON.stringify({ ok: true, root: report.rootSuite, candidateOnlyFailures: report.baselineDifferential.candidateOnlyFailures }, null, 2));
}
