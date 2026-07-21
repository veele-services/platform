import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../../artifacts/personeel-pwa/src/lib/uploads/assignment-media.ts", import.meta.url);
const source = readFileSync(filename, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports }, { filename: filename.pathname });
const { buildChecklistEvidencePath, isChecklistEvidencePath } = module.exports;

const tenantId = "10000000-0000-4000-8000-000000000001";
const assignmentId = "70000000-0000-4000-8000-000000000001";
const checklistId = "80000000-0000-4000-8000-000000000001";

test("checklist evidence path is canonical and round-trips", () => {
  const path = buildChecklistEvidencePath(tenantId, assignmentId, checklistId, "Safety Photo", "bewijs foto.jpg", "operation-1");
  assert.match(path, /^tenant\/10000000-0000-4000-8000-000000000001\/assignments\/70000000-0000-4000-8000-000000000001\/checklists\/80000000-0000-4000-8000-000000000001\/safety-photo\//u);
  assert.equal(isChecklistEvidencePath(tenantId, assignmentId, checklistId, "Safety Photo", path), true);
});

test("legacy, cross-tenant and unsafe checklist paths fail closed", () => {
  const suffix = `checklists/${checklistId}/safety-photo/operation-bewijs.jpg`;
  assert.equal(isChecklistEvidencePath(tenantId, assignmentId, checklistId, "Safety Photo", `assignments/${assignmentId}/${suffix}`), false);
  assert.equal(isChecklistEvidencePath(tenantId, assignmentId, checklistId, "Safety Photo", `tenant/10000000-0000-4000-8000-000000000002/assignments/${assignmentId}/${suffix}`), false);
  assert.equal(isChecklistEvidencePath(tenantId, assignmentId, checklistId, "Safety Photo", `tenant/${tenantId}/assignments/${assignmentId}/checklists/${checklistId}/../bewijs.jpg`), false);
});
