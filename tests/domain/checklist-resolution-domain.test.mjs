import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../../lib/db/src/checklist-resolution.ts", import.meta.url);
const source = readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require }, { filename: filename.pathname });
const resolution = module.exports;

const IDS = {
  tenant: "10000000-0000-4000-8000-000000000001",
  assignment: "20000000-0000-4000-8000-000000000001",
  customer: "30000000-0000-4000-8000-000000000001",
  sector: "40000000-0000-4000-8000-000000000001",
  object: "50000000-0000-4000-8000-000000000001",
  taskA: "60000000-0000-4000-8000-000000000001",
  taskB: "60000000-0000-4000-8000-000000000002",
};

function context(overrides = {}) {
  return {
    tenantId: IDS.tenant,
    assignmentId: IDS.assignment,
    customerId: IDS.customer,
    sectorId: IDS.sector,
    objectId: IDS.object,
    objectType: "Kantoor",
    effectiveAt: "2026-07-21T10:00:00.000Z",
    tasks: [
      { id: "task-line-a1", taskCodeId: IDS.taskA, tenantTaskCodeId: null, code: "GLAS" },
      { id: "task-line-a2", taskCodeId: IDS.taskA, tenantTaskCodeId: null, code: "GLAS" },
      { id: "task-line-b1", taskCodeId: IDS.taskB, tenantTaskCodeId: null, code: "VLOER" },
    ],
    ...overrides,
  };
}

function template(id, overrides = {}) {
  return {
    templateId: id,
    familyKey: overrides.familyKey ?? `family-${id}`,
    templateName: overrides.templateName ?? `Checklist ${id}`,
    versionId: `${id}-v1`,
    versionNumber: 1,
    cardinality: overrides.cardinality ?? "per_work_order",
    protected: overrides.protected ?? false,
    waivable: overrides.waivable ?? true,
    snapshot: { sections: [] },
    ...overrides,
  };
}

let bindingSequence = 0;
function binding(templateRef, overrides = {}) {
  bindingSequence += 1;
  return {
    id: overrides.id ?? `binding-${String(bindingSequence).padStart(3, "0")}`,
    tenantId: IDS.tenant,
    template: templateRef,
    selectors: {},
    mode: "add",
    targetTemplateId: null,
    targetFamilyKey: null,
    activeFrom: null,
    activeUntil: null,
    autoAttach: true,
    required: false,
    blockingMoments: [],
    skipAllowed: true,
    personnelCanRemove: true,
    minimumPhotos: 0,
    signatureRequired: false,
    deviationNoteRequired: false,
    displayName: null,
    instruction: null,
    instructionMode: "append",
    sortOrder: 0,
    reason: null,
    tieBreaker: 0,
    createdAt: `2026-07-21T09:${String(bindingSequence).padStart(2, "0")}:00.000Z`,
    ...overrides,
  };
}

function resolve(bindings, contextValue = context()) {
  return resolution.resolveChecklistComposition({ context: contextValue, bindings });
}

test("tenant standard and object template are both added", () => {
  const result = resolve([
    binding(template("tenant")),
    binding(template("object"), { selectors: { objectId: IDS.object } }),
  ]);
  assert.deepEqual(Array.from(result.instances, (item) => item.templateId).sort(), ["object", "tenant"]);
});

test("same template through sector and object is one instance with two sources", () => {
  const shared = template("safety");
  const result = resolve([
    binding(shared, { selectors: { sectorId: IDS.sector } }),
    binding(shared, { selectors: { objectId: IDS.object } }),
  ]);
  assert.equal(result.instances.length, 1);
  assert.equal(result.instances[0].sources.length, 2);
});

test("strongest requirement rules win", () => {
  const shared = template("strict");
  const result = resolve([
    binding(shared, { required: false, minimumPhotos: 1, personnelCanRemove: true, skipAllowed: true }),
    binding(shared, {
      selectors: { objectId: IDS.object },
      required: true,
      minimumPhotos: 3,
      personnelCanRemove: false,
      skipAllowed: false,
      signatureRequired: true,
      deviationNoteRequired: true,
      blockingMoments: ["before_complete"],
    }),
  ]);
  const effective = result.instances[0].effective;
  assert.equal(effective.required, true);
  assert.equal(effective.minimumPhotos, 3);
  assert.equal(effective.personnelCanRemove, false);
  assert.equal(effective.skipAllowed, false);
  assert.equal(effective.signatureRequired, true);
  assert.equal(effective.deviationNoteRequired, true);
  assert.deepEqual(Array.from(effective.blockingMoments), ["before_complete"]);
});

test("auto attach wins over available-only for the same identity", () => {
  const shared = template("auto");
  const result = resolve([
    binding(shared, { mode: "available", autoAttach: false }),
    binding(shared, { selectors: { sectorId: IDS.sector }, autoAttach: true }),
  ]);
  assert.equal(result.instances.length, 1);
  assert.equal(result.available.length, 0);
});

test("per work order deduplicates over task rows", () => {
  const result = resolve([binding(template("work", { cardinality: "per_work_order" }))]);
  assert.equal(result.instances.length, 1);
  assert.match(result.instances[0].cardinalityKey, /^assignment:/u);
});

test("per task code emits one instance per unique code", () => {
  const result = resolve([binding(template("code", { cardinality: "per_task_code" }))]);
  assert.equal(result.instances.length, 2);
  assert.deepEqual(Array.from(result.instances, (item) => item.cardinalityKey).sort(), [
    `task-code:${IDS.taskA}`,
    `task-code:${IDS.taskB}`,
  ]);
});

