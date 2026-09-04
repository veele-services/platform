import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  attestationOutputMatches,
  compareRouteSources,
  collectTypescriptSymbolsFromSource,
  computeBaselineCaptureBindingSha256,
  computeBaselineReviewerAttestationSha256,
  computeCaptureContractRootSha256,
  computeFieldflowContractDigests,
  computeFieldflowContractRootSha256,
  computeTrustedDependencyInputsDigest,
  computeProductionSourceDigest,
  contrastRatio,
  discoverClientImportedServerActions,
  discoverComponentNamedExports,
  discoverPageSources,
  readPngDimensions,
  readPlatformBaseSource,
  requiredEvidenceCommandIds,
  routeFromSource,
  validateCaptureContract,
  validateBaselineScenarioEvidencePayload,
  validateBaselineExternalEvidence,
  validateComponentApiContract,
  validateComponentSourceCoverage,
  validateComponentStates,
  validateAcceptance,
  validateFieldflowHandoff,
  validateFieldflowContractRoot,
  validateCandidateCheckoutSafety,
  validateLifecycleTransition,
  validateMismatchTraceability,
  validateNavigationContract,
  validatePlanboardActionContract,
  validateProductionInventory,
  validateRequirementEvidence,
  validateEvidenceIndexPayload,
  validateEvidencePromotion,
  validateMachineEvidenceReport,
  validateRiskEvidence,
  validateRoutes,
  validateSurfaces,
  validateThemeDerivationReference,
  validateTokens,
  validateVerificationMatrix,
  validateVerificationMatrixEvidence,
} from "../scripts/fieldgrid-fieldflow-calm-handoff.mjs";
import { verifyManifest as verifyThemeManifest } from "../docs/uiux/fieldflow-calm-handoff/reference/theme-derivation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = resolve(ROOT, "docs/uiux/fieldflow-calm-handoff");

function manifest(path) {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, path), "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function verificationMatrixEvidenceFixture(requirementId = "FFC-BRAND-013") {
  const matrixPath = resolve(
    PACKAGE_ROOT,
    "manifests/verification-matrix.json",
  );
  const matrix = manifest("manifests/verification-matrix.json");
  const acceptance = manifest("manifests/acceptance.json");
  const item = acceptance.requirements.find(
    (requirement) => requirement.id === requirementId,
  );
  const binding = matrix.requirementBindings.find(
    (candidate) => candidate.requirementId === requirementId,
  );
  assert.ok(item);
  assert.ok(binding);
  const coverage = (expected, matrixId, extra = {}) => ({
    ...extra,
    tupleCount: expected.tupleCount,
    tupleIdStreamSha256: expected.tupleIdStreamSha256,
    tuplePayloadStreamSha256: expected.tuplePayloadStreamSha256,
    executedTupleCount: expected.tupleCount,
    passedTupleCount: expected.tupleCount,
    failedTupleCount: 0,
    skippedTupleCount: 0,
    notRunTupleCount: 0,
    shards: [
      {
        ordinalStartInclusive: 0,
        ordinalEndExclusive: expected.tupleCount,
        tupleCount: expected.tupleCount,
        tupleIdStreamSha256: expected.tupleIdStreamSha256,
        tuplePayloadStreamSha256: expected.tuplePayloadStreamSha256,
        assertionReportPath: `docs/uiux/fieldflow-calm-handoff/evidence/implementation/verification-matrix/${matrixId}.json`,
        assertionReportSha256: "a".repeat(64),
      },
    ],
  });
  const sharedMatrices = binding.sharedMatrixIds.map((matrixId) => {
    const expected = matrix.sharedFullCartesianMatrices.find(
      (candidate) => candidate.id === matrixId,
    );
    assert.ok(expected);
    return coverage(expected, matrixId, {
      matrixId,
      requirementIds: expected.requirementIds,
    });
  });
  const evidence = {
    manifestPath:
      "docs/uiux/fieldflow-calm-handoff/manifests/verification-matrix.json",
    manifestSha256: createHash("sha256")
      .update(readFileSync(matrixPath))
      .digest("hex"),
    verificationPlanRootSha256: matrix.verificationPlanRootSha256,
    requirement: coverage(binding, requirementId, { requirementId }),
    sharedMatrices,
  };
  return {
    item,
    evidence,
    matrix,
    matrixBundle: { path: matrixPath, manifest: matrix },
  };
}

function baselineScenarioFixture() {
  const contract = clone(manifest("evidence/visual/capture-contract.json"));
  contract.state = "BASELINE_READY";
  contract.environment.runtimeImageDigest.value = `sha256:${"a".repeat(64)}`;
  contract.environment.fonts.resolvedFiles = [
    {
      family: "Aptos",
      file: "/opt/fonts/aptos.woff2",
      sha256: "b".repeat(64),
    },
  ];
  const scenario = contract.scenarios.find(
    (candidate) => candidate.id === "dashboard-desktop-clean",
  );
  const profile = contract.setupDriver.profiles[scenario.setupProfile];
  const contractRootSha256 = computeCaptureContractRootSha256(contract);
  const driver = {
    engine: contract.setupDriver.engine,
    playwrightVersion: contract.environment.playwrightVersion,
    browserName: contract.environment.browser.name,
    browserRevision: contract.environment.browser.playwrightRevision,
    browserVersion: contract.environment.browser.version,
  };
  const binding = {
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    captureContractRootSha256: contractRootSha256,
    runtimeImageDigest: contract.environment.runtimeImageDigest.value,
    driver,
    viewport: {
      id: scenario.viewport,
      width: contract.viewports[scenario.viewport].width,
      height: contract.viewports[scenario.viewport].height,
      deviceScaleFactor: contract.environment.deviceScaleFactor,
    },
  };
  const artifactHashes = {
    png: "c".repeat(64),
    domSnapshot: "d".repeat(64),
    computedGeometry: "e".repeat(64),
    computedStyles: "f".repeat(64),
    setupActionLog: "1".repeat(64),
    runtimeErrorLog: "2".repeat(64),
  };
  const provenance = {
    provider: "github-actions",
    repository: "veele-services/platform",
    workflowPath: ".github/workflows/fieldflow-calm-visual-baseline.yml",
    workflowBlobSha256: "4".repeat(64),
    jobName: "normalized-baseline",
    jobId: 87654321,
    eventName: "pull_request",
    runId: 987654321,
    runAttempt: 1,
    headCommit: "3".repeat(40),
    baseCommit: "4".repeat(40),
    pullRequestNumber: 4242,
    attestationProvider: "github-artifact-attestations",
  };
  const captureBinding = {
    schemaVersion: 1,
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    captureContractRootSha256: contractRootSha256,
    runtimeImageDigest: contract.environment.runtimeImageDigest.value,
    driver,
    provenance,
    artifacts: artifactHashes,
    sha256: "",
  };
  captureBinding.sha256 = computeBaselineCaptureBindingSha256(captureBinding);
  const evidence = {
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    authorId: "capture-author",
    provenance,
    png: {
      path: scenario.output,
      sha256: artifactHashes.png,
      width: contract.viewports[scenario.viewport].width,
      height: contract.viewports[scenario.viewport].height,
    },
    domSnapshot: {
      path: `normalized/${scenario.id}.dom.json`,
      sha256: artifactHashes.domSnapshot,
    },
    computedGeometry: {
      path: `normalized/${scenario.id}.geometry.json`,
      sha256: artifactHashes.computedGeometry,
    },
    computedStyles: {
      path: `normalized/${scenario.id}.styles.json`,
      sha256: artifactHashes.computedStyles,
    },
    setupActionLog: {
      path: `normalized/${scenario.id}.setup.json`,
      sha256: artifactHashes.setupActionLog,
    },
    runtimeErrorLog: {
      path: `normalized/${scenario.id}.errors.json`,
      sha256: artifactHashes.runtimeErrorLog,
    },
    captureBinding,
    reviewers: [],
  };
  for (const [index, role] of ["product-design", "visual-a11y"].entries()) {
    const reviewId = 7000 + index;
    const reviewer = {
      id: `${role}-reviewer`,
      role,
      independent: true,
      selfReview: false,
      approval: {
        provider: "github-pull-request-review",
        repository: "veele-services/platform",
        pullRequestNumber: provenance.pullRequestNumber,
        reviewId,
        state: "APPROVED",
        reviewedHeadCommit: provenance.headCommit,
        submittedAt: `2026-09-03T10:0${index}:00Z`,
        apiUrl: `https://api.github.com/repos/veele-services/platform/pulls/${provenance.pullRequestNumber}/reviews/${reviewId}`,
        attestationSha256: "",
      },
    };
    reviewer.approval.attestationSha256 =
      computeBaselineReviewerAttestationSha256(evidence, reviewer);
    evidence.reviewers.push(reviewer);
  }
  const requiredSelectors = [
    ...contract.normalization.pixelGate.geometryComparison
      .requiredSelectorsByFormFactor[scenario.viewport],
    ...contract.normalization.pixelGate.geometryComparison
      .requiredSelectorsByPattern[scenario.pattern],
  ];
  const computedGeometry = {
    schemaVersion: 1,
    artifactType: "computed-geometry",
    binding,
    maximumAbsoluteDeltaPx: 1,
    measurements: requiredSelectors.map((selector) => ({
      selector,
      referenceRect: { x: 0, y: 0, width: 100, height: 100 },
      capturedRect: { x: 0, y: 0, width: 100, height: 100 },
      deltaPx: { x: 0, y: 0, width: 0, height: 0 },
    })),
    allInteractiveTargetsMeasured: true,
    interactiveTargetCount: 1,
    interactiveTargets: [
      {
        id: "dashboard-primary-action",
        selector: ".workspace-heading button",
        role: "button",
        name: "Nieuwe opdracht",
        rect: { x: 1200, y: 96, width: 44, height: 44 },
      },
    ],
  };
  const artifacts = {
    setupActionLog: {
      schemaVersion: 1,
      artifactType: "setup-action-log",
      binding,
      profileId: scenario.setupProfile,
      beforeEach: contract.normalization.beforeEach.map(
        (instruction, index) => ({ index, instruction, status: "passed" }),
      ),
      steps: profile.steps.map((definition, index) => ({
        index,
        definition,
        status: "passed",
      })),
      sentinels: profile.expectedDomSentinels.map((locator, index) => ({
        index,
        locator,
        status: "passed",
        matchCount: 1,
      })),
      workspaceScroll: scenario.workspaceScroll,
      boardScroll: scenario.boardScroll ?? null,
      errors: [],
    },
    runtimeErrorLog: {
      schemaVersion: 1,
      artifactType: "runtime-error-log",
      binding,
      ...Object.fromEntries(
        contract.evidenceContract.artifactSchemas.runtimeErrorLog.emptyArrays.map(
          (field) => [field, []],
        ),
      ),
    },
    computedGeometry,
    computedStyles: {
      schemaVersion: 1,
      artifactType: "computed-styles",
      binding,
      canonicalThemeStylesheetSha256:
        contract.normalization.canonicalThemeStylesheet.sha256,
      referenceStylesheetSha256:
        contract.normalization.referenceStylesheet.sha256,
      semanticOutputSha256:
        contract.normalization.canonicalThemeStylesheet
          .expectedSemanticOutputSha256,
      themeResolutionSha256:
        contract.normalization.canonicalThemeStylesheet
          .expectedResolutionSha256,
      loadedCaptureStylesheets: [
        {
          file: contract.normalization.canonicalThemeStylesheet.file,
          sha256: contract.normalization.canonicalThemeStylesheet.sha256,
        },
        {
          file: contract.normalization.referenceStylesheet.file,
          sha256: contract.normalization.referenceStylesheet.sha256,
        },
      ],
      fontsReady: true,
      resolvedFonts: clone(contract.environment.fonts.resolvedFiles),
      rootVariables: clone(
        contract.normalization.canonicalThemeStylesheet
          .computedVariableSentinels,
      ),
      portalChecks: [],
      unexpectedStylesheets: [],
    },
    domSnapshot: {
      schemaVersion: 1,
      artifactType: "dom-snapshot",
      binding,
      body: { dataConcept: "fieldflow" },
      application: {
        selector: contract.normalization.applicationSelector,
        count: 1,
        rect: {
          x: 0,
          y: 0,
          width: contract.viewports[scenario.viewport].width,
          height: contract.viewports[scenario.viewport].height,
        },
        declaredStyle: contract.normalization.applicationStyle,
      },
      sentinels: profile.expectedDomSentinels.map((locator, index) => ({
        index,
        locator,
        matchCount: 1,
      })),
      forbiddenSelectors:
        contract.evidenceContract.artifactSchemas.domSnapshot.forbiddenSelectors.map(
          (selector) => ({ selector, count: 0 }),
        ),
      forbiddenAccessibleNames:
        contract.evidenceContract.artifactSchemas.domSnapshot.forbiddenAccessibleNames.map(
          (name) => ({ name, count: 0 }),
        ),
      hiddenProductionNodes: [],
      interactiveTargetCount: computedGeometry.interactiveTargetCount,
    },
  };
  return { contract, scenario, evidence, artifacts };
}

