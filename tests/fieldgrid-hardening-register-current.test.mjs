import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const jsonPath = "docs/security/fieldgrid-hardening-register.json";
const mdPath = "docs/security/fieldgrid-hardening-register.md";
const register = JSON.parse(readFileSync(jsonPath, "utf8"));
const markdown = readFileSync(mdPath, "utf8");

const requiredItemFields = [
  "id",
  "title",
  "severity",
  "category",
  "status",
  "currentEvidence",
  "missingEvidence",
  "implementationPRs",
  "runtimeProof",
  "dependencies",
  "nextAction",
  "ownerTrack",
  "featureFreezeBlocking",
  "productionReleaseBlocking",
];

const canonicalPrMap = new Map([
  [
    279,
    [
      "audit/documentation",
      "cross-surface functional flow map",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [
    282,
    [
      "audit/documentation",
      "platform administration audit",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [
    283,
    [
      "audit/documentation",
      "customer PWA audit",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [
    284,
    [
      "implementation",
      "interest selection and scheduling",
      "RETAIN_REBASE_COMPLETE",
    ],
  ],
  [
    285,
    [
      "audit/documentation",
      "tenant backoffice audit",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [
    287,
    [
      "audit/documentation",
      "personnel PWA audit",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [
    288,
    ["reproduction", "assignment P0 evidence", "EXTRACT_EVIDENCE_THEN_CLOSE"],
  ],
  [
    289,
    [
      "implementation",
      "atomic personnel availability",
      "RETAIN_REBASE_COMPLETE",
    ],
  ],
  [
    290,
    [
      "reproduction",
      "finance/webhook/worker integrity pack",
      "EXTRACT_EVIDENCE_THEN_CLOSE",
    ],
  ],
  [292, ["architecture", "multi-person execution model", "PARK_ARCHITECTURE"]],
]);

test("all canonical register items use the required status model", () => {
  for (const item of register.items) {
    for (const field of requiredItemFields)
      assert.ok(field in item, `${item.id} missing ${field}`);
    assert.match(item.id, /^FG-HARD-\d{3}$/u);
    assert.ok(
      ["open", "partial", "closed", "deferred"].includes(item.status),
      `${item.id} status`,
    );
    assert.equal(
      typeof item.featureFreezeBlocking,
      "boolean",
      `${item.id} feature blocker flag`,
    );
    assert.equal(
      typeof item.productionReleaseBlocking,
      "boolean",
      `${item.id} production blocker flag`,
    );
  }
});

test("no item is marked closed without implementation and runtime evidence references", () => {
  for (const item of register.items.filter(
    (candidate) => candidate.status === "closed",
  )) {
    assert.ok(
      item.implementationPRs.length > 0,
      `${item.id} has implementation PRs`,
    );
    assert.ok(
      item.currentEvidence.length > 0,
      `${item.id} has current evidence`,
    );
    assert.ok(item.runtimeProof.length > 0, `${item.id} has runtime proof`);
  }
});

test("every feature-freeze blocker has a nextAction", () => {
  for (const item of register.items.filter(
    (candidate) => candidate.featureFreezeBlocking,
  )) {
    assert.ok(item.nextAction.trim().length > 0, `${item.id} has next action`);
  }
});

test("every remaining open or partial item has an explicit blocker or accepted-risk decision", () => {
  for (const item of register.items.filter(
    (candidate) =>
      candidate.status === "open" || candidate.status === "partial",
  )) {
    assert.ok(item.riskScenario?.trim(), `${item.id} risk scenario`);
    assert.ok(
      ["critical", "high", "medium", "low"].includes(item.severityLabel),
      `${item.id} severity label`,
    );
    assert.equal(
      typeof item.releaseBlocking,
      "boolean",
      `${item.id} release-blocking decision`,
    );
    assert.ok(
      item.affectedSurfaces?.length > 0,
      `${item.id} affected files/functions/tables`,
    );
    assert.ok(item.requiredProof?.trim(), `${item.id} required proof`);
    assert.ok(
      item.resolutionDecision?.trim(),
      `${item.id} resolution decision`,
    );
    assert.ok(
      [
        "accepted-risk",
        "release-blocking",
        "production-release-blocking-only",
      ].includes(item.blockerClassification),
      `${item.id} blocker classification`,
    );
    if (item.blockerClassification === "accepted-risk") {
      assert.ok(
        item.acceptedRisk?.owner?.trim(),
        `${item.id} accepted-risk owner`,
      );
      assert.ok(
        item.acceptedRisk?.milestone?.trim(),
        `${item.id} accepted-risk milestone`,
      );
      assert.ok(
        item.acceptedRisk?.rationale?.trim(),
        `${item.id} accepted-risk rationale`,
      );
      assert.equal(
        item.featureFreezeBlocking,
        false,
        `${item.id} accepted risk is not a freeze blocker`,
      );
      assert.equal(
        item.productionReleaseBlocking,
        false,
        `${item.id} accepted risk is not a production blocker`,
      );
    } else {
      assert.equal(
        item.acceptedRisk,
        null,
        `${item.id} blocking finding is not accepted`,
      );
      assert.ok(
        item.featureFreezeBlocking || item.productionReleaseBlocking,
        `${item.id} has a blocker flag`,
      );
    }
  }
});

test("Phase 2C completion leaves no unresolved high-severity feature-freeze blocker", () => {
  const unresolved = register.items.filter(
    (item) =>
      item.status !== "closed" &&
      item.severity === "P0" &&
      item.featureFreezeBlocking,
  );
  assert.deepEqual(unresolved, []);
  assert.equal(register.counts.featureFreezeBlocking, 0);
});

test("all open PR numbers are represented exactly once with canonical title/type/disposition mapping", () => {
  const actual = register.openPrDispositions
    .map((entry) => entry.pr)
    .sort((a, b) => a - b);
  assert.deepEqual(
    actual,
    [...canonicalPrMap.keys()].sort((a, b) => a - b),
  );
  assert.equal(new Set(actual).size, canonicalPrMap.size);

  for (const entry of register.openPrDispositions) {
    const [actualType, actualSubject, disposition] = canonicalPrMap.get(
      entry.pr,
    );
    assert.equal(
      entry.currentBaseSha,
      "f36e84dad5d1c595e4dd349ff5ce6bd439722576",
      `PR #${entry.pr} old base`,
    );
    assert.equal(entry.actualType, actualType, `PR #${entry.pr} type`);
    assert.equal(entry.actualSubject, actualSubject, `PR #${entry.pr} subject`);
    assert.equal(entry.disposition, disposition, `PR #${entry.pr} disposition`);
  }
});

test("implementation PRs are not classified as audit-only and specific historical PR meanings are preserved", () => {
  const byPr = new Map(
    register.openPrDispositions.map((entry) => [entry.pr, entry]),
  );
  for (const pr of [284, 289]) {
    assert.ok(byPr.get(pr).runtimeCodeExists, `PR #${pr} has runtime code`);
    assert.doesNotMatch(
      byPr.get(pr).actualType,
      /audit/u,
      `PR #${pr} is not audit-only`,
    );
  }
  assert.equal(byPr.get(290).actualType, "reproduction");
  assert.equal(
    byPr.get(290).actualSubject,
    "finance/webhook/worker integrity pack",
  );
  assert.notEqual(byPr.get(290).actualSubject, "test baseline work");
  assert.equal(byPr.get(292).disposition, "PARK_ARCHITECTURE");
});

test("merged Phase-B and Phase 2 foundation PRs are represented", () => {
  assert.deepEqual(
    register.mergedImplementationPRs,
    [278, 291, 294, 295, 296, 326, 327, 328],
  );
  for (const pr of register.mergedImplementationPRs) {
    assert.ok(
      register.items.some((item) => item.implementationPRs.includes(pr)),
      `PR ${pr} represented by item`,
    );
  }
});

test("obsolete base SHA is not presented as current and current main SHA is recorded", () => {
  assert.equal(
    register.currentMainSha,
    "7f57c5a93ec1af6d5553abf190cfd0c3ac300bda",
  );
  assert.match(markdown, /7f57c5a93ec1af6d5553abf190cfd0c3ac300bda/u);
  assert.doesNotMatch(markdown, /Current main SHA: `f36e84d/u);
  assert.doesNotMatch(
    JSON.stringify({ currentMainSha: register.currentMainSha }),
    /f36e84d/u,
  );
});

test("JSON and Markdown register counts match", () => {
  for (const status of ["closed", "partial", "open", "deferred"]) {
    const actual = register.items.filter(
      (item) => item.status === status,
    ).length;
    assert.equal(register.counts[status], actual, `${status} JSON count`);
    assert.match(
      markdown,
      new RegExp(`\\| ${status} \\| ${actual} \\|`, "u"),
      `${status} Markdown count`,
    );
  }
  for (const [field, label] of [
    ["featureFreezeBlocking", "feature-freeze blockers"],
    ["productionReleaseBlocking", "production release blockers"],
  ]) {
    const actual = register.items.filter((item) => item[field]).length;
    assert.equal(register.counts[field], actual, `${field} JSON count`);
    assert.match(markdown, new RegExp(`\\| ${label} \\| ${actual} \\|`, "u"));
  }
});

test("no nonexistent repository evidence path is referenced", () => {
  for (const item of register.items) {
    for (const evidence of item.currentEvidence) {
      if (/^(docs|tests|scripts|lib|artifacts)\//u.test(evidence)) {
        assert.ok(
          existsSync(evidence),
          `${item.id} evidence path exists: ${evidence}`,
        );
      }
    }
  }
});

test("reproduction-only evidence cannot close a finding", () => {
  for (const item of register.items) {
    const evidence = [...item.currentEvidence, ...item.runtimeProof]
      .join(" ")
      .toLowerCase();
    if (evidence.includes("reproduction evidence only")) {
      assert.notEqual(
        item.status,
        "closed",
        `${item.id} reproduction-only evidence must not close`,
      );
    }
  }
});

test("production-only release gates do not inflate feature-freeze blocker count", () => {
  const productionOnly = register.items.filter(
    (item) => item.productionReleaseBlocking && !item.featureFreezeBlocking,
  );
  assert.ok(
    productionOnly.some((item) => item.id === "FG-HARD-024"),
    "production go/no-go is production-only",
  );
  assert.equal(
    register.counts.featureFreezeBlocking,
    register.items.filter((item) => item.featureFreezeBlocking).length,
  );
  assert.ok(
    register.counts.productionReleaseBlocking >
      register.counts.featureFreezeBlocking,
  );
});