test("per task instance emits one instance per concrete row", () => {
  const result = resolve([binding(template("line", { cardinality: "per_task_instance" }))]);
  assert.equal(result.instances.length, 3);
  assert.deepEqual(Array.from(result.instances, (item) => item.cardinalityKey).sort(), [
    "task:task-line-a1",
    "task:task-line-a2",
    "task:task-line-b1",
  ]);
});

test("combined selector only matches when every condition matches", () => {
  const combined = binding(template("combined"), {
    selectors: { objectId: IDS.object, taskCodeId: IDS.taskA },
  });
  assert.equal(resolve([combined]).instances.length, 1);
  assert.equal(resolve([combined], context({ objectId: "other" })).instances.length, 0);
  assert.equal(resolve([combined], context({ tasks: [] })).instances.length, 0);
});

test("valid specific replace replaces a generic family/template", () => {
  const generic = template("generic", { familyKey: "inspection" });
  const replacement = template("specific", { familyKey: "inspection-specific" });
  const result = resolve([
    binding(generic),
    binding(replacement, {
      mode: "replace",
      selectors: { objectId: IDS.object },
      targetFamilyKey: "inspection",
      reason: "Objectspecifiek protocol",
    }),
  ]);
  assert.deepEqual(Array.from(result.instances, (item) => item.templateId), ["specific"]);
  assert.equal(result.replaced.length, 1);
  assert.equal(result.replaced[0].templateId, "generic");
});

test("replace without target fails validation and keeps add", () => {
  const generic = template("generic-invalid", { familyKey: "invalid-family" });
  const result = resolve([
    binding(generic),
    binding(template("replacement-invalid"), { mode: "replace", reason: "Geen doel" }),
  ]);
  assert.deepEqual(Array.from(result.instances, (item) => item.templateId), ["generic-invalid"]);
  assert.equal(result.warnings[0].code, "invalid_binding");
});

test("specific suppress hides a non-protected generic addition", () => {
  const generic = template("suppressible", { familyKey: "hygiene" });
  const result = resolve([
    binding(generic),
    binding(null, {
      mode: "suppress",
      selectors: { objectId: IDS.object },
      targetTemplateId: generic.templateId,
      reason: "Niet van toepassing op dit object",
    }),
  ]);
  assert.equal(result.instances.length, 0);
  assert.equal(result.suppressed.length, 1);
});

test("protected checklist rejects suppress and stays active", () => {
  const protectedTemplate = template("protected", { protected: true, waivable: false });
  const result = resolve([
    binding(protectedTemplate),
    binding(null, {
      mode: "suppress",
      selectors: { objectId: IDS.object },
      targetTemplateId: protectedTemplate.templateId,
      reason: "Poging",
    }),
  ]);
  assert.equal(result.instances.length, 1);
  assert.ok(result.warnings.some((warning) => warning.code === "protected_suppress"));
});

test("equal-priority suppress loses safely to add", () => {
  const added = template("equal");
  const selectors = { objectId: IDS.object };
  const result = resolve([
    binding(added, { selectors }),
    binding(null, {
      mode: "suppress",
      selectors,
      targetTemplateId: added.templateId,
      reason: "Gelijkspel",
      tieBreaker: 999,
    }),
  ]);
  assert.equal(result.instances.length, 1);
  assert.ok(result.warnings.some((warning) => warning.code === "equal_specificity_conflict"));
});

test("tie breaker cannot break hierarchy", () => {
  const shared = template("hierarchy");
  const result = resolve([
    binding(shared, { displayName: "Tenant", tieBreaker: 9999 }),
    binding(shared, { selectors: { objectId: IDS.object }, displayName: "Object", tieBreaker: -9999 }),
  ]);
  assert.equal(result.instances[0].effective.displayName, "Object");
});

test("task-code selector only emits matching task cardinalities", () => {
  const result = resolve([
    binding(template("selected-lines", { cardinality: "per_task_instance" }), {
      selectors: { taskCodeId: IDS.taskA },
    }),
  ]);
  assert.deepEqual(Array.from(result.instances, (item) => item.cardinalityKey).sort(), [
    "task:task-line-a1",
    "task:task-line-a2",
  ]);
});

test("resolver output and explain order are byte-for-byte deterministic", () => {
  const bindings = [
    binding(template("z"), { id: "z-source", sortOrder: 20 }),
    binding(template("a"), { id: "a-source", sortOrder: 10 }),
  ];
  const first = resolve(bindings);
  const second = resolve([...bindings].reverse());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(Array.from(first.instances, (item) => item.templateId), ["a", "z"]);
});

test("instance identity is stable and tenant-bound", () => {
  const base = {
    tenantId: IDS.tenant,
    assignmentId: IDS.assignment,
    templateId: "stable",
    cardinality: "per_work_order",
    cardinalityKey: `assignment:${IDS.assignment}`,
  };
  assert.equal(
    resolution.buildChecklistInstanceIdentity(base),
    resolution.buildChecklistInstanceIdentity({ ...base }),
  );
  assert.notEqual(
    resolution.buildChecklistInstanceIdentity(base),
    resolution.buildChecklistInstanceIdentity({ ...base, tenantId: "other-tenant" }),
  );
});

test("duplicate processing creates the same identity and fingerprint", () => {
  const bindings = [binding(template("idempotent"), { id: "idempotent-source" })];
  const first = resolve(bindings);
  const replay = resolve(bindings);
  assert.equal(first.contextFingerprint, replay.contextFingerprint);
  assert.equal(first.instances[0].identity, replay.instances[0].identity);
  assert.equal(new Set([first.instances[0].identity, replay.instances[0].identity]).size, 1);
});