function mobileBaselineScenarioFixture() {
  const contract = clone(manifest("evidence/visual/capture-contract.json"));
  contract.state = "BASELINE_READY";
  contract.environment.runtimeImageDigest.value = `sha256:${"a".repeat(64)}`;
  contract.environment.fonts.resolvedFiles = [
    {
      family: "Aptos",
      file: "/opt/fonts/aptos.woff2",
      sha256: "b".repeat(64),
    },
  ];
  const scenario = contract.scenarios.find(
    (candidate) => candidate.id === "dashboard-mobile-clean",
  );
  const mobileEvidence = contract.evidenceContract.mobileProductionEvidence;
  const contractRootSha256 = computeCaptureContractRootSha256(contract);
  const driver = {
    engine: contract.setupDriver.engine,
    playwrightVersion: contract.environment.playwrightVersion,
    browserName: contract.environment.browser.name,
    browserRevision: contract.environment.browser.playwrightRevision,
    browserVersion: contract.environment.browser.version,
  };
  const viewport = {
    id: scenario.viewport,
    width: contract.viewports[scenario.viewport].width,
    height: contract.viewports[scenario.viewport].height,
    deviceScaleFactor: contract.environment.deviceScaleFactor,
  };
  const binding = {
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    captureContractRootSha256: contractRootSha256,
    runtimeImageDigest: contract.environment.runtimeImageDigest.value,
    driver,
    viewport,
  };
  const artifactHashes = {
    png: "c".repeat(64),
    domSnapshot: "d".repeat(64),
    computedGeometry: "e".repeat(64),
    computedStyles: "f".repeat(64),
    setupActionLog: "1".repeat(64),
    runtimeErrorLog: "2".repeat(64),
    axeReport: "5".repeat(64),
    keyboardInteractionTrace: "6".repeat(64),
    touchInteractionTrace: "7".repeat(64),
  };
  const provenance = {
    provider: "github-actions",
    repository: "veele-services/platform",
    workflowPath: ".github/workflows/fieldflow-calm-visual-baseline.yml",
    workflowBlobSha256: "4".repeat(64),
    jobName: "normalized-baseline",
    jobId: 87654321,
    eventName: "pull_request",
    runId: 987654321,
    runAttempt: 1,
    headCommit: "3".repeat(40),
    baseCommit: "4".repeat(40),
    pullRequestNumber: 4242,
    attestationProvider: "github-artifact-attestations",
  };
  const captureBinding = {
    schemaVersion: 1,
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    captureContractRootSha256: contractRootSha256,
    runtimeImageDigest: contract.environment.runtimeImageDigest.value,
    driver,
    provenance,
    artifacts: artifactHashes,
    sha256: "",
  };
  captureBinding.sha256 = computeBaselineCaptureBindingSha256(captureBinding);
  const artifactPath = (field) =>
    mobileEvidence.artifactPathTemplates[field].replace(
      "{scenarioId}",
      scenario.id,
    );
  const assertions = [
    ...contract.normalization.responsiveContractGate.transformsByPattern[
      scenario.pattern
    ].assertions,
    ...contract.normalization.responsiveContractGate.accessibilityAssertions,
  ].map((claim, index) => ({
    id: `responsive-${String(index + 1).padStart(2, "0")}`,
    claim,
    status: "passed",
  }));
  const evidence = {
    scenarioId: scenario.id,
    prototypeCommit: contract.source.prototypeCommit,
    authorId: "capture-author",
    provenance,
    png: {
      path: artifactPath("png"),
      sha256: artifactHashes.png,
      width: viewport.width,
      height: viewport.height,
    },
    domSnapshot: {
      path: artifactPath("domSnapshot"),
      sha256: artifactHashes.domSnapshot,
    },
    computedGeometry: {
      path: artifactPath("computedGeometry"),
      sha256: artifactHashes.computedGeometry,
    },
    computedStyles: {
      path: artifactPath("computedStyles"),
      sha256: artifactHashes.computedStyles,
    },
    setupActionLog: {
      path: artifactPath("setupActionLog"),
      sha256: artifactHashes.setupActionLog,
    },
    runtimeErrorLog: {
      path: artifactPath("runtimeErrorLog"),
      sha256: artifactHashes.runtimeErrorLog,
    },
    captureBinding,
    reviewers: [],
    referenceMode: "mobile-responsive-contract",
    headCommit: provenance.headCommit,
    viewport,
    transformPattern: scenario.pattern,
    responsiveContractSha256: createHash("sha256")
      .update(JSON.stringify(contract.normalization.responsiveContractGate))
      .digest("hex"),
    axeReport: {
      path: artifactPath("axeReport"),
      sha256: artifactHashes.axeReport,
    },
    keyboardInteractionTrace: {
      path: artifactPath("keyboardInteractionTrace"),
      sha256: artifactHashes.keyboardInteractionTrace,
    },
    touchInteractionTrace: {
      path: artifactPath("touchInteractionTrace"),
      sha256: artifactHashes.touchInteractionTrace,
    },
    assertions,
    status: "passed",
  };
  for (const [index, role] of ["product-design", "visual-a11y"].entries()) {
    const reviewId = 8000 + index;
    const reviewer = {
      id: `${role}-mobile-reviewer`,
      role,
      independent: true,
      selfReview: false,
      approval: {
        provider: "github-pull-request-review",
        repository: "veele-services/platform",
        pullRequestNumber: provenance.pullRequestNumber,
        reviewId,
        state: "APPROVED",
        reviewedHeadCommit: provenance.headCommit,
        submittedAt: `2026-09-03T11:0${index}:00Z`,
        apiUrl: `https://api.github.com/repos/veele-services/platform/pulls/${provenance.pullRequestNumber}/reviews/${reviewId}`,
        attestationSha256: "",
      },
    };
    reviewer.approval.attestationSha256 =
      computeBaselineReviewerAttestationSha256(evidence, reviewer);
    evidence.reviewers.push(reviewer);
  }
  const requiredRegions = [
    ...contract.normalization.responsiveContractGate.geometryAssertions
      .requiredShellRegions,
    ...contract.normalization.responsiveContractGate.transformsByPattern[
      scenario.pattern
    ].requiredRegions,
  ].filter((value, index, values) => values.indexOf(value) === index);
  const regionRects = new Map([
    ["[data-ff-region=application]", { x: 0, y: 0, width: 390, height: 844 }],
    ["[data-ff-region=mobile-header]", { x: 0, y: 0, width: 390, height: 66 }],
    ["[data-ff-region=workspace]", { x: 0, y: 66, width: 390, height: 778 }],
    [
      "[data-ff-region=page-heading]",
      { x: 16, y: 82, width: 358, height: 100 },
    ],
    ["[data-ff-pattern=dashboard]", { x: 16, y: 198, width: 358, height: 630 }],
    [
      "[data-ff-region=metric-grid]",
      { x: 16, y: 198, width: 358, height: 280 },
    ],
    [
      "[data-ff-region=dashboard-content]",
      { x: 16, y: 494, width: 358, height: 334 },
    ],
  ]);
  const geometryLimits =
    contract.normalization.responsiveContractGate.geometryAssertions;
  const computedGeometry = {
    schemaVersion: 1,
    artifactType: "semantic-region-geometry",
    binding,
    referenceMode: "mobile-responsive-contract",
    regionMeasurements: requiredRegions.map((selector) => ({
      selector,
      count: 1,
      rect: regionRects.get(selector),
    })),
    documentHorizontalOverflowPx: 0,
    allInteractiveTargetsMeasured: true,
    interactiveTargetCount: 1,
    interactiveTargets: [
      {
        id: "dashboard-mobile-primary-action",
        selector: "[data-ff-region=page-heading] button",
        role: "button",
        name: "Nieuwe opdracht",
        rect: { x: 330, y: 94, width: 44, height: 44 },
      },
    ],
    minimumAdjacentInteractiveTargetGapPx:
      geometryLimits.minimumAdjacentInteractiveTargetGapPx,
    minimumAdjacentContainerGapPx: geometryLimits.minimumAdjacentContainerGapPx,
    minimumTextToBorderPaddingPx: geometryLimits.minimumTextToBorderPaddingPx,
    assertions,
  };
  const interactionTrace = (inputMode) => ({
    schemaVersion: 1,
    artifactType: "interaction-trace",
    binding,
    referenceMode: "mobile-responsive-contract",
    inputMode,
    initialFocusOrTarget: "Nieuwe opdracht",
    steps: [{ action: "activate and cancel", status: "passed" }],
    cancelReturnTarget: "Nieuwe opdracht",
    announcements: ["Actie geannuleerd"],
    dragUsed: false,
    errors: [],
  });
  const artifacts = {
    setupActionLog: {
      schemaVersion: 1,
      artifactType: "production-setup-action-log",
      binding,
      profileId: scenario.id,
      beforeEach: mobileEvidence.beforeEach.map((instruction, index) => ({
        index,
        instruction,
        status: "passed",
      })),
      steps: mobileEvidence.setupActionsByScenario[scenario.id].map(
        (claim, index) => ({
          index,
          definition: { op: "production-assertion", claim },
          status: "passed",
        }),
      ),
      sentinels: requiredRegions.map((value, index) => ({
        index,
        locator: { by: "css", value },
        status: "passed",
        matchCount: 1,
      })),
      workspaceScroll: scenario.workspaceScroll,
      boardScroll: scenario.boardScroll ?? null,
      errors: [],
    },
    runtimeErrorLog: {
      schemaVersion: 1,
      artifactType: "runtime-error-log",
      binding,
      ...Object.fromEntries(
        contract.evidenceContract.artifactSchemas.runtimeErrorLog.emptyArrays.map(
          (field) => [field, []],
        ),
      ),
    },
    computedGeometry,
    computedStyles: {
      schemaVersion: 1,
      artifactType: "production-computed-styles",
      binding,
      referenceMode: "mobile-responsive-contract",
      fontsReady: true,
      resolvedFonts: clone(contract.environment.fonts.resolvedFiles),
      rootVariables: clone(
        contract.normalization.canonicalThemeStylesheet
          .computedVariableSentinels,
      ),
      portalChecks: [],
      captureOnlyStylesheetsLoaded: [],
      errors: [],
    },
    domSnapshot: {
      schemaVersion: 1,
      artifactType: "production-dom-snapshot",
      binding,
      referenceMode: "mobile-responsive-contract",
      applicationRegionCount: 1,
      regions: requiredRegions.map((selector) => ({ selector, count: 1 })),
      prototypeSelectorMatches: [
        { selector: ".lab-bar", count: 0 },
        { selector: ".concept-caption", count: 0 },
      ],
      desktopDuplicateRegionMatches: [],
      interactiveTargetCount: computedGeometry.interactiveTargetCount,
      errors: [],
    },
    axeReport: {
      schemaVersion: 1,
      artifactType: "axe-report",
      binding,
      referenceMode: "mobile-responsive-contract",
      criticalViolations: 0,
      seriousViolations: 0,
      violations: [],
      incomplete: [],
    },
    keyboardInteractionTrace: interactionTrace("keyboard"),
    touchInteractionTrace: interactionTrace("touch"),
  };
  return { contract, scenario, evidence, artifacts };
}

