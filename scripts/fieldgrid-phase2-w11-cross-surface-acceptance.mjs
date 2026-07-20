#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { resolvePlaywrightJourneyEvidence } from './fieldgrid-playwright-journey-evidence.mjs';

const root = process.cwd();
const artifactDir = join(root, 'artifacts', 'fieldgrid-phase2-runtime');
const outputPath = join(artifactDir, 'runtime-acceptance.json');
const sourcePaths = {
  binding: 'artifacts/fieldgrid-playwright/run-binding.json',
  browser: 'artifacts/fieldgrid-playwright/browser-summary.json',
  accessibility: 'artifacts/fieldgrid-playwright/accessibility-summary.json',
  dataPath: 'artifacts/fieldgrid-playwright/data-path-proof.json',
  fixtures: 'artifacts/fieldgrid-playwright/e2e-fixtures.json',
  offline: 'artifacts/fieldgrid-playwright/offline-reconnect-evidence.json',
  phase2d: 'artifacts/runtime-safety-harness/reports/phase2d-runtime-journeys.json',
  db: 'artifacts/runtime-safety-harness/reports/db-harness.json',
  rls: 'artifacts/runtime-safety-harness/reports/rls-harness.json',
  api: 'artifacts/runtime-safety-harness/reports/api-harness.json',
  credential: 'artifacts/runtime-safety-harness/reports/credential-recovery.json',
};

const requiredJourneyIds = [
  'planned-versus-actual',
  'availability',
  'interest-selection-and-staffing',
  'durable-unassignment',
  'multi-person-execution',
  'realtime',
  'offline-personnel-pwa',
  'customer-visibility',
  'credential-recovery',
  'tenant-guards',
  'accessibility',
];

