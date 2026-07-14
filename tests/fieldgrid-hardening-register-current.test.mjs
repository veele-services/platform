import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
];

test("all canonical register items use the required status model", () => {
  for (const item of register.items) {
    for (const field of requiredItemFields) assert.ok(field in item, `${item.id} missing ${field}`);
    assert.match(item.id, /^FG-HARD-\d{3}$/u);
    assert.ok(["open", "partial", "closed", "deferred"].includes(item.status), `${item.id} status`);
    assert.equal(typeof item.featureFreezeBlocking, "boolean", `${item.id} blocker flag`);
  }
});

test("no item is marked closed without implementation and runtime evidence references", () => {
  for (const item of register.items.filter((candidate) => candidate.status === "closed")) {
    assert.ok(item.implementationPRs.length > 0, `${item.id} has implementation PRs`);
    assert.ok(item.currentEvidence.length > 0, `${item.id} has current evidence`);
    assert.ok(item.runtimeProof.length > 0, `${item.id} has runtime proof`);
  }
});

test("every feature-freeze blocker has a nextAction", () => {
  for (const item of register.items.filter((candidate) => candidate.featureFreezeBlocking)) {
    assert.ok(item.nextAction.trim().length > 0, `${item.id} has next action`);
  }
});

test("all open PR numbers are represented exactly once", () => {
  const expected = [279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 292, 293];
  const actual = register.openPrDispositions.map((entry) => entry.pr).sort((a, b) => a - b);
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, expected.length);
});

test("merged Phase-B PRs are represented", () => {
  assert.deepEqual(register.mergedImplementationPRs, [278, 291, 294, 295, 296]);
  for (const pr of register.mergedImplementationPRs) {
    assert.ok(register.items.some((item) => item.implementationPRs.includes(pr)), `PR ${pr} represented by item`);
  }
});

test("obsolete base SHA is not presented as current and current main SHA is recorded", () => {
  assert.equal(register.currentMainSha, "42edb5664ed507ed914b8bebf8847ab1f6e39f74");
  assert.match(markdown, /42edb5664ed507ed914b8bebf8847ab1f6e39f74/u);
  assert.doesNotMatch(markdown, /Current main SHA: `f36e84d/u);
  assert.doesNotMatch(JSON.stringify({ currentMainSha: register.currentMainSha }), /f36e84d/u);
});

test("JSON and Markdown register counts match", () => {
  for (const status of ["closed", "partial", "open", "deferred"]) {
    const actual = register.items.filter((item) => item.status === status).length;
    assert.equal(register.counts[status], actual, `${status} JSON count`);
    assert.match(markdown, new RegExp(`\\| ${status} \\| ${actual} \\|`, "u"), `${status} Markdown count`);
  }
  const blockers = register.items.filter((item) => item.featureFreezeBlocking).length;
  assert.equal(register.counts.featureFreezeBlocking, blockers);
  assert.match(markdown, new RegExp(`\\| feature-freeze blockers \\| ${blockers} \\|`, "u"));
});