function implementationEvidenceFixture(state = "IMPLEMENTED") {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const blob = execFileSync("git", ["show", `${commit}:package.json`], {
    cwd: ROOT,
  });
  const item = {
    id: "FFC-TEST-001",
    state,
    verification: "unit",
    routes: ["/customers"],
    themes: ["default"],
    viewports: [320],
    densities: ["compact", "comfortable", "spacious"],
    evidence: {
      commit,
      index: `outputs/fieldflow-calm/index.json#sha256=${"a".repeat(64)}`,
      ...(state === "RELEASED" ? { releasedCommit: commit } : {}),
    },
  };
  const index = {
    schemaVersion: 2,
    subjectId: item.id,
    headCommit: commit,
    authorId: "implementer-a",
    verification: item.verification,
    codePaths: [
      {
        path: "package.json",
        blobSha256: createHash("sha256").update(blob).digest("hex"),
      },
    ],
    commands: [],
    artifacts: { runtime: [], staging: [] },
    reviewers: [],
    provenance: null,
    release: null,
  };
  return { item, index };
}

function evidenceProvenanceFixture(item) {
  return {
    provider: "github-actions",
    repository: "veele-services/platform",
    headCommit: item.evidence.commit,
    baseCommit: "b".repeat(40),
    pullRequestNumber: 42,
    workflowPath: ".github/workflows/fieldflow-calm-evidence.yml",
    workflowBlobSha256: "c".repeat(64),
    runId: 1001,
    runAttempt: 1,
    jobId: 2002,
    jobName: "fieldflow-evidence",
    eventName: "pull_request",
    attestationProvider: "github-artifact-attestations",
  };
}

function evidenceReportFixture(item, provenance) {
  return {
    schemaVersion: 1,
    kind: "runtime",
    subjectId: item.id,
    headCommit: item.evidence.commit,
    verification: item.verification,
    provenance,
    coverage: {
      routes: item.routes,
      themes: item.themes,
      viewports: item.viewports,
      densities: item.densities,
      commandIds: ["fieldflow-runtime"],
      testIds: ["unit:subject-behaviour"],
    },
    assertions: [
      {
        id: "assertion:subject-behaviour",
        testId: "unit:subject-behaviour",
        status: "passed",
        message: "Subject behaviour passed in the automated runtime suite.",
      },
    ],
    summary: { passed: 1, failed: 0, skipped: 0, notRun: 0, manual: 0 },
    errors: { console: [], page: [], request: [], server: [], hydration: [] },
    attachments: [
      {
        type: "junit",
        path: "outputs/fieldflow-calm/runtime.junit.xml",
        sha256: "d".repeat(64),
      },
    ],
  };
}

test("Fieldflow Calm handoff is complete and internally consistent", () => {
  assert.deepEqual(validateFieldflowHandoff(), []);
});

test("protected contract root binds every normative input and external trust", () => {
  const rootManifest = manifest("manifests/contract-root.json");
  assert.deepEqual(
    rootManifest.digests,
    computeFieldflowContractDigests({ root: ROOT, packageRoot: PACKAGE_ROOT }),
  );
  assert.equal(
    rootManifest.rootSha256,
    computeFieldflowContractRootSha256(rootManifest),
  );
  const validErrors = [];
  validateFieldflowContractRoot(validErrors, {
    root: ROOT,
    packageRoot: PACKAGE_ROOT,
    manifest: rootManifest,
  });
  assert.deepEqual(validErrors, []);

  const drifted = clone(rootManifest);
  drifted.digests.normativeDocs = "0".repeat(64);
  const driftErrors = [];
  validateFieldflowContractRoot(driftErrors, {
    root: ROOT,
    packageRoot: PACKAGE_ROOT,
    manifest: drifted,
  });
  assert.match(
    driftErrors.join("\n"),
    /contract-rootdigestvector.*contract-root SHA-256/su,
  );

  const trustErrors = [];
  validateFieldflowContractRoot(trustErrors, {
    root: ROOT,
    packageRoot: PACKAGE_ROOT,
    manifest: rootManifest,
    requireExternalTrust: true,
    trustedRoot: "f".repeat(64),
  });
  assert.match(trustErrors.join("\n"), /beschermde.*TRUSTED_ROOT_SHA256/su);
});

test("trusted dependency digest binds package-manager and executable dependency inputs", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-dependency-root-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    writeFileSync(
      resolve(fakeRoot, "package.json"),
      '{"devDependencies":{"typescript":"5.9.3"}}\n',
    );
    writeFileSync(
      resolve(fakeRoot, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    writeFileSync(resolve(fakeRoot, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(
      resolve(fakeRoot, ".npmrc"),
      "strict-peer-dependencies=true\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    const before = computeTrustedDependencyInputsDigest(fakeRoot);
    writeFileSync(
      resolve(fakeRoot, "package.json"),
      '{"devDependencies":{"typescript":"npm:untrusted-package@1.0.0"}}\n',
    );
    const after = computeTrustedDependencyInputsDigest(fakeRoot);
    assert.notEqual(after, before);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("artifact attestation output is bound to digest, HEAD, run and trusted workflow", () => {
  const expected = {
    sha256: "a".repeat(64),
    provenance: {
      headCommit: "b".repeat(40),
      runId: 12345,
      workflowPath: ".github/workflows/fieldflow-calm-evidence.yml",
    },
  };
  const record = [
    {
      subject: { digest: { sha256: expected.sha256 } },
      source: { digest: expected.provenance.headCommit },
      invocation: {
        id: `https://github.com/veele-services/platform/actions/runs/${expected.provenance.runId}`,
        workflow: expected.provenance.workflowPath,
      },
    },
  ];
  assert.equal(attestationOutputMatches(record, expected), true);
  record[0].source.digest = "c".repeat(40);
  assert.equal(attestationOutputMatches(record, expected), false);
});

test("protected candidate checkout rejects dirty trees, symlinks and non-exact commits", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-candidate-root-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    writeFileSync(resolve(fakeRoot, "regular.txt"), "trusted bytes\n");
    execFileSync("git", ["add", "regular.txt"], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "regular"], {
      cwd: fakeRoot,
    });
    const cleanHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const cleanErrors = [];
    validateCandidateCheckoutSafety(cleanErrors, {
      root: fakeRoot,
      expectedCommit: cleanHead,
    });
    assert.deepEqual(cleanErrors, []);

    writeFileSync(resolve(fakeRoot, "regular.txt"), "dirty bytes\n");
    const dirtyErrors = [];
    validateCandidateCheckoutSafety(dirtyErrors, {
      root: fakeRoot,
      expectedCommit: cleanHead,
    });
    assert.match(dirtyErrors.join("\n"), /gewijzigde of untracked bestanden/u);

    writeFileSync(resolve(fakeRoot, "regular.txt"), "trusted bytes\n");
    symlinkSync("regular.txt", resolve(fakeRoot, "linked.txt"));
    execFileSync("git", ["add", "linked.txt"], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "symlink"], {
      cwd: fakeRoot,
    });
    const symlinkHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const symlinkErrors = [];
    validateCandidateCheckoutSafety(symlinkErrors, {
      root: fakeRoot,
      expectedCommit: symlinkHead,
    });
    assert.match(symlinkErrors.join("\n"), /symlinks, submodules/u);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("protected lifecycle comparison rejects skips, downgrades and same-state evidence replacement", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-lifecycle-root-"));
  const basePackageRoot = resolve(fakeRoot, "base");
  const candidatePackageRoot = resolve(fakeRoot, "candidate");
  try {
    for (const packageRoot of [basePackageRoot, candidatePackageRoot]) {
      mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
      mkdirSync(resolve(packageRoot, "evidence/visual"), { recursive: true });
    }
    const writeLifecycle = (packageRoot, { acceptance, risk, capture }) => {
      writeFileSync(
        resolve(packageRoot, "manifests/acceptance.json"),
        `${JSON.stringify({ requirements: [acceptance] })}\n`,
      );
      writeFileSync(
        resolve(packageRoot, "manifests/risks.json"),
        `${JSON.stringify({ risks: [risk] })}\n`,
      );
      writeFileSync(
        resolve(packageRoot, "evidence/visual/capture-contract.json"),
        `${JSON.stringify(capture)}\n`,
      );
    };
    writeLifecycle(basePackageRoot, {
      acceptance: { id: "FFC-TEST", state: "CONTRACTED", evidence: null },
      risk: { id: "R-TEST", state: "MITIGATED", evidence: { index: "old" } },
      capture: {
        state: "CONTRACTED",
        environment: {
          runtimeImageDigest: { value: null },
          fonts: { resolvedFiles: null },
        },
        evidenceContract: { scenarioEvidence: null },
      },
    });
    writeLifecycle(candidatePackageRoot, {
      acceptance: { id: "FFC-TEST", state: "VERIFIED_LOCAL", evidence: null },
      risk: { id: "R-TEST", state: "MITIGATED", evidence: { index: "new" } },
      capture: {
        state: "CONTRACTED",
        environment: {
          runtimeImageDigest: { value: "sha256:changed" },
          fonts: { resolvedFiles: null },
        },
        evidenceContract: { scenarioEvidence: null },
      },
    });
    const errors = [];
    validateLifecycleTransition(errors, {
      basePackageRoot,
      candidatePackageRoot,
    });
    assert.match(errors.join("\n"), /status overslaan/u);
    assert.match(errors.join("\n"), /bewijs mag niet worden vervangen/u);
    assert.match(errors.join("\n"), /Visuele baseline.*bewijsvelden/su);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("evidence promotion allows only lifecycle manifests and their exact evidence closure", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-promotion-root-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/implementation"), {
      recursive: true,
    });
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          { id: "FFC-TEST-001", state: "CONTRACTED", evidence: null },
        ],
      })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "CONTRACTED",
        environment: {
          runtimeImageDigest: { value: null },
          fonts: { resolvedFiles: null },
        },
        evidenceContract: { scenarioEvidence: null },
      })}\n`,
    );
    writeFileSync(
      resolve(fakeRoot, "implementation.js"),
      "export const ok = false;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "common base B"], {
      cwd: fakeRoot,
    });
    const commonBase = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();

    writeFileSync(
      resolve(fakeRoot, "implementation.js"),
      "export const ok = true;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "implementation C"], {
      cwd: fakeRoot,
    });
    const implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    execFileSync(
      "git",
      ["checkout", "--quiet", "-b", "protected", commonBase],
      {
        cwd: fakeRoot,
      },
    );
    writeFileSync(
      resolve(fakeRoot, "implementation.js"),
      "export const ok = true;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "squash merge S"], {
      cwd: fakeRoot,
    });
    const protectedBase = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    execFileSync(
      "git",
      ["merge", "--quiet", "--no-ff", implementationCommit, "-m", "bind C"],
      { cwd: fakeRoot },
    );

    const evidencePath =
      "docs/uiux/fieldflow-calm-handoff/evidence/implementation/FFC-TEST-001.json";
    const evidenceIndex = {
      codePaths: [
        {
          path: "implementation.js",
          blobSha256: createHash("sha256")
            .update("export const ok = true;\n")
            .digest("hex"),
        },
      ],
      commands: [],
      artifacts: { runtime: [], staging: [] },
    };
    const evidenceBytes = `${JSON.stringify(evidenceIndex)}\n`;
    writeFileSync(resolve(fakeRoot, evidencePath), evidenceBytes);
    const evidenceSha256 = createHash("sha256")
      .update(evidenceBytes)
      .digest("hex");
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          {
            id: "FFC-TEST-001",
            state: "IMPLEMENTED",
            evidence: {
              commit: implementationCommit,
              index: `${evidencePath}#sha256=${evidenceSha256}`,
            },
          },
        ],
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "promotion D"], {
      cwd: fakeRoot,
    });
    const promotionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const validErrors = [];
    validateEvidencePromotion(validErrors, {
      root: fakeRoot,
      baseSha: protectedBase,
      candidateSha: promotionCommit,
    });
    assert.deepEqual(validErrors, []);

    writeFileSync(
      resolve(fakeRoot, "auth-bypass.js"),
      "export const bypass = true;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "smuggled code"], {
      cwd: fakeRoot,
    });
    const smuggledCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const smuggledErrors = [];
    validateEvidencePromotion(smuggledErrors, {
      root: fakeRoot,
      baseSha: protectedBase,
      candidateSha: smuggledCommit,
    });
    assert.match(
      smuggledErrors.join("\n"),
      /promotion bevat een niet-toegestaan pad: auth-bypass\.js/u,
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("evidence promotion rejects an implementation head outside promotion history", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-promotion-ancestry-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/implementation"), {
      recursive: true,
    });
    const baseAcceptance = {
      requirements: [
        { id: "FFC-TEST-001", state: "CONTRACTED", evidence: null },
      ],
    };
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify(baseAcceptance)}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "CONTRACTED",
        environment: {
          runtimeImageDigest: { value: null },
          fonts: { resolvedFiles: null },
        },
        evidenceContract: { scenarioEvidence: null },
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: fakeRoot,
    });
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();

    writeFileSync(
      resolve(fakeRoot, "implementation.js"),
      "export const c = true;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "unrelated C"], {
      cwd: fakeRoot,
    });
    const unrelatedImplementation = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["checkout", "--quiet", baseCommit], { cwd: fakeRoot });

    const evidencePath =
      "docs/uiux/fieldflow-calm-handoff/evidence/implementation/FFC-TEST-001.json";
    const evidenceBytes = `${JSON.stringify({
      codePaths: [],
      commands: [],
      artifacts: { runtime: [], staging: [] },
    })}\n`;
    writeFileSync(resolve(fakeRoot, evidencePath), evidenceBytes);
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          {
            id: "FFC-TEST-001",
            state: "IMPLEMENTED",
            evidence: {
              commit: unrelatedImplementation,
              index: `${evidencePath}#sha256=${createHash("sha256")
                .update(evidenceBytes)
                .digest("hex")}`,
            },
          },
        ],
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "divergent D"], {
      cwd: fakeRoot,
    });
    const promotionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const errors = [];
    validateEvidencePromotion(errors, {
      root: fakeRoot,
      baseSha: baseCommit,
      candidateSha: promotionCommit,
      basePackageRoot: packageRoot,
      candidatePackageRoot: packageRoot,
    });
    assert.match(
      errors.join("\n"),
      /implementation- of capture-HEAD .* is geen ancestor van promotion-HEAD/u,
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("evidence promotion rejects a proven implementation reverted before D", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-promotion-revert-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/implementation"), {
      recursive: true,
    });
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          { id: "FFC-TEST-001", state: "CONTRACTED", evidence: null },
        ],
      })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({ state: "CONTRACTED" })}\n`,
    );
    writeFileSync(resolve(fakeRoot, "implementation.js"), "old behavior\n");
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "protected base B"], {
      cwd: fakeRoot,
    });
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();

    writeFileSync(resolve(fakeRoot, "implementation.js"), "proven behavior\n");
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "implementation C"], {
      cwd: fakeRoot,
    });
    const implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();

    const evidencePath =
      "docs/uiux/fieldflow-calm-handoff/evidence/implementation/FFC-TEST-001.json";
    const evidenceBytes = `${JSON.stringify({
      codePaths: [
        {
          path: "implementation.js",
          blobSha256: createHash("sha256")
            .update("proven behavior\n")
            .digest("hex"),
        },
      ],
      commands: [],
      artifacts: { runtime: [], staging: [] },
    })}\n`;
    writeFileSync(resolve(fakeRoot, "implementation.js"), "old behavior\n");
    writeFileSync(resolve(fakeRoot, evidencePath), evidenceBytes);
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          {
            id: "FFC-TEST-001",
            state: "IMPLEMENTED",
            evidence: {
              commit: implementationCommit,
              index: `${evidencePath}#sha256=${createHash("sha256")
                .update(evidenceBytes)
                .digest("hex")}`,
            },
          },
        ],
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "promotion D"], {
      cwd: fakeRoot,
    });
    const promotionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const errors = [];
    validateEvidencePromotion(errors, {
      root: fakeRoot,
      baseSha: baseCommit,
      candidateSha: promotionCommit,
    });
    assert.match(
      errors.join("\n"),
      /bewezen codeblob ontbreekt of wijkt af op promotion-HEAD D/u,
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("implementation changes without a lifecycle advance remain outside the promotion allowlist", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-implementation-root-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual"), { recursive: true });
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({
        requirements: [
          { id: "FFC-TEST-001", state: "CONTRACTED", evidence: null },
        ],
      })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({ state: "CONTRACTED" })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "base"], {
      cwd: fakeRoot,
    });
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    mkdirSync(resolve(fakeRoot, "artifacts/backoffice/src"), {
      recursive: true,
    });
    writeFileSync(
      resolve(fakeRoot, "artifacts/backoffice/src/product.ts"),
      "export const implementation = true;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "implementation C"], {
      cwd: fakeRoot,
    });
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const errors = [];
    validateEvidencePromotion(errors, {
      root: fakeRoot,
      baseSha: baseCommit,
      candidateSha: candidateCommit,
    });
    assert.deepEqual(errors, []);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("baseline promotion permits only the capture contract and its scenario artifacts", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-baseline-promotion-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual/production"), {
      recursive: true,
    });
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({ requirements: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "CONTRACTED",
        evidenceContract: {
          artifactPathBase: "evidence/visual",
          scenarioEvidence: null,
        },
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "capture C"], {
      cwd: fakeRoot,
    });
    const captureCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    writeFileSync(
      resolve(packageRoot, "evidence/visual/production/scenario.png"),
      "capture bytes\n",
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "BASELINE_READY",
        evidenceContract: {
          artifactPathBase: "evidence/visual",
          scenarioEvidence: [
            {
              scenarioId: "scenario",
              provenance: { headCommit: captureCommit },
              png: { path: "production/scenario.png" },
            },
          ],
        },
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "baseline D"], {
      cwd: fakeRoot,
    });
    const promotionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const errors = [];
    validateEvidencePromotion(errors, {
      root: fakeRoot,
      baseSha: captureCommit,
      candidateSha: promotionCommit,
    });
    assert.deepEqual(errors, []);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("baseline promotion rejects captured production reverted before D", () => {
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-baseline-revert-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fakeRoot });
    execFileSync("git", ["config", "user.email", "fieldflow@example.invalid"], {
      cwd: fakeRoot,
    });
    execFileSync("git", ["config", "user.name", "Fieldflow Test"], {
      cwd: fakeRoot,
    });
    const packageRoot = resolve(fakeRoot, "docs/uiux/fieldflow-calm-handoff");
    mkdirSync(resolve(packageRoot, "manifests"), { recursive: true });
    mkdirSync(resolve(packageRoot, "evidence/visual/production"), {
      recursive: true,
    });
    mkdirSync(resolve(fakeRoot, "artifacts/backoffice/src"), {
      recursive: true,
    });
    writeFileSync(
      resolve(packageRoot, "manifests/acceptance.json"),
      `${JSON.stringify({ requirements: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "manifests/risks.json"),
      `${JSON.stringify({ risks: [] })}\n`,
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "CONTRACTED",
        evidenceContract: {
          artifactPathBase: "evidence/visual",
          scenarioEvidence: null,
        },
      })}\n`,
    );
    writeFileSync(
      resolve(fakeRoot, "artifacts/backoffice/src/page.tsx"),
      "export default function Page() { return 'old'; }\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "protected base B"], {
      cwd: fakeRoot,
    });
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    writeFileSync(
      resolve(fakeRoot, "artifacts/backoffice/src/page.tsx"),
      "export default function Page() { return 'captured'; }\n",
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "capture C"], {
      cwd: fakeRoot,
    });
    const captureCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();

    writeFileSync(
      resolve(fakeRoot, "artifacts/backoffice/src/page.tsx"),
      "export default function Page() { return 'old'; }\n",
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/production/scenario.png"),
      "capture bytes\n",
    );
    writeFileSync(
      resolve(packageRoot, "evidence/visual/capture-contract.json"),
      `${JSON.stringify({
        state: "BASELINE_READY",
        evidenceContract: {
          artifactPathBase: "evidence/visual",
          scenarioEvidence: [
            {
              scenarioId: "scenario",
              provenance: { headCommit: captureCommit },
              png: { path: "production/scenario.png" },
            },
          ],
        },
      })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: fakeRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "baseline D"], {
      cwd: fakeRoot,
    });
    const promotionCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fakeRoot,
      encoding: "utf8",
    }).trim();
    const errors = [];
    validateEvidencePromotion(errors, {
      root: fakeRoot,
      baseSha: baseCommit,
      candidateSha: promotionCommit,
    });
    assert.match(
      errors.join("\n"),
      /historische implementatie- of capturetree uit C is niet byte- en mode-exact aanwezig/u,
    );
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("route inventory covers exactly every tenant dashboard and auth page", () => {
  const sources = discoverPageSources();
  assert.equal(sources.length, 79);
  assert.equal(
    sources.filter((source) => source.includes("/(dashboard)/")).length,
    75,
  );
  assert.equal(
    sources.filter((source) => source.includes("/(auth)/")).length,
    4,
  );
});

