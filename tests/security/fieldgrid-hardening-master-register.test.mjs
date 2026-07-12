import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerPath = "docs/readiness/fieldgrid-hardening-master-register.json";
const register = JSON.parse(readFileSync(registerPath, "utf8"));

test("master register has unique canonical ids and required open fields", () => {
  const ids = register.canonicalItems.map((item) => item.canonicalId);
  assert.equal(new Set(ids).size, ids.length);

  for (const item of register.canonicalItems) {
    assert.equal(item.status, "open");
    assert.ok(register.canonicalCategories.includes(item.severity), item.canonicalId);
    for (const field of [
      "title",
      "affectedSurfaces",
      "sourcePrs",
      "sourceEvidence",
      "currentProofLayer",
      "runtimeEvidenceMissing",
      "dependencies",
      "recommendedImplementationPhase",
      "acceptanceTests",
      "migrationImpact",
      "rollback",
    ]) {
      assert.ok(item[field]?.length, `${item.canonicalId} missing ${field}`);
    }
    assert.ok(!item.currentProofLayer.includes("fixed"), `${item.canonicalId} must not claim fixed proof`);
  }
});
test("every source gap id maps to one existing canonical id", () => {
  const canonicalIds = new Set(register.canonicalItems.map((item) => item.canonicalId));
  const sourceIds = register.sourcePrs.flatMap((source) => source.sourceGapIds);
  assert.equal(new Set(sourceIds).size, sourceIds.length, "source ids must be globally unique");

  const mappedIds = Object.keys(register.oldGapToCanonicalId);
  assert.deepEqual([...sourceIds].sort(), mappedIds.sort());

  for (const [sourceId, canonicalId] of Object.entries(register.oldGapToCanonicalId)) {
    assert.ok(canonicalIds.has(canonicalId), `${sourceId} maps to unknown ${canonicalId}`);
  }
});

test("source and candidate PR numbers are valid and implementation PRs are not treated as fixes", () => {
  const sourcePrs = register.sourcePrs.map((source) => source.pr).sort((a, b) => a - b);
  assert.deepEqual(sourcePrs, [279, 281, 282, 283, 285, 287, 288, 290, 292]);

  const candidates = register.candidateImplementationPrs.map((candidate) => candidate.pr).sort((a, b) => a - b);
  assert.deepEqual(candidates, [278, 284, 286, 289, 291]);

  for (const candidate of register.candidateImplementationPrs) {
    assert.match(candidate.status, /candidate implementation only; not treated as a solution/u);
  }
});

test("auth and team execution decisions are recorded as architecture boundaries", () => {
  assert.match(register.authDecision.decision, /Fieldgrid owns invite\/recovery\/challenge\/e-mail\/tenant\/host\/audit\/rate limit/u);
  assert.match(register.authDecision.decision, /no magic links/u);
  assert.match(register.authDecision.decision, /no mailed or temporary password before proof/u);
  assert.match(register.authDecision.decision, /Supabase may temporarily remain only the credential\/session backend/u);
  assert.match(register.authDecision.decision, /full auth replacement is a separate program/u);

  const team = register.architectureDependencies.find((dependency) => dependency.id === "TEAM-EXECUTION");
  assert.ok(team);
  assert.equal(team.status, "architecture dependency; not implemented behavior");
});
