import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workstreamsPath = new URL("../docs/phase-2/workstreams.json", import.meta.url);
const stalePrsPath = new URL("../docs/phase-2/stale-pr-disposition.json", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("Phase 2 workstream graph is internally consistent and acyclic", async () => {
  const contract = await readJson(workstreamsPath);

  assert.equal(contract.phase, "fieldgrid-phase-2");
  assert.equal(contract.startingSha.main, "c13327593599e78abb266b0e6a231feac4aaa8f2");
  assert.equal(contract.startingSha.staging, "c13327593599e78abb266b0e6a231feac4aaa8f2");
  assert.equal(contract.branch, "phase2/w00-program-bootstrap");
  assert.equal(contract.target, "main");
  assert.equal(contract.runtimeImplementationAllowed, false);

  const ids = new Set();
  for (const workstream of contract.workstreams) {
    assert.match(workstream.id, /^w\d{2}-[a-z0-9-]+$/u);
    assert.ok(workstream.name, `${workstream.id} must have a name`);
    assert.ok(Array.isArray(workstream.owners) && workstream.owners.length > 0, `${workstream.id} must have owners`);
    assert.ok(Array.isArray(workstream.dependsOn), `${workstream.id} must have dependencies array`);
    assert.ok(Array.isArray(workstream.outputs) && workstream.outputs.length > 0, `${workstream.id} must have outputs`);
    assert.equal(ids.has(workstream.id), false, `duplicate workstream id ${workstream.id}`);
    ids.add(workstream.id);
  }

  for (const workstream of contract.workstreams) {
    for (const dependency of workstream.dependsOn) {
      assert.ok(ids.has(dependency), `${workstream.id} depends on unknown workstream ${dependency}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(contract.workstreams.map((workstream) => [workstream.id, workstream]));

  function visit(id, path = []) {
    if (visited.has(id)) return;
    assert.equal(visiting.has(id), false, `cycle detected: ${[...path, id].join(" -> ")}`);
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of ids) visit(id);
  assert.equal(visited.size, contract.workstreams.length);
});

test("Phase 2 stale PR dispositions cover required PRs with allowed classifications", async () => {
  const disposition = await readJson(stalePrsPath);
  const requiredPrs = [282, 283, 284, 285, 286, 287, 288, 289, 290, 292];
  const allowed = new Set(["reference-only", "concept to reimplement", "tests/docs to port", "superseded", "later-phase scope"]);
  const byNumber = new Map(disposition.dispositions.map((entry) => [entry.number, entry]));

  assert.equal(disposition.repository, "veele-services/platform");
  assert.deepEqual([...byNumber.keys()].sort((a, b) => a - b), requiredPrs);

  for (const number of requiredPrs) {
    const entry = byNumber.get(number);
    assert.ok(entry.title, `PR #${number} must have a title`);
    assert.ok(allowed.has(entry.classification), `PR #${number} has unsupported classification ${entry.classification}`);
    assert.ok(entry.rationale, `PR #${number} must have rationale`);
  }
});