test("every known availability mismatch has exact risk and evidence traceability", () => {
  const errors = [];
  validateMismatchTraceability(
    errors,
    manifest("manifests/mismatch-traceability.json"),
    manifest("manifests/production-inventory.json"),
    manifest("manifests/acceptance.json"),
    manifest("manifests/risks.json"),
  );
  assert.deepEqual(errors, []);

  const drifted = clone(manifest("manifests/mismatch-traceability.json"));
  drifted.records[0].riskIds = [];
  const driftErrors = [];
  validateMismatchTraceability(
    driftErrors,
    drifted,
    manifest("manifests/production-inventory.json"),
    manifest("manifests/acceptance.json"),
    manifest("manifests/risks.json"),
  );
  assert.match(driftErrors.join("\n"), /mismatchrecord/u);
});

test("verification matrix recomputes every tuple stream and rejects tuple or plan-root drift", () => {
  const matrix = manifest("manifests/verification-matrix.json");
  const inputs = {
    packageRoot: PACKAGE_ROOT,
    schema: manifest("reference/verification-matrix.schema.json"),
    acceptance: manifest("manifests/acceptance.json"),
    routes: manifest("manifests/routes.json"),
    inventory: manifest("manifests/production-inventory.json"),
    componentStates: manifest("manifests/component-states.json"),
    risks: manifest("manifests/risks.json"),
    captureContract: manifest("evidence/visual/capture-contract.json"),
    surfaces: manifest("manifests/surfaces.json"),
  };
  const errors = [];
  validateVerificationMatrix(errors, { ...inputs, manifest: matrix });
  assert.deepEqual(errors, []);

  const lifecycleAdvancedInputs = clone(inputs);
  lifecycleAdvancedInputs.acceptance.requirements[0].state = "IMPLEMENTED";
  lifecycleAdvancedInputs.acceptance.requirements[0].evidence = {
    commit: "a".repeat(40),
    index: `outputs/fieldflow-calm/index.json#sha256=${"b".repeat(64)}`,
  };
  lifecycleAdvancedInputs.risks.risks[0].state = "MITIGATED";
  lifecycleAdvancedInputs.risks.risks[0].evidence = {
    commit: "c".repeat(40),
    index: `outputs/fieldflow-calm/risk.json#sha256=${"d".repeat(64)}`,
  };
  lifecycleAdvancedInputs.captureContract.state = "BASELINE_READY";
  lifecycleAdvancedInputs.captureContract.environment.runtimeImageDigest.value = `sha256:${"e".repeat(64)}`;
  lifecycleAdvancedInputs.captureContract.environment.fonts.resolvedFiles = [];
  lifecycleAdvancedInputs.captureContract.evidenceContract.scenarioEvidence =
    [];
  const lifecycleErrors = [];
  validateVerificationMatrix(lifecycleErrors, {
    ...lifecycleAdvancedInputs,
    manifest: matrix,
  });
  assert.deepEqual(lifecycleErrors, []);

  const drifted = clone(matrix);
  drifted.requirementBindings[0].tuplePayloadStreamSha256 = "0".repeat(64);
  drifted.verificationPlanRootSha256 = "1".repeat(64);
  const driftErrors = [];
  validateVerificationMatrix(driftErrors, {
    ...inputs,
    manifest: drifted,
  });
  assert.match(
    driftErrors.join("\n"),
    /tuplecount, familycount of JSONL-streamhash.*plan-root/su,
  );
});