const contracts = {
  'planned-versus-actual': {
    testId: 'FG-P2D-PLANNED-ACTUAL',
    assertions: ['planned times remain available', 'actual start and completion are observed', 'backoffice, personnel and customer projections show planned and actual state'],
    sources: [runtime('planned-versus-actual-and-multi-person'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection')],
  },
  availability: {
    testId: 'FG-P2D-AVAILABILITY',
    assertions: ['availability update is persisted', 'stale edit is rejected', 'Tenant B is unchanged', 'personnel and planning surfaces execute against the same runtime'],
    sources: [runtime('availability'), playwright('FG-P2D-AVAILABILITY personnel update and backoffice consistency')],
  },
  'interest-selection-and-staffing': {
    testId: 'FG-P2D-STAFFING',
    assertions: ['interest responses are selected canonically', 'partial headcount remains partially staffed', 'full headcount schedules the assignment', 'duplicate selection is idempotent', 'planboard projection is visible'],
    sources: [runtime('interest-selection-and-staffing'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection')],
  },
  'durable-unassignment': {
    testId: 'FG-P2D-UNASSIGNMENT',
    assertions: ['pre-start unassignment retains history, actor and reason', 'active staffing count updates', 'post-start unassignment is denied', 'browser access and reassignment update'],
    sources: [runtime('durable-unassignment'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection')],
  },
  'multi-person-execution': {
    testId: 'FG-P2D-MULTI-PERSON',
    assertions: ['two required participants start independently', 'partial completion does not complete assignment', 'all required participants complete aggregate', 'replay is idempotent'],
    sources: [runtime('planned-versus-actual-and-multi-person'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection')],
  },
  realtime: {
    testId: 'FG-P2D-REALTIME',
    assertions: ['management, personnel and customer projection events are emitted', 'forbidden tenant receives no event', 'payload is scrubbed', 'projection versions are monotonic', 'refresh shows the projected state'],
    sources: [runtime('realtime-projections'), reportCheck('rls', 'rls-customer-safe-realtime-projection-and-deactivation', 'rls'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection')],
  },
  "offline-personnel-pwa": {
    testId: "FG-P2D-OFFLINE",
    assertions: [
      "offline-capable data loads",
      "sequential mutations remain durable while offline",
      "trigger during active synchronization produces a coalesced follow-up pass",
      "transient retry preserves stable mutation identity",
      "canonical versions advance monotonically without duplicate execution",
    ],
    sources: [
      playwrightJourney("phase2.offline.mutation-chain"),
      offline(),
      reportCheck("db", "phase2c-transactional-invariants", "postgresql"),
      runtime("planned-versus-actual-and-multi-person"),
    ],
  },
  'customer-visibility': {
    testId: 'FG-P2D-CUSTOMER',
    assertions: ['customer sees allowed assignment and approved report', 'internal and Tenant B fields are absent', 'customer projection reaches actual completed state', 'customer realtime projection is RLS protected'],
    sources: [playwright('4. Customer PWA'), playwright('durable unassignment, reassignment, multi-person execution and actual-time projection'), reportCheck('rls', 'rls-customer-safe-realtime-projection-and-deactivation', 'rls'), dataPath()],
  },
  'credential-recovery': {
    testId: 'FG-P2D-CREDENTIAL',
    assertions: ['generic request response is observed', 'captured recovery message completes customer and personnel reset', 'invalid, expired, used and wrong-tenant tokens are denied', 'legacy reset-code password path is absent'],
    sources: [playwright('5. Customer credential recovery'), playwright('6. Personnel credential recovery'), playwright('7. Recovery provider invalidates sessions and never receives a code as password'), reportOverall('credential', 'postgresql')],
  },
  'tenant-guards': {
    testId: 'FG-P2D-TENANT-GUARDS',
    assertions: ['management, personnel and customer cross-tenant reads are denied', 'tenantless and malformed claims fail closed', 'unauthorized mutation and RPC paths are denied', 'forbidden realtime projection is absent'],
    sources: [playwright('8. Negative guards'), dataPath(), reportCheck('rls', 'rls-tenant-a-b-isolation-and-jwt-tenant-claim-ignored', 'rls'), reportOverall('api', 'api')],
  },
  accessibility: {
    testId: 'FG-P2D-ACCESSIBILITY',
    assertions: ['critical pages have zero serious/critical axe violations', 'keyboard focus is observable', 'dialog focus and Escape are verified', 'desktop and mobile viewports execute'],
    sources: [playwright('FG-P2D-A11Y-BO backoffice planboard axe, keyboard, focus and dialog'), playwright('FG-P2D-A11Y-PERSONNEL personnel assignment axe and keyboard'), playwright('FG-P2D-A11Y-CUSTOMER customer assignment axe and keyboard'), playwright('FG-P2D-A11Y-RECOVERY credential recovery labels, errors, axe and mobile'), accessibility()],
  },
};

function runtime(journeyId) { return { resolver: 'runtime', journeyId }; }
function playwright(title) { return { resolver: 'playwright', title }; }
function playwrightJourney(journeyId) { return { resolver: 'playwright-journey', journeyId }; }
function reportCheck(key, check, kind) { return { resolver: 'report-check', key, check, kind }; }
function reportOverall(key, kind) { return { resolver: 'report-overall', key, kind }; }
function dataPath() { return { resolver: 'data-path' }; }
function accessibility() { return { resolver: 'accessibility' }; }
function offline() { return { resolver: 'offline' }; }

function assert(condition, message, details = undefined) {
  if (!condition) throw Object.assign(new Error(message), { details });
}

async function readSource(key) {
  const relativePath = sourcePaths[key];
  const path = join(root, relativePath);
  assert(existsSync(path), `Missing mandatory source artifact: ${relativePath}`);
  const raw = await readFile(path);
  return { value: JSON.parse(raw.toString('utf8')), artifact: { path: relativePath, sha256: createHash('sha256').update(raw).digest('hex') } };
}

function timeRange(source, fallback) {
  const startedAt = source.startedAt ?? source.timestamp ?? source.generatedAt ?? source.checkedAt ?? fallback;
  const finishedAt = source.finishedAt ?? source.completedAt ?? source.timestamp ?? source.generatedAt ?? source.checkedAt ?? fallback;
  assert(Number.isFinite(Date.parse(startedAt)) && Number.isFinite(Date.parse(finishedAt)), 'Source evidence has no valid runtime timestamps', source);
  return { startedAt: new Date(startedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString() };
}

function normalizedStatus(value) {
  if (value === 'passed' || value === 'failed' || value === 'skipped' || value === 'timedOut' || value === 'interrupted') return value;
  return value === 'success' ? 'passed' : 'failed';
}

async function collect() {
  const sources = {};
  for (const key of Object.keys(sourcePaths)) sources[key] = await readSource(key);
  const binding = sources.binding.value;
  const exactGitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const expectedHead = process.env.FIELDGRID_EXACT_HEAD || process.env.GITHUB_SHA || exactGitHead;
  assert(/^[0-9a-f]{40}$/u.test(exactGitHead), 'Git head is not a full SHA.');
  assert(exactGitHead === expectedHead, `Exact head mismatch: ${exactGitHead} != ${expectedHead}`);
  assert(binding.exactGitHead === exactGitHead && binding.expectedGitHead === exactGitHead, 'Run binding does not match exact checked-out head.', binding);
  if (process.env.CI) assert(typeof binding.workflowRunId === 'string' && binding.workflowRunId.length > 0, 'CI evidence requires GITHUB_RUN_ID.');
  assert(binding.environment === (process.env.CI ? 'ci-disposable-postgresql-17' : 'local-disposable-postgresql-17'), 'Evidence environment classification mismatch.', binding);
  const browserCounts = sources.browser.value.counts;
  assert(browserCounts?.total > 0 && browserCounts.passed === browserCounts.total && browserCounts.failed === 0 && browserCounts.skipped === 0, 'Every Playwright test must pass without skips.', browserCounts);
  const accessibilityResults = sources.accessibility.value.results ?? [];
  const accessibilityKeys = accessibilityResults.map((entry) => `${entry.testId}:${entry.viewport}`);
  const expectedAccessibilityKeys = [
    'FG-P2D-A11Y-BO:desktop', 'FG-P2D-A11Y-BO:mobile',
    'FG-P2D-A11Y-PERSONNEL:desktop', 'FG-P2D-A11Y-PERSONNEL:mobile',
    'FG-P2D-A11Y-CUSTOMER:desktop', 'FG-P2D-A11Y-CUSTOMER:mobile',
    'FG-P2D-A11Y-RECOVERY:desktop', 'FG-P2D-A11Y-RECOVERY:mobile',
  ];
  assert(new Set(accessibilityKeys).size === accessibilityKeys.length, 'Duplicate accessibility result detected.', accessibilityKeys);
  assert(JSON.stringify([...accessibilityKeys].sort()) === JSON.stringify(expectedAccessibilityKeys.sort()), 'Accessibility result set is incomplete.', accessibilityKeys);
  const fallbackTime = binding.generatedAt;

  async function resolve(spec) {
    if (spec.resolver === "playwright-journey") {
      const test = resolvePlaywrightJourneyEvidence(
        sources.browser.value,
        spec.journeyId,
        { expectedHead: exactGitHead },
      );
      return {
        kind: "playwright",
        artifact: sources.browser.artifact,
        sourceId: `${spec.journeyId}:${test.testId}`,
        status: normalizedStatus(test.status),
        ...timeRange(test, fallbackTime),
        assertions: [
          `Stable journey ${spec.journeyId} expected ${test.expectedStatus} and observed ${test.status}`,
        ],
        failure: test.errors.length ? { errors: test.errors } : null,
      };
    }
    if (spec.resolver === 'playwright') {
      const matches = sources.browser.value.tests.filter((test) => test.title.endsWith(spec.title));
      assert(matches.length === 1, `Expected exactly one Playwright source for "${spec.title}", found ${matches.length}.`);
      const test = matches[0];
      return { kind: 'playwright', artifact: sources.browser.artifact, sourceId: `${test.testId}:${test.title}`, status: normalizedStatus(test.status), ...timeRange(test, fallbackTime), assertions: [`Playwright expected ${test.expectedStatus} and observed ${test.status}`], failure: test.errors?.length ? { errors: test.errors } : null };
    }
    if (spec.resolver === 'runtime') {
      const matches = sources.phase2d.value.journeys.filter((entry) => entry.journeyId === spec.journeyId);
      assert(matches.length === 1, `Expected exactly one PostgreSQL runtime journey ${spec.journeyId}, found ${matches.length}.`);
      const entry = matches[0];
      return { kind: 'postgresql', artifact: sources.phase2d.artifact, sourceId: entry.journeyId, status: normalizedStatus(entry.status), ...timeRange(entry, fallbackTime), assertions: entry.assertions, failure: entry.failure ?? null };
    }
    if (spec.resolver === 'report-check') {
      const report = sources[spec.key].value;
      const matches = (report.checks ?? []).filter((entry) => entry.name === spec.check);
      assert(matches.length === 1, `Expected exactly one ${spec.key} check ${spec.check}, found ${matches.length}.`);
      const entry = matches[0];
      return { kind: spec.kind, artifact: sources[spec.key].artifact, sourceId: entry.name, status: normalizedStatus(entry.status), ...timeRange(report, fallbackTime), assertions: [`Runtime harness executed ${entry.name}`], failure: entry.status === 'passed' ? null : { details: entry.details ?? null } };
    }
    if (spec.resolver === 'report-overall') {
      const report = sources[spec.key].value;
      const checks = report.checks ?? [];
      assert(checks.length > 0, `${spec.key} report contains no checks.`);
      assert(checks.every((entry) => entry.status === 'passed'), `${spec.key} report contains a failed or skipped check.`, checks);
      return { kind: spec.kind, artifact: sources[spec.key].artifact, sourceId: report.name, status: normalizedStatus(report.status), ...timeRange(report, fallbackTime), assertions: checks.map((entry) => `Runtime check passed: ${entry.name}`), failure: report.status === 'passed' ? null : { status: report.status } };
    }
    if (spec.resolver === 'data-path') {
      const proof = sources.dataPath.value;
      const passed = proof.status === 'passed' && proof.customerTenantAAllowedAssignmentCount === 1 && proof.invalidJwtStatus === 401 && proof.serviceRoleBrowserBypassDetected === false;
      return { kind: 'data-path', artifact: sources.dataPath.artifact, sourceId: 'application-gateway-postgrest-database', status: passed ? 'passed' : 'failed', ...timeRange(proof, fallbackTime), assertions: ['authenticated application → gateway → PostgREST → PostgreSQL path executed', 'cross-tenant customer and personnel probes denied', 'no service-role credential observed by gateway'], failure: passed ? null : proof.failure ?? { reason: 'Data-path assertions failed.' } };
    }
    if (spec.resolver === 'accessibility') {
      const report = sources.accessibility.value;
      return { kind: 'accessibility', artifact: sources.accessibility.artifact, sourceId: 'axe-and-keyboard-summary', status: normalizedStatus(report.status), ...timeRange(report, fallbackTime), assertions: [`${report.results?.length ?? 0} runtime axe scans executed`, `${report.seriousOrCriticalViolations} serious/critical violations`, `${report.keyboardFailures} keyboard failures`], failure: report.status === 'passed' ? null : { seriousOrCriticalViolations: report.seriousOrCriticalViolations, keyboardFailures: report.keyboardFailures } };
    }
    if (spec.resolver === "offline") {
      const proof = sources.offline.value;
      const sequentialMutationIds = proof.sequentialMutationIdSha256 ?? [];
      const canonicalVersions = proof.canonicalVersions ?? [];
      const passed =
        proof.status === "passed" &&
        proof.exactGitHead === exactGitHead &&
        proof.mandatoryJourneySkipped === false &&
        proof.offlineTransitionObserved === true &&
        proof.queueBeforeReconnect === 2 &&
        proof.activeAttemptHeld === true &&
        proof.firstStillDurable === true &&
        proof.triggerDuringActiveSync === true &&
        proof.coalescedFollowUpPass === true &&
        proof.synchronizationPassCount >= 2 &&
        proof.clientAttemptCount === 3 &&
        proof.maximumActiveClientAttempts === 1 &&
        proof.queueAfterReconnect === 0 &&
        sequentialMutationIds.length === 2 &&
        new Set(sequentialMutationIds).size === 2 &&
        sequentialMutationIds.every((hash) => /^[0-9a-f]{64}$/u.test(hash)) &&
        Number.isInteger(proof.initialVersion) &&
        canonicalVersions.length === 2 &&
        canonicalVersions[0] === proof.initialVersion + 1 &&
        canonicalVersions[1] === canonicalVersions[0] &&
        proof.dependencyAdvanced === true &&
        proof.transientFailure?.sqlState === "40001" &&
        proof.transientFailure?.classification === "transient" &&
        proof.transientFailure?.retryable === true &&
        proof.transientFailure?.retryAttempt === 1 &&
        proof.transientFailure?.mutationIdSha256 === sequentialMutationIds[0] &&
        proof.serverMutationCount === 2 &&
        proof.canonicalReceiptCount === 2 &&
        proof.completedCanonicalReceiptCount === 2 &&
        proof.taskCompletionRowCount === 1 &&
        proof.reloadConverged === true &&
        proof.duplicateExecutionCount === 0 &&
        proof.duplicateReceiptCount === 0;
      return {
        kind: "offline-reconnect",
        artifact: sources.offline.artifact,
        sourceId: "deterministic-offline-reconnect-race",
        status: passed ? "passed" : "failed",
        ...timeRange(proof, fallbackTime),
        assertions: [
          `queue ${proof.queueBeforeReconnect} → ${proof.queueAfterReconnect}`,
          `sequential mutation identities ${sequentialMutationIds.length}, first action remained durable ${proof.firstStillDurable}`,
          `synchronization passes ${proof.synchronizationPassCount}, client attempts ${proof.clientAttemptCount}, maximum overlap ${proof.maximumActiveClientAttempts}`,
          `canonical version ${proof.initialVersion} → ${canonicalVersions.join(" → ")}, transient retry ${proof.transientFailure?.sqlState}`,
          `canonical server mutations ${proof.serverMutationCount}, completed receipts ${proof.completedCanonicalReceiptCount}, duplicate executions ${proof.duplicateExecutionCount}`,
          `reload convergence ${proof.reloadConverged}`,
        ],
        failure: passed
          ? null
          : { reason: "Structured offline reconnect assertions failed." },
      };
    }
    throw new Error(`Unknown source resolver ${spec.resolver}`);
  }

  const journeys = [];
  for (const journeyId of requiredJourneyIds) {
    const contract = contracts[journeyId];
    const resolved = [];
    for (const spec of contract.sources) resolved.push(await resolve(spec));
    const failing = resolved.filter((source) => source.status !== 'passed');
    const startedAt = resolved.map((source) => source.startedAt).sort()[0];
    const finishedAt = resolved.map((source) => source.finishedAt).sort().at(-1);
    journeys.push({
      schemaVersion: '2.0.0',
      exactGitHead,
      workflowRunId: binding.workflowRunId,
      journeyId,
      testId: contract.testId,
      startedAt,
      finishedAt,
      status: failing[0]?.status ?? 'passed',
      mandatory: true,
      environment: binding.environment,
      tenantFixtureIds: sources.phase2d.value.tenantFixtureIds,
      sources: resolved,
      assertions: contract.assertions,
      failure: failing.length ? { failedSources: failing.map((source) => source.sourceId) } : null,
    });
  }

  const summary = {
    passed: journeys.filter((entry) => entry.status === 'passed').length,
    failed: journeys.filter((entry) => ['failed', 'timedOut', 'interrupted'].includes(entry.status)).length,
    skipped: journeys.filter((entry) => entry.status === 'skipped').length,
    mandatory: requiredJourneyIds.length,
  };
  const sourceArtifacts = Object.values(sources).map((source) => source.artifact);
  return {
    schemaVersion: '2.0.0',
    exactGitHead,
    workflowRunId: binding.workflowRunId,
    environment: binding.environment,
    generatedAt: new Date().toISOString(),
    dataPathProof: sources.dataPath.artifact,
    fixtureEvidence: sources.fixtures.artifact,
    journeys,
    summary,
    sourceArtifacts,
  };
}

async function allFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(path)));
    else files.push(path);
  }
  return files;
}

async function validate(evidence) {
  assert(evidence.schemaVersion === '2.0.0', 'Unsupported evidence schema.');
  assert(evidence.exactGitHead === execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'Evidence was generated for another git head.');
  assert(Date.now() - Date.parse(evidence.generatedAt) <= 12 * 60 * 60 * 1000, 'Evidence is stale (older than 12 hours).');
  assert(Date.parse(evidence.generatedAt) <= Date.now() + 5 * 60 * 1000, 'Evidence timestamp is unexpectedly in the future.');
  if (process.env.CI) assert(typeof evidence.workflowRunId === 'string' && evidence.workflowRunId.length > 0, 'CI evidence has no workflow run ID.');
  const ids = evidence.journeys.map((journey) => journey.journeyId);
  assert(new Set(ids).size === ids.length, 'Duplicate journey IDs are forbidden.', ids);
  assert(JSON.stringify([...ids].sort()) === JSON.stringify([...requiredJourneyIds].sort()), 'Mandatory journey set is incomplete.', ids);
  for (const journey of evidence.journeys) {
    assert(journey.schemaVersion === evidence.schemaVersion && journey.mandatory === true, `Journey ${journey.journeyId} violates the evidence schema contract.`);
    assert(/^FG-P2D-[A-Z0-9-]+$/u.test(journey.testId), `Journey ${journey.journeyId} has an invalid test ID.`);
    assert(Array.isArray(journey.tenantFixtureIds) && journey.tenantFixtureIds.length > 0, `Journey ${journey.journeyId} has no fixture identifiers.`);
    assert(Array.isArray(journey.assertions) && journey.assertions.length > 0, `Journey ${journey.journeyId} has no assertions.`);
    assert(Date.parse(journey.startedAt) <= Date.parse(journey.finishedAt), `Journey ${journey.journeyId} has an invalid time range.`);
    assert(Date.now() - Date.parse(journey.finishedAt) <= 12 * 60 * 60 * 1000, `Journey ${journey.journeyId} has stale source evidence.`);
    assert(journey.status === 'passed', `Mandatory journey ${journey.journeyId} did not pass.`, journey.failure);
    assert(journey.sources.length > 0, `Journey ${journey.journeyId} has no source evidence.`);
    assert(journey.sources.every((source) => source.status === 'passed'), `Journey ${journey.journeyId} claims pass with a failed/skipped source.`);
    assert(journey.exactGitHead === evidence.exactGitHead && journey.environment === evidence.environment, `Journey ${journey.journeyId} belongs to another head/environment.`);
    for (const source of journey.sources) {
      assert(typeof source.sourceId === 'string' && source.sourceId.length > 0, `Journey ${journey.journeyId} has a static or unidentified result source.`);
      assert(Array.isArray(source.assertions) && source.assertions.length > 0, `Journey ${journey.journeyId} source ${source.sourceId} has no observed assertions.`);
      assert(Date.parse(source.startedAt) <= Date.parse(source.finishedAt), `Journey ${journey.journeyId} source ${source.sourceId} has an invalid time range.`);
      assert(/^[0-9a-f]{64}$/u.test(source.artifact?.sha256 ?? ''), `Journey ${journey.journeyId} source ${source.sourceId} has no artifact hash.`);
      const sourceBytes = await readFile(join(root, source.artifact.path));
      assert(createHash('sha256').update(sourceBytes).digest('hex') === source.artifact.sha256, `Journey ${journey.journeyId} source ${source.sourceId} artifact hash mismatch.`);
    }
  }
  assert(evidence.summary.failed === 0 && evidence.summary.skipped === 0 && evidence.summary.passed === requiredJourneyIds.length, 'Acceptance summary is not fully green.', evidence.summary);
  const proofFiles = (await allFiles(join(root, 'artifacts'))).filter((path) => path.endsWith('data-path-proof.json'));
  assert(proofFiles.length === 1, `Expected exactly one structured data-path proof, found ${proofFiles.length}.`, proofFiles);
  const sourceText = (await Promise.all(evidence.sourceArtifacts.map(({ path }) => readFile(join(root, path), 'utf8')))).join('\n');
  const forbidden = [
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
    /"(?:password|recoveryToken|recoveryCode|serviceRoleKey|jwt)"\s*:\s*"(?!\[redacted)/iu,
    /\bBearer\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]{20,}/iu,
  ];
  assert(forbidden.every((pattern) => !pattern.test(sourceText)), 'Forbidden secret material found in acceptance artifacts.');
}

if (process.argv.includes('--check')) {
  assert(existsSync(outputPath), `Missing generated evidence: ${relative(root, outputPath)}`);
  const evidence = JSON.parse(await readFile(outputPath, 'utf8'));
  await validate(evidence);
  console.log(`Fieldgrid Phase 2 runtime acceptance passed: ${evidence.summary.passed}/${evidence.summary.mandatory}`);
} else {
  const evidence = await collect();
  await validate(evidence);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Wrote runtime-derived acceptance evidence to ${relative(root, outputPath)}`);
}