test("verification evidence requires every requirement and shared-matrix tuple exactly passed", () => {
  const { item, evidence, matrixBundle } =
    verificationMatrixEvidenceFixture("FFC-BRAND-013");
  assert.deepEqual(
    evidence.sharedMatrices.map((record) => record.matrixId),
    [
      "whitelabel-auth-full",
      "whitelabel-pdf-email-full",
      "whitelabel-tenant-switch-full",
    ],
  );
  assert.deepEqual(
    validateVerificationMatrixEvidence(item, evidence, {
      root: ROOT,
      verifyFiles: false,
      matrixBundle,
    }),
    [],
  );

  const missingTuple = clone(evidence);
  const missingShard = missingTuple.requirement.shards[0];
  missingShard.ordinalEndExclusive -= 1;
  missingShard.tupleCount -= 1;
  const missingErrors = validateVerificationMatrixEvidence(item, missingTuple, {
    root: ROOT,
    verifyFiles: false,
    matrixBundle,
  });
  assert.match(
    missingErrors.join("\n"),
    /shards.*eindigen niet exact op tupleCount/u,
  );

  const skippedTuple = clone(evidence);
  skippedTuple.sharedMatrices[0].passedTupleCount -= 1;
  skippedTuple.sharedMatrices[0].skippedTupleCount = 1;
  const skippedErrors = validateVerificationMatrixEvidence(item, skippedTuple, {
    root: ROOT,
    verifyFiles: false,
    matrixBundle,
  });
  assert.match(
    skippedErrors.join("\n"),
    /whitelabelmatrix whitelabel-auth-full is niet volledig passed/u,
  );
});

test("navigation contract is source-bound and rejects parent cycles", () => {
  const navigation = manifest("manifests/navigation-contract.json");
  const routes = manifest("manifests/routes.json");
  const productionInventory = manifest("manifests/production-inventory.json");
  const errors = [];
  validateNavigationContract(errors, navigation, routes, productionInventory);
  assert.deepEqual(errors, []);

  const cyclic = clone(navigation);
  const cyclicRoute = cyclic.routes.find(
    (route) => route.id === "tenant-profile",
  );
  assert.ok(cyclicRoute);
  cyclicRoute.parentId = cyclicRoute.id;
  const cycleErrors = [];
  validateNavigationContract(cycleErrors, cyclic, routes, productionInventory);
  assert.match(cycleErrors.join("\n"), /parenthiërarchie bevat een cyclus/u);

  const staleSourceBinding = clone(navigation);
  staleSourceBinding.generatedAgainst.routesManifestSha256 = "0".repeat(64);
  const sourceBindingErrors = [];
  validateNavigationContract(
    sourceBindingErrors,
    staleSourceBinding,
    routes,
    productionInventory,
  );
  assert.match(sourceBindingErrors.join("\n"), /routes-bronbinding/u);
});

test("component API contract is byte-exact and export-closed", () => {
  const componentApi = manifest("manifests/component-api-contract.json");
  const componentStates = manifest("manifests/component-states.json");
  const routes = manifest("manifests/routes.json");
  const validate = (candidate) => {
    const errors = [];
    validateComponentApiContract(errors, {
      root: ROOT,
      manifest: candidate,
      componentStates,
      routes,
    });
    return errors;
  };

  assert.deepEqual(validate(componentApi), []);

  const declarationHashDrift = clone(componentApi);
  declarationHashDrift.components[0].declarationSha256 = "0".repeat(64);
  assert.match(
    validate(declarationHashDrift).join("\n"),
    /declaration, exports, props, states of ownership zijn ongeldig/u,
  );

  const fixtureHashDrift = clone(componentApi);
  fixtureHashDrift.compileContract.fixtures[0].sourceSha256 = "0".repeat(64);
  assert.match(
    validate(fixtureHashDrift).join("\n"),
    /compile-fixture is niet byte-exact/u,
  );

  const publicExportDrift = clone(componentApi);
  publicExportDrift.components[0].exports = [
    ...publicExportDrift.components[0].exports,
    "UndeclaredPublicExport",
  ];
  assert.match(
    validate(publicExportDrift).join("\n"),
    /declaration, exports, props, states of ownership zijn ongeldig/u,
  );
});

test("planboard action contract closes result storage, revisions and receipts", () => {
  const planboard = manifest("manifests/planboard-actions.json");
  const acceptance = manifest("manifests/acceptance.json");
  const risks = manifest("manifests/risks.json");
  const validate = (candidate) => {
    const errors = [];
    validatePlanboardActionContract(errors, {
      packageRoot: PACKAGE_ROOT,
      manifest: candidate,
      acceptance,
      risks,
    });
    return errors;
  };

  assert.deepEqual(validate(planboard), []);

  const leakedStoredState = clone(planboard);
  leakedStoredState.wireContract.resultUnion.storageBoundary =
    "saved_result may persist serverTime and undoState";
  assert.match(
    validate(leakedStoredState).join("\n"),
    /resultaatunion is niet gesloten en volledig getypeerd/u,
  );

  const incompleteCommitted = clone(planboard);
  incompleteCommitted.wireContract.resultUnion.variants[0].required.pop();
  assert.match(
    validate(incompleteCommitted).join("\n"),
    /resultaatunion is niet gesloten en volledig getypeerd/u,
  );

  const resettableRevision = clone(planboard);
  resettableRevision.receiptContract.revisionCounter.retentionRule =
    "delete the counter with expired receipts";
  assert.match(
    validate(resettableRevision).join("\n"),
    /receipt-, replay-, RLS-, undo- of retentiecontract is onvolledig/u,
  );

  const collidingOutbox = clone(planboard);
  collidingOutbox.receiptContract.outboxDedupeKey = "planning:<mutationId>";
  assert.match(
    validate(collidingOutbox).join("\n"),
    /receipt-, replay-, RLS-, undo- of retentiecontract is onvolledig/u,
  );

  const missingInterestVersion = clone(planboard);
  missingInterestVersion.wireContract.common.versions.required.pop();
  assert.match(
    validate(missingInterestVersion).join("\n"),
    /wirecontract mist versievector/u,
  );

  const staleRealtimeIdentity = clone(planboard);
  staleRealtimeIdentity.realtimeContract.eventIdentity =
    "Deduplicate by mutationId.";
  assert.match(
    validate(staleRealtimeIdentity).join("\n"),
    /realtimecontract mist tenant\+revision-dedupe/u,
  );

  const relaxedRealtimeSlo = clone(planboard);
  relaxedRealtimeSlo.realtimeContract.idleVisibilitySloMs = 2500;
  assert.match(validate(relaxedRealtimeSlo).join("\n"), /harde 2000ms-SLO/u);

  const staleUndo = clone(planboard);
  staleUndo.receiptContract.undoVersionRule.advance =
    "Restore the historic lifecycleVersion.";
  assert.match(
    validate(staleUndo).join("\n"),
    /receipt-, replay-, RLS-, undo- of retentiecontract is onvolledig/u,
  );

  const splitTransaction = clone(planboard);
  splitTransaction.receiptContract.databaseBoundary.connection =
    "Use a second credential and connection for receipts.";
  assert.match(
    validate(splitTransaction).join("\n"),
    /receipt-, replay-, RLS-, undo- of retentiecontract is onvolledig/u,
  );

  for (const field of [
    "requiredSlotsRule",
    "filledSlotsRule",
    "scheduledTransitionRule",
    "statusNonRegressionRule",
  ]) {
    const weakenedInterestSelection = clone(planboard);
    weakenedInterestSelection.interestSelectionContract[field] =
      "Schedule immediately after selecting one candidate.";
    assert.match(
      validate(weakenedInterestSelection).join("\n"),
      /Planboard interestselectie is niet als gesloten, atomische en volledig undoable/u,
      field,
    );
  }
});

test("every e2e verification spelling requires the browser evidence command", () => {
  for (const verification of [
    "e2e",
    "route-e2e",
    "security-e2e",
    "pointer+touch+keyboard-e2e",
  ]) {
    assert.ok(
      requiredEvidenceCommandIds({
        state: "IMPLEMENTED",
        verification,
      }).includes("fieldflow-browser"),
      verification,
    );
  }
});

test("route source comparison detects both missing and stale entries", () => {
  const comparison = compareRouteSources(
    ["a/page.tsx", "stale/page.tsx"],
    ["a/page.tsx", "new/page.tsx"],
  );
  assert.deepEqual(comparison, {
    missingFromManifest: ["new/page.tsx"],
    staleManifestSources: ["stale/page.tsx"],
  });
});

test("route derivation preserves dynamic segments and root page", () => {
  assert.equal(
    routeFromSource(
      "artifacts/backoffice/src/app/(dashboard)/customers/[id]/page.tsx",
    ),
    "/customers/[id]",
  );
  assert.equal(
    routeFromSource("artifacts/backoffice/src/app/(dashboard)/page.tsx"),
    "/",
  );
  assert.equal(
    routeFromSource(
      "artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx",
    ),
    "/wachtwoord-vergeten",
  );
});

test("route capability and action IDs exactly match production kind and order", () => {
  const routes = clone(manifest("manifests/routes.json"));
  const inventory = manifest("manifests/production-inventory.json");
  const assignments = routes.routes.find(
    (route) => route.id === "tenant-assignments",
  );
  assignments.capabilityIds.reverse();
  assignments.primaryActionIds.reverse();
  assignments.secondaryActionIds[0] = assignments.destructiveActionIds[0];
  assignments.capabilities = ["Verzonnen capability"];
  assignments.actions = { primary: "Verzonnen actie" };
  const errors = [];
  validateRoutes(errors, ROOT, routes, inventory);
  assert.match(errors.join("\n"), /vrije presentatie-capabilitylabels/u);
  assert.match(errors.join("\n"), /vrije presentatie-actielabels/u);
  assert.match(errors.join("\n"), /capabilityIds.*inventarisvolgorde/u);
  assert.match(errors.join("\n"), /primaryActionIds.*inventarisvolgorde/u);
  assert.match(errors.join("\n"), /secondaryActionIds.*inventarisvolgorde/u);
});

test("normative manifest digests reject silent copy and geometry drift", () => {
  const inventory = manifest("manifests/production-inventory.json");
  const routes = clone(manifest("manifests/routes.json"));
  routes.routes[0].title = "Verzonnen routetitel";
  const routeErrors = [];
  validateRoutes(routeErrors, ROOT, routes, inventory);
  assert.match(routeErrors.join("\n"), /Routepresentatie-inhoudsdigest/u);

  const acceptance = clone(manifest("manifests/acceptance.json"));
  acceptance.requirements.find(
    (requirement) => requirement.id === "FFC-BRAND-020",
  ).requirement = "Verzwakt assetcontract";
  const acceptanceErrors = [];
  validateAcceptance(
    acceptanceErrors,
    acceptance,
    new Set(routes.routes.map((route) => route.route)),
    ROOT,
  );
  assert.match(
    acceptanceErrors.join("\n"),
    /Acceptancecontract-inhoudsdigest/u,
  );

  const tokens = clone(manifest("manifests/fieldflow-tokens.json"));
  tokens.spacing.scalePx[1] = 9;
  const tokenErrors = [];
  validateTokens(tokenErrors, tokens);
  assert.match(tokenErrors.join("\n"), /token-inhoudsdigest/u);
});

test("PNG verifier reads the immutable dashboard anchor", () => {
  const dimensions = readPngDimensions(
    new URL(
      "../docs/uiux/fieldflow-calm-handoff/evidence/visual/01-dashboard-desktop-1440.png",
      import.meta.url,
    ),
  );
  assert.deepEqual(dimensions, { width: 1440, height: 1000 });
});

test("hashed evidence index binds code files to subject and implementation head", () => {
  const { item, index } = implementationEvidenceFixture();
  assert.deepEqual(
    validateEvidenceIndexPayload(item, index, {
      root: ROOT,
      verifyFiles: true,
    }),
    [],
  );

  const identityDrift = clone(index);
  identityDrift.subjectId = "FFC-OTHER-999";
  identityDrift.headCommit = "b".repeat(40);
  const identityErrors = validateEvidenceIndexPayload(item, identityDrift, {
    root: ROOT,
    verifyFiles: true,
  });
  assert.match(identityErrors.join("\n"), /subjectId.*headCommit/u);

  const fileDrift = clone(index);
  fileDrift.codePaths[0].blobSha256 = "0".repeat(64);
  fileDrift.codePaths.push({ path: "docs", blobSha256: "1".repeat(64) });
  const fileErrors = validateEvidenceIndexPayload(item, fileDrift, {
    root: ROOT,
    verifyFiles: true,
  });
  assert.match(fileErrors.join("\n"), /Git-blobhash.*geen bestand/su);
});

test("verified evidence rejects an irrelevant true command and fake self-review", () => {
  const { item, index } = implementationEvidenceFixture("VERIFIED_LOCAL");
  const provenance = evidenceProvenanceFixture(item);
  index.provenance = provenance;
  index.commands = [
    {
      id: "fieldflow-runtime",
      verification: item.verification,
      command: "true",
      status: "passed",
      exitCode: 0,
      reportPath: "outputs/fieldflow-calm/runtime.json",
      reportSha256: "0".repeat(64),
    },
  ];
  index.artifacts.runtime = [
    {
      path: "outputs/fieldflow-calm/runtime.json",
      sha256: "0".repeat(64),
      mediaType: "application/json",
      reportKind: "runtime",
    },
  ];
  index.reviewers = [
    {
      id: "implementer-a",
      role: "functional-security",
      independent: true,
      selfReview: false,
    },
  ];
  const errors = validateEvidenceIndexPayload(item, index);
  assert.match(
    errors.join("\n"),
    /willekeurige shellcommands.*APPROVED-attestatie/su,
  );
});

test("plausible local evidence cannot promote without live GitHub validation", () => {
  const { item, index } = implementationEvidenceFixture("VERIFIED_LOCAL");
  const provenance = evidenceProvenanceFixture(item);
  index.provenance = provenance;
  index.commands = [
    {
      id: "fieldflow-runtime",
      verification: item.verification,
      command: `pnpm fieldgrid:fieldflow-calm:check -- --evidence-subject ${item.id} --report outputs/fieldflow-calm/runtime.json`,
      status: "passed",
      exitCode: 0,
      reportPath: "outputs/fieldflow-calm/runtime.json",
      reportSha256: "0".repeat(64),
    },
  ];
  index.artifacts.runtime = [
    {
      path: "outputs/fieldflow-calm/runtime.json",
      sha256: "0".repeat(64),
      mediaType: "application/json",
      reportKind: "runtime",
    },
  ];
  index.reviewers = [
    {
      id: "reviewer-a",
      role: "functional-security",
      independent: true,
      selfReview: false,
      decision: "APPROVED",
      subjectId: item.id,
      headCommit: item.evidence.commit,
      pullRequestNumber: provenance.pullRequestNumber,
      reviewId: 3003,
      submittedAt: "2026-09-03T12:00:00Z",
    },
  ];
  assert.match(
    validateEvidenceIndexPayload(item, index).join("\n"),
    /vereist bestands-, Git- en live GitHub-validatie/u,
  );
});

test("staging evidence requires two distinct independent reviewer roles", () => {
  const { item, index } = implementationEvidenceFixture("VERIFIED_STAGING");
  const provenance = evidenceProvenanceFixture(item);
  index.provenance = provenance;
  index.commands = [
    {
      id: "fieldflow-runtime",
      verification: item.verification,
      command: `pnpm fieldgrid:fieldflow-calm:check -- --evidence-subject ${item.id} --report outputs/fieldflow-calm/runtime.json`,
      status: "passed",
      exitCode: 0,
      reportPath: "outputs/fieldflow-calm/runtime.json",
      reportSha256: "0".repeat(64),
    },
    {
      id: "fieldflow-staging",
      verification: item.verification,
      command: `pnpm fieldgrid:fieldflow-calm:staging --strict -- --evidence-subject ${item.id} --report outputs/fieldflow-calm/staging.json`,
      status: "passed",
      exitCode: 0,
      reportPath: "outputs/fieldflow-calm/staging.json",
      reportSha256: "1".repeat(64),
    },
  ];
  index.artifacts.runtime = [
    {
      path: "outputs/fieldflow-calm/runtime.json",
      sha256: "0".repeat(64),
      mediaType: "application/json",
      reportKind: "runtime",
    },
  ];
  index.artifacts.staging = [
    {
      path: "outputs/fieldflow-calm/staging.json",
      sha256: "1".repeat(64),
      mediaType: "application/json",
      reportKind: "staging",
    },
  ];
  index.reviewers = [
    {
      id: "reviewer-a",
      role: "functional-security",
      independent: true,
      selfReview: false,
      decision: "APPROVED",
      subjectId: item.id,
      headCommit: item.evidence.commit,
      pullRequestNumber: provenance.pullRequestNumber,
      reviewId: 3003,
      submittedAt: "2026-09-03T12:00:00Z",
    },
  ];
  assert.match(
    validateEvidenceIndexPayload(item, index).join("\n"),
    /functional-security.*visual-a11y/u,
  );
});

test("machine evidence rejects empty JSON, missing axes and failed assertions", () => {
  const { item } = implementationEvidenceFixture("VERIFIED_LOCAL");
  const provenance = evidenceProvenanceFixture(item);
  assert.match(
    validateMachineEvidenceReport(
      item,
      {},
      {
        kind: "runtime",
        commandIds: ["fieldflow-runtime"],
        provenance,
        root: ROOT,
      },
    ).join("\n"),
    /mist schema\/subject\/HEAD/u,
  );

  const missingAxes = evidenceReportFixture(item, provenance);
  missingAxes.coverage.densities = [];
  assert.match(
    validateMachineEvidenceReport(item, missingAxes, {
      kind: "runtime",
      commandIds: ["fieldflow-runtime"],
      provenance,
      root: ROOT,
    }).join("\n"),
    /dekt routes\/themes\/viewports\/densities/u,
  );

  const failedAssertion = evidenceReportFixture(item, provenance);
  failedAssertion.assertions[0].status = "failed";
  failedAssertion.summary = {
    passed: 0,
    failed: 1,
    skipped: 0,
    notRun: 0,
    manual: 0,
  };
  assert.match(
    validateMachineEvidenceReport(item, failedAssertion, {
      kind: "runtime",
      commandIds: ["fieldflow-runtime"],
      provenance,
      root: ROOT,
    }).join("\n"),
    /geslaagde assertions.*nul failed\/skipped/su,
  );
});

test("contracted requirements reject premature or legacy evidence", () => {
  assert.match(
    validateRequirementEvidence({
      id: "FFC-TEST-006",
      state: "CONTRACTED",
      evidence: { codePaths: ["path/to/code.ts"] },
    }).join("\n"),
    /CONTRACTED mag geen bewijsclaim/u,
  );
});

test("semantic and planboard text pairs satisfy WCAG AA", () => {
  assert.ok(contrastRatio("#0F513C", "#E4F4EC") >= 4.5);
  assert.ok(contrastRatio("#1D6F73", "#DFF3F1") >= 4.5);
  assert.ok(contrastRatio("#994E20", "#FAE8D9") >= 4.5);
  assert.ok(contrastRatio("#805A0A", "#F7EDC8") >= 4.5);
  assert.ok(contrastRatio("#934B10", "#F9E4D2") >= 4.5);
});

test("theme manifest verification rejects algorithm and fixture drift", async () => {
  const invalid = clone(manifest("manifests/theme-derivation.json"));
  invalid.algorithm.version = "regressed";
  invalid.fixtures[0].expectedSemanticOutput.primary = "#000000";
  const errors = await verifyThemeManifest(invalid);
  assert.match(
    errors.join("\n"),
    /algorithm contract.*expectedSemanticOutput.*does not match/su,
  );
});

test("production appearance contract pins identity, asset modes and cold start", () => {
  const errors = [];
  validateThemeDerivationReference(errors, PACKAGE_ROOT, {
    executeReference: false,
  });
  assert.deepEqual(errors, []);

  const source = readFileSync(
    resolve(PACKAGE_ROOT, "reference/theme-derivation.mjs"),
    "utf8",
  );
  assert.match(source, /export function resolveAppearance\(/u);
  assert.match(source, /expectedRawBrandThemeSha256/u);
  assert.match(source, /expectedAssetModesSha256/u);

  const theme = manifest("manifests/theme-derivation.json");
  assert.equal(
    theme.appearanceResolutionContract.productionEntryPoint,
    "resolveAppearance",
  );
  assert.deepEqual(theme.assetSelectionContract.storageMigration.modeValues, [
    "inherit",
    "asset",
    "none",
  ]);
  assert.deepEqual(theme.runtimePolicy.nativeColdStartFallback, {
    nativeStatusBarBackground: "#F8FAFC",
    nativeStatusBarStyle: "Style.Dark",
    nativeSafeAreaBackground: "#F8FAFC",
    source: "fieldgrid-code-platform-fallback",
  });
  assert.ok(
    theme.documentAppearanceSnapshotContract.snapshotFields.includes(
      "logoContentSha256",
    ),
  );
});

test("client Server Action scan is completely classified and reverse-linked", () => {
  const discovered = discoverClientImportedServerActions();
  const inventory = manifest("manifests/production-inventory.json");
  const classified = [
    ...inventory.sourceCoverage.inventoried,
    ...inventory.sourceCoverage.excluded,
  ];
  assert.equal(discovered.length, 237);
  assert.deepEqual(
    classified.map((item) => `${item.source}#${item.symbol}`).sort(),
    discovered.map((item) => `${item.source}#${item.symbol}`).sort(),
  );
});

test("production inventory content and all base-commit source blobs are pinned", () => {
  const inventory = manifest("manifests/production-inventory.json");
  const sourceDigest = computeProductionSourceDigest(ROOT, inventory);
  assert.equal(sourceDigest.error, null);
  assert.equal(sourceDigest.paths.length, 231);
  assert.deepEqual(sourceDigest.unsafePaths, []);
  assert.deepEqual(sourceDigest.missingPaths, []);
  assert.equal(
    sourceDigest.digest,
    "1776750679e7cc921359ba67797e5c64fa7226137c52f0b4a132529870900090",
  );

  const drifted = clone(inventory);
  drifted.globalCapabilities[0].label = "VOLLEDIG VERZONNEN CAPABILITY";
  const errors = [];
  validateProductionInventory(
    errors,
    ROOT,
    drifted,
    manifest("manifests/routes.json"),
  );
  assert.match(errors.join("\n"), /inventory-inhoudsdigest wijkt af/u);
});

test("production inventory rejects typed-action and reverse-link regressions", () => {
  const inventory = manifest("manifests/production-inventory.json");
  const routes = manifest("manifests/routes.json");
  const invalid = clone(inventory);
  invalid.globalActions[0].effects = [];
  invalid.sourceCoverage.inventoried[0].actionIds = ["missing.action"];
  const errors = [];
  validateProductionInventory(errors, ROOT, invalid, routes);
  assert.match(
    errors.join("\n"),
    /conditional\/effect.*inconsistent.*reverse actionlink missing\.action is stale/su,
  );
});

test("production inventory counts prevent coordinated feature removal or reclassification", () => {
  const source = manifest("manifests/production-inventory.json");
  const routes = manifest("manifests/routes.json");

  const routeActionRemoval = clone(source);
  const planning = routeActionRemoval.routes.find(
    (route) => route.routeId === "tenant-planning",
  );
  planning.existingProduction.actions =
    planning.existingProduction.actions.filter(
      (action) => action.id !== "tenant-planning.schedule",
    );
  const routeActionErrors = [];
  validateProductionInventory(
    routeActionErrors,
    ROOT,
    routeActionRemoval,
    routes,
  );
  assert.match(routeActionErrors.join("\n"), /Production inventory-counts/u);

  const globalRemoval = clone(source);
  globalRemoval.globalActions.pop();
  const globalErrors = [];
  validateProductionInventory(globalErrors, ROOT, globalRemoval, routes);
  assert.match(globalErrors.join("\n"), /Globale shellacties.*niet exact/u);
  assert.match(globalErrors.join("\n"), /Production inventory-counts/u);

  const capabilityRemoval = clone(source);
  capabilityRemoval.routes[0].existingProduction.capabilities.pop();
  const capabilityErrors = [];
  validateProductionInventory(
    capabilityErrors,
    ROOT,
    capabilityRemoval,
    routes,
  );
  assert.match(capabilityErrors.join("\n"), /Production inventory-counts/u);

  const reclassified = clone(source);
  const moved = reclassified.sourceCoverage.inventoried.pop();
  reclassified.sourceCoverage.excluded.push({
    source: moved.source,
    symbol: moved.symbol,
    importedBy: moved.importedBy,
    reason: "Ten onrechte als uitgesloten geclassificeerd.",
  });
  reclassified.sourceCoverage.counts.inventoried -= 1;
  reclassified.sourceCoverage.counts.excluded += 1;
  const reclassificationErrors = [];
  validateProductionInventory(
    reclassificationErrors,
    ROOT,
    reclassified,
    routes,
  );
  assert.match(
    reclassificationErrors.join("\n"),
    /Production inventory-counts/u,
  );
});

test("mutation inventory requires a top-level callable export in a use-server file", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const action = inventory.routes
    .flatMap((route) => route.existingProduction.actions)
    .find((candidate) => candidate.id === "tenant-planning.schedule");
  assert.ok(action, "schedule action fixture must exist");
  const serverSource = action.sources.find((source) =>
    source.path.includes("/app/actions/"),
  );
  assert.ok(serverSource, "schedule action must name its Server Action source");
  serverSource.symbol = "AssignmentRequirements";
  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(
    errors.join("\n"),
    /top-level async callable export in de echte use-server directive-proloog ontbreekt/u,
  );
});

test("Server Action modules require an early directive prologue and async export", () => {
  const lateDirective = collectTypescriptSymbolsFromSource(
    [
      'import { z } from "zod";',
      '"use server";',
      "export async function save() { return z.string(); }",
    ].join("\n"),
    "late-directive.ts",
  );
  assert.equal(lateDirective.hasUseServerDirective, false);
  assert.equal(lateDirective.topLevelAsyncCallable.has("save"), true);

  const synchronousExport = collectTypescriptSymbolsFromSource(
    ['"use server";', "export function save() { return true; }"].join("\n"),
    "sync-export.ts",
  );
  assert.equal(synchronousExport.hasUseServerDirective, true);
  assert.equal(synchronousExport.topLevelCallable.has("save"), true);
  assert.equal(synchronousExport.topLevelAsyncCallable.has("save"), false);
});

test("route action rejects an existing but unreachable component symbol", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const planning = inventory.routes.find(
    (route) => route.routeId === "tenant-planning",
  );
  const openMap = planning.existingProduction.actions.find(
    (action) => action.id === "tenant-planning.open-map",
  );
  const component = openMap.sources.find(
    (source) =>
      source.path !==
      routes.routes.find((route) => route.id === "tenant-planning").source,
  );
  component.path =
    "artifacts/backoffice/src/components/customers/CustomerDetailActions.tsx";
  component.symbol = "CustomerDetailActions";

  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(
    errors.join("\n"),
    /tenant-planning\.open-map: geen gekoppeld action-\/componentsymbool.*statische importgraaf.*exacte App Router-page/u,
  );
});

test("route action reachability is symbol-specific through client components", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const customerDetail = inventory.routes.find(
    (route) => route.routeId === "tenant-customers-id",
  );
  const portalInvite = customerDetail.existingProduction.actions.find(
    (action) => action.id === "tenant-customers-id.portal-invite",
  );
  const pageSource = routes.routes.find(
    (route) => route.id === "tenant-customers-id",
  ).source;
  portalInvite.sources = [
    portalInvite.sources.find((source) => source.path === pageSource),
    {
      path: "artifacts/backoffice/src/app/actions/objects.ts",
      symbol: "bulkSetObjectStatus",
    },
  ];

  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(
    errors.join("\n"),
    /tenant-customers-id\.portal-invite: geen gekoppeld action-\/componentsymbool.*statische importgraaf.*exacte App Router-page/u,
  );
});

test("navigation owner cannot be forged with a different reachable action", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const planning = inventory.routes.find(
    (route) => route.routeId === "tenant-planning",
  );
  const openMap = planning.existingProduction.actions.find(
    (action) => action.id === "tenant-planning.open-map",
  );
  openMap.sources[1] = {
    path: "artifacts/backoffice/src/app/actions/assignments.ts",
    symbol: "reshiftAssignment",
  };
  const reshiftCoverage = inventory.sourceCoverage.inventoried.find(
    (entry) =>
      entry.source === "artifacts/backoffice/src/app/actions/assignments.ts" &&
      entry.symbol === "reshiftAssignment",
  );
  assert.ok(reshiftCoverage, "reshift sourceCoverage fixture must exist");
  reshiftCoverage.actionIds.push("tenant-planning.open-map");

  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(
    errors.join("\n"),
    /tenant-planning\.open-map: bereikbaar symbool mist een concrete UI-handler-, navigatie- of state-witness in de action-owner declaratie/u,
  );
});

test("route trace starts at the exact exported page symbol", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const planning = inventory.routes.find(
    (route) => route.routeId === "tenant-planning",
  );
  planning.sources.find(
    (source) =>
      source.path ===
      "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx",
  ).symbol = "formatDate";
  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(
    errors.join("\n"),
    /tenant-planning: startpunt van de brontrace is geen exact geëxporteerd App Router-pagesymbool/u,
  );
});

test("production AST reads the pinned base blob despite worktree divergence", () => {
  const sourcePath =
    "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx";
  const expected = execFileSync(
    "git",
    ["show", "ba81cc18aaf8aa2d93d292c0def49d5c997307dc:" + sourcePath],
    { cwd: ROOT, encoding: "utf8" },
  );
  const fakeRoot = mkdtempSync(resolve(ROOT, "fieldflow-base-reader-"));
  try {
    const fakePath = resolve(fakeRoot, sourcePath);
    mkdirSync(dirname(fakePath), { recursive: true });
    writeFileSync(fakePath, "export default function Forged() {}\n");
    assert.notEqual(readFileSync(fakePath, "utf8"), expected);
    assert.equal(readPlatformBaseSource(fakeRoot, sourcePath), expected);
  } finally {
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("production inventory validates every anyOf availability branch", () => {
  const inventory = clone(manifest("manifests/production-inventory.json"));
  const routes = manifest("manifests/routes.json");
  const action = inventory.routes
    .flatMap((route) => route.existingProduction.actions)
    .find((candidate) => candidate.availability?.anyOf);
  assert.ok(action, "fixture with availability.anyOf must exist");
  action.availability.anyOf[0].allPermissions = ["not-a-permission"];
  const errors = [];
  validateProductionInventory(errors, ROOT, inventory, routes);
  assert.match(errors.join("\n"), /anyOf\[0\].*ongeldige permission/su);
});

test("density presets are exact resolved geometry, not free scale factors", () => {
  const invalid = clone(manifest("manifests/fieldflow-tokens.json"));
  invalid.density.variants.compact.controlHeightPx = 43;
  const errors = [];
  validateTokens(errors, invalid);
  assert.match(errors.join("\n"), /Density wijkt af/u);
});

test("compact desktop heading and toolbar geometry is pinned at 1024", () => {
  const invalid = clone(manifest("manifests/fieldflow-tokens.json"));
  invalid.layout.toolbarMinHeightCompactPx = 78;
  const errors = [];
  validateTokens(errors, invalid);
  assert.match(errors.join("\n"), /responsive geometry/u);
});

test("OPEN risks cannot claim closure evidence", () => {
  const errors = validateRiskEvidence({
    id: "R-TEST",
    state: "OPEN",
    evidence: { commit: "a".repeat(40) },
  });
  assert.match(errors.join("\n"), /OPEN mag geen sluitbewijs/u);
});

test("surface scope and source paths fail closed", () => {
  const surfaces = clone(manifest("manifests/surfaces.json"));
  const acceptance = manifest("manifests/acceptance.json");
  const native = surfaces.surfaces.find(
    (surface) => surface.id === "native-android-build-assets",
  );
  native.scope = "included";
  native.sourcePaths.push("outside/missing.ts");
  surfaces.surfaces[0].acceptanceIds = surfaces.surfaces[0].acceptanceIds.slice(
    0,
    1,
  );
  const errors = [];
  validateSurfaces(errors, ROOT, surfaces, acceptance);
  assert.match(
    errors.join("\n"),
    /inhoudsdigest.*onjuiste scope.*bronpad ontbreekt/su,
  );
});

test("native whitelabel acceptance cannot lose fallback or cache-isolation cases", () => {
  const acceptance = clone(manifest("manifests/acceptance.json"));
  const routes = manifest("manifests/routes.json");
  const native = acceptance.requirements.find(
    (requirement) => requirement.id === "FFC-BRAND-019",
  );
  native.runtimeCases = native.runtimeCases.filter(
    (runtimeCase) => !runtimeCase.includes("tenant A to tenant B"),
  );
  const errors = [];
  validateAcceptance(
    errors,
    acceptance,
    new Set(routes.routes.map((route) => route.route)),
    ROOT,
  );
  assert.match(errors.join("\n"), /FFC-BRAND-019.*cache-isolatie/su);
});

test("capture contract rejects normalization and premature baseline claims", () => {
  const visual = manifest("evidence/visual/manifest.json");
  const invalid = clone(manifest("evidence/visual/capture-contract.json"));
  invalid.environment.colorScheme = "dark";
  invalid.environment.network.unexpectedThirdPartyRequests = "allowed";
  invalid.normalization.hideSelectors = [".fg-app"];
  invalid.normalization.removeControlsByAccessibleName = [];
  invalid.normalization.applicationSelector = "body";
  invalid.normalization.applicationStyle = { height: "1px", width: "1px" };
  invalid.normalization.referenceStylesheet.sha256 = "0".repeat(64);
  invalid.setupDriver.profiles[
    "assignment-wizard-step-one"
  ].expectedDomSentinels[2].value = "Stap 1 van 4";
  invalid.setupDriver.profiles["dashboard-clean"].steps[0] =
    "free text is not executable";
  invalid.scenarios[1].output = invalid.scenarios[0].output;
  invalid.state = "BASELINE_READY";
  const errors = [];
  validateCaptureContract(errors, PACKAGE_ROOT, invalid, visual);
  const output = errors.join("\n");
  assert.match(output, /Captureomgeving.*deterministisch/u);
  assert.match(output, /appvlak en prototypechrome/u);
  assert.match(output, /toegankelijkheidsnormalisatiecontract/u);
  assert.match(output, /setupdriver.*sentinelcontract/u);
  assert.match(output, /vijfstaps/u);
  assert.match(output, /outputpad is niet uniek/u);
  assert.match(output, /runtime-image digest/u);
  assert.match(output, /hashes van alle opgeloste fonts/u);
  assert.match(output, /evidence-record/u);
});

test("baseline artifacts are uniquely bound to their capture scenario", () => {
  const visual = manifest("evidence/visual/manifest.json");
  const invalid = clone(manifest("evidence/visual/capture-contract.json"));
  invalid.state = "BASELINE_READY";
  invalid.environment.runtimeImageDigest.value = `sha256:${"a".repeat(64)}`;
  invalid.environment.fonts.resolvedFiles = [
    { family: "Aptos", file: "aptos.woff2", sha256: "b".repeat(64) },
  ];
  const sharedArtifact = {
    path: "normalized/shared.json",
    sha256: "c".repeat(64),
  };
  invalid.evidenceContract.scenarioEvidence = invalid.scenarios.map(
    (scenario) => ({
      scenarioId: scenario.id,
      prototypeCommit: invalid.source.prototypeCommit,
      reviewers: ["reviewer-a", "reviewer-b"],
      png: {
        ...sharedArtifact,
        width: invalid.viewports[scenario.viewport].width,
        height: invalid.viewports[scenario.viewport].height,
      },
      domSnapshot: sharedArtifact,
      computedGeometry: sharedArtifact,
      computedStyles: sharedArtifact,
      setupActionLog: sharedArtifact,
      runtimeErrorLog: sharedArtifact,
    }),
  );
  const errors = [];
  validateCaptureContract(errors, PACKAGE_ROOT, invalid, visual);
  const output = errors.join("\n");
  assert.match(output, /niet scenario-gebonden/u);
  assert.match(output, /baseline-artifactpad is niet uniek/u);
});

test("typed BASELINE_READY scenario evidence accepts the complete bound payload", () => {
  const { contract, scenario, evidence, artifacts } = baselineScenarioFixture();
  assert.deepEqual(
    validateBaselineScenarioEvidencePayload(
      contract,
      scenario,
      evidence,
      artifacts,
    ),
    [],
  );
});

test("mobile BASELINE_READY accepts complete responsive production evidence", () => {
  const { contract, scenario, evidence, artifacts } =
    mobileBaselineScenarioFixture();
  assert.deepEqual(
    validateBaselineScenarioEvidencePayload(
      contract,
      scenario,
      evidence,
      artifacts,
    ),
    [],
  );
});

test("mobile BASELINE_READY rejects missing Axe evidence", () => {
  const { contract, scenario, evidence, artifacts } =
    mobileBaselineScenarioFixture();
  delete artifacts.axeReport;
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /axe-report.*scenario.*mobiele Axe-output/su);
});

test("mobile BASELINE_READY rejects touch interaction that used drag", () => {
  const { contract, scenario, evidence, artifacts } =
    mobileBaselineScenarioFixture();
  artifacts.touchInteractionTrace.dragUsed = true;
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /mobiele touch-trace.*non-drag/u);
});

test("mobile BASELINE_READY rejects missing semantic geometry region", () => {
  const { contract, scenario, evidence, artifacts } =
    mobileBaselineScenarioFixture();
  artifacts.computedGeometry.regionMeasurements.pop();
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /mobiele semantische geometry mist regio's/u);
});

test("BASELINE_READY rejects empty or untyped JSON artifacts", () => {
  const { contract, scenario, evidence } = baselineScenarioFixture();
  const errors = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    {
      setupActionLog: {},
      runtimeErrorLog: {},
      computedGeometry: {},
      computedStyles: {},
      domSnapshot: {},
    },
  );
  assert.match(
    errors.join("\n"),
    /setup-action-log.*scenario.*runtime-error-log.*scenario.*computed-geometry.*scenario.*computed-styles.*scenario.*dom-snapshot.*scenario/su,
  );
});

test("BASELINE_READY parses setup, runtime, geometry, style and DOM semantics fail-closed", () => {
  const { contract, scenario, evidence, artifacts } = baselineScenarioFixture();
  artifacts.setupActionLog.steps[0].status = "skipped";
  artifacts.runtimeErrorLog.pageErrors.push({ message: "boom" });
  artifacts.computedGeometry.measurements.pop();
  artifacts.computedGeometry.interactiveTargets[0].rect.width = 43;
  artifacts.computedStyles.fontsReady = false;
  artifacts.computedStyles.rootVariables["--ff-primary"] = "#ffffff";
  artifacts.domSnapshot.forbiddenSelectors[0].count = 1;
  artifacts.domSnapshot.forbiddenAccessibleNames[0].count = 1;
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /setup-action-log.*alle stappen/u);
  assert.match(output, /runtime-error-log.*leeg/u);
  assert.match(output, /geometrybewijs.*exacte selectors.*44×44px/u);
  assert.match(output, /stylebewijs.*fonts.*rootvariabelen/u);
  assert.match(output, /DOM-bewijs.*labchrome\/Herstel demo/u);
});

test("BASELINE_READY rejects fake, duplicate and self reviewer provenance", () => {
  const { contract, scenario, evidence, artifacts } = baselineScenarioFixture();
  evidence.provenance.provider = "local-script";
  evidence.reviewers[0].id = evidence.authorId;
  evidence.reviewers[0].selfReview = true;
  evidence.reviewers[0].approval.reviewedHeadCommit = "9".repeat(40);
  evidence.reviewers[1] = "reviewer-b";
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /GitHub Actions-captureprovenance is ongeldig/u);
  assert.match(
    output,
    /reviewer.*mist onafhankelijke, GitHub-geverifieerde.*product-design en visual-a11y/su,
  );
});

test("BASELINE_READY rejects structurally plausible but unverifiable GitHub claims", () => {
  const { evidence } = baselineScenarioFixture();
  const errors = [];
  validateBaselineExternalEvidence(errors, evidence, "/tmp/fake-baseline.png", {
    root: ROOT,
    apiJson: () => null,
    attestationVerifier: () => false,
  });
  const output = errors.join("\n");
  assert.match(output, /base.*geen ancestor/u);
  assert.match(output, /trusted blob/u);
  assert.match(output, /live GitHub-PR/u);
  assert.match(output, /Actions-basislinerun/u);
  assert.match(output, /normalized-baseline-job/u);
  assert.match(output, /live GitHub-review/u);
  assert.match(output, /Artifact Attestation/u);
});

test("BASELINE_READY rejects an unrelated PNG even with plausible dimensions", () => {
  const { contract, scenario, evidence, artifacts } = baselineScenarioFixture();
  evidence.png.sha256 = "9".repeat(64);
  const output = validateBaselineScenarioEvidencePayload(
    contract,
    scenario,
    evidence,
    artifacts,
  ).join("\n");
  assert.match(output, /captureBinding koppelt PNG en JSON-artefacten niet/u);
});

test("component contract rejects missing states and invented existing targets", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  components.components[0].captureCases[0].states = [];
  components.components.find(
    (component) => component.id === "entity-wizard",
  ).implementationStatus = "existing-target";
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  assert.match(errors.join("\n"), /componentidentiteit\/target/su);
  assert.match(errors.join("\n"), /viewport\/fixture\/interactie\/states/su);
});

test("component source evidence and capture fixture contracts fail closed", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  components.sourceEvidenceContract.repositorySource.pathRule =
    "accept any claimed path";
  components.captureFixtureContract.selectors.component = "body";
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  const output = errors.join("\n");
  assert.match(output, /exacte bronbewijscontract/u);
  assert.match(output, /exacte capturefixturecontract/u);
});

test("component parity is pinned and enforced separately on desktop and mobile", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  components.components.find(
    (component) => component.id === "button",
  ).parityRequiredStates = ["rest"];
  components.components.find(
    (component) => component.id === "planboard-placement-interaction",
  ).parityRequiredStates = ["pointer-drag-active-valid"];
  const filterSheet = components.components.find(
    (component) => component.id === "filter-sheet",
  );
  const filterSheetMobile = filterSheet.captureCases.find(
    (capture) => capture.viewport === "mobile",
  );
  filterSheetMobile.states = filterSheetMobile.states.filter(
    (state) => state !== "applied",
  );
  const dialog = components.components.find(
    (component) => component.id === "dialog",
  );
  const dialogDesktop = dialog.captureCases.find(
    (capture) => capture.viewport === "desktop",
  );
  dialogDesktop.states = dialogDesktop.states.filter(
    (state) => state !== "success-close",
  );
  const mobilePlanboard = components.crossComponentJourneys.find(
    (journey) => journey.id === "mobile-planboard-non-drag",
  );
  mobilePlanboard.requiredActions = mobilePlanboard.requiredActions.filter(
    (action) => action !== "release-whole-assignment",
  );
  mobilePlanboard.requiredAssertions.pop();
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  assert.match(errors.join("\n"), /button: canonieke parityRequiredStates/su);
  assert.match(
    errors.join("\n"),
    /planboard-placement-interaction: canonieke parityRequiredStates/su,
  );
  assert.match(
    errors.join("\n"),
    /filter-sheet-mobile-open: mobile-parity mist applied/su,
  );
  assert.match(
    errors.join("\n"),
    /dialog-desktop-lifecycle: desktop-parity mist success-close/su,
  );
  assert.match(
    errors.join("\n"),
    /mobile-planboard-non-drag: cross-component journeycontract is ongeldig/su,
  );
});

test("component execution matrix rejects viewport, content, safe-area and portal drift", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  components.caseExecutionMatrix.viewportExpansion.mobile.runAtWidths = [390];
  components.caseExecutionMatrix.longContentFixture.tenantName.value =
    "te kort";
  components.caseExecutionMatrix.mobileKeyboardSafeAreaFixture.rectAssertions.pop();
  components.caseExecutionMatrix.portalCoverage.requiredAdditionalPortalKinds.pop();
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  assert.match(errors.join("\n"), /exacte case-uitvoeringsmatrix/su);
  assert.match(errors.join("\n"), /exacte lange-contentfixture/su);
  assert.match(errors.join("\n"), /visualViewport.*safe-area-rectasserties/su);
  assert.match(errors.join("\n"), /acht extra portaltypen/su);
});

test("component axis matrix rejects a missing critical tuple and pairwise drift", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  components.caseExecutionMatrix.axisCoverage.viewportZoomProfileSets.desktop.pop();
  components.caseExecutionMatrix.axisCoverage.criticalFullCartesian.derivedTupleSetSha256 =
    "0".repeat(64);
  components.caseExecutionMatrix.axisCoverage.remainingCasePairwise.otherAxisIndexFormula =
    "always choose the first value";
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  assert.match(errors.join("\n"), /machineleesbare viewport-\/zoom-/su);
  assert.match(
    errors.join("\n"),
    /Volledige kritieke kruisproduct mist minimaal één concrete testascombinatie/su,
  );
  assert.match(
    errors.join("\n"),
    /exacte deterministische pairwise-algoritme/su,
  );
  assert.match(
    errors.join("\n"),
    /Deterministische pairwise-matrix voor de 36 overige cases is onvolledig/su,
  );
});

test("planboard active-interaction contract rejects missing drag, keyboard and parity proof", () => {
  const components = clone(manifest("manifests/component-states.json"));
  const routes = manifest("manifests/routes.json");
  const acceptance = manifest("manifests/acceptance.json");
  const prototype = manifest("evidence/prototype/source-manifest.json");
  const placement = components.components.find(
    (component) => component.id === "planboard-placement-interaction",
  );
  placement.acceptanceIds.pop();
  placement.interactionModeParityContract.mappings[0].evidenceInterchangeable = true;
  placement.captureCases[0].interactionFrames[1].expectedTypedReasons[0].severity =
    "block";
  placement.captureCases[0].interactionFrames[0].requiredVisuals =
    placement.captureCases[0].interactionFrames[0].requiredVisuals.filter(
      (visual) => visual !== "drag-ghost",
    );
  placement.captureCases[1].interactionFrames[1].focusRemainsOnActiveGridcell = false;
  const errors = [];
  validateComponentStates(
    errors,
    ROOT,
    PACKAGE_ROOT,
    components,
    routes,
    acceptance,
    prototype,
  );
  assert.match(errors.join("\n"), /PB-003\/006\/007\/010-binding/su);
  assert.match(errors.join("\n"), /interactionModeParityContract/su);
  assert.match(
    errors.join("\n"),
    /pointermatrix.*ghost.*typed reason.*pointeroffset/su,
  );
  assert.match(
    errors.join("\n"),
    /keyboardmatrix.*invalid-position.*focusbehoud/su,
  );
});

test("post-placement capture cannot claim active drag, touch or keyboard proof", () => {
  const visual = manifest("evidence/visual/manifest.json");
  const invalid = clone(manifest("evidence/visual/capture-contract.json"));
  const settled = invalid.scenarios.find(
    (scenario) => scenario.id === "planboard-desktop-post-placement",
  );
  settled.proofClaims = ["active-pointer-drag"];
  settled.excludedProofClaims = ["active-touch-placement"];
  const errors = [];
  validateCaptureContract(errors, PACKAGE_ROOT, invalid, visual);
  assert.match(
    errors.join("\n"),
    /settled post-placement mag geen actief drag\/touch\/keyboardbewijs/su,
  );
});

test("component source coverage rejects export removal and visual reclassification", () => {
  const componentStates = manifest("manifests/component-states.json");
  const routes = manifest("manifests/routes.json");
  const removed = clone(manifest("manifests/component-source-coverage.json"));
  removed.exports = removed.exports.filter(
    (entry) =>
      !(
        entry.sourcePath ===
          "artifacts/backoffice/src/components/ui/button.tsx" &&
        entry.exportName === "Button"
      ),
  );
  const removalErrors = [];
  validateComponentSourceCoverage(
    removalErrors,
    ROOT,
    removed,
    componentStates,
    routes,
  );
  assert.match(
    removalErrors.join("\n"),
    /exportcount.*AST-regeneratie.*button\.tsx#Button/su,
  );

  const reclassified = clone(
    manifest("manifests/component-source-coverage.json"),
  );
  const button = reclassified.exports.find(
    (entry) =>
      entry.sourcePath ===
        "artifacts/backoffice/src/components/ui/button.tsx" &&
      entry.exportName === "Button",
  );
  button.classification = "non-visual";
  button.classificationContract = {
    nonVisualKind: "helper",
    reason: "Ten onrechte verborgen als helper.",
  };
  const reclassificationErrors = [];
  validateComponentSourceCoverage(
    reclassificationErrors,
    ROOT,
    reclassified,
    componentStates,
    routes,
  );
  assert.match(
    reclassificationErrors.join("\n"),
    /button\.tsx#Button: export heeft een onjuiste of verhullende classificatie/su,
  );
});

test("component source inventory matches all direct named AST exports", () => {
  const discovered = discoverComponentNamedExports();
  const coverage = manifest("manifests/component-source-coverage.json");
  assert.equal(discovered.length, 299);
  assert.equal(coverage.exportCount, 299);
  assert.deepEqual(coverage.classificationCounts, {
    "state-owner": 132,
    composite: 122,
    "non-visual": 45,
  });
});
