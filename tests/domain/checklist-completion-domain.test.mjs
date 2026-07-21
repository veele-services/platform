import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../../lib/db/src/checklist-completion.ts", import.meta.url);
const source = readFileSync(filename, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports, require: () => ({}) }, { filename: filename.pathname });
const { validateAssignmentChecklistCompletion } = module.exports;

function checklist(overrides = {}) {
  return {
    id: "checklist-1",
    status: "active",
    displayName: "Veiligheidscontrole",
    templateSnapshot: {
      sections: [{
        id: "section",
        title: "Controle",
        sortOrder: 0,
        items: [
          { id: "ok", type: "checkbox", label: "Situatie veilig", required: true, sortOrder: 0 },
          { id: "temperature", type: "measurement", label: "Temperatuur", required: true, sortOrder: 1, validation: { min: 5, max: 30 } },
          { id: "reason", type: "long_text", label: "Toelichting", required: true, sortOrder: 2, visibleWhen: { itemId: "ok", operator: "equals", value: false } },
        ],
      }],
    },
    effectiveRules: {
      autoAttach: true,
      required: true,
      blockingMoments: ["before_complete"],
      skipAllowed: false,
      personnelCanRemove: false,
      minimumPhotos: 1,
      signatureRequired: false,
      deviationNoteRequired: true,
      displayName: "Veiligheidscontrole",
      instruction: null,
      sortOrder: 0,
      causedBy: {},
    },
    ...overrides,
  };
}

const answer = (snapshotItemId, value, overrides = {}) => ({
  assignmentChecklistId: "checklist-1",
  snapshotItemId,
  value,
  isDeviation: false,
  deviationNote: null,
  ...overrides,
});

test("missing required answers and evidence block completion", () => {
  const issues = validateAssignmentChecklistCompletion({ checklists: [checklist()], answers: [], evidence: [] });
  assert.ok(issues.some((issue) => issue.itemId === "ok" && issue.code === "required_answer_missing"));
  assert.ok(issues.some((issue) => issue.itemId === "temperature" && issue.code === "required_answer_missing"));
  assert.ok(issues.some((issue) => issue.code === "photo_evidence_missing"));
  assert.equal(issues.some((issue) => issue.itemId === "reason"), false);
});

test("conditional required field only blocks while visible", () => {
  const hidden = validateAssignmentChecklistCompletion({
    checklists: [checklist()],
    answers: [answer("ok", true), answer("temperature", 20)],
    evidence: [{ assignmentChecklistId: "checklist-1", snapshotItemId: "ok", kind: "photo" }],
  });
  assert.equal(hidden.some((issue) => issue.itemId === "reason"), false);
  const visible = validateAssignmentChecklistCompletion({
    checklists: [checklist()],
    answers: [answer("ok", false), answer("temperature", 20)],
    evidence: [{ assignmentChecklistId: "checklist-1", snapshotItemId: "ok", kind: "photo" }],
  });
  assert.ok(visible.some((issue) => issue.itemId === "reason"));
});

test("numeric constraints are enforced", () => {
  const issues = validateAssignmentChecklistCompletion({
    checklists: [checklist()],
    answers: [answer("ok", true), answer("temperature", 40)],
    evidence: [{ assignmentChecklistId: "checklist-1", snapshotItemId: "ok", kind: "photo" }],
  });
  assert.ok(issues.some((issue) => issue.code === "number_above_maximum"));
});

test("deviation requires explanation when configured", () => {
  const issues = validateAssignmentChecklistCompletion({
    checklists: [checklist()],
    answers: [answer("ok", true, { isDeviation: true }), answer("temperature", 20)],
    evidence: [{ assignmentChecklistId: "checklist-1", snapshotItemId: "ok", kind: "photo" }],
  });
  assert.ok(issues.some((issue) => issue.code === "deviation_note_missing"));
});

test("pending reconciliation review blocks with an exact message", () => {
  const issues = validateAssignmentChecklistCompletion({
    checklists: [checklist({ status: "detached_pending_review" })],
    answers: [],
    evidence: [],
  });
  assert.deepEqual(Array.from(issues, (issue) => issue.code), ["checklist_pending_review"]);
});

test("waived, not-applicable and cancelled snapshots do not block", () => {
  for (const status of ["waived", "not_applicable", "cancelled"]) {
    assert.equal(validateAssignmentChecklistCompletion({ checklists: [checklist({ status })], answers: [], evidence: [] }).length, 0);
  }
});

test("completion succeeds after all required data and photo exist", () => {
  const issues = validateAssignmentChecklistCompletion({
    checklists: [checklist()],
    answers: [answer("ok", true), answer("temperature", "20,5")],
    evidence: [{ assignmentChecklistId: "checklist-1", snapshotItemId: "ok", kind: "photo" }],
  });
  assert.equal(issues.length, 0);
});

test("required photo and signature fields are satisfied by append-only evidence", () => {
  const evidenceChecklist = checklist({
    templateSnapshot: {
      sections: [{
        id: "evidence",
        title: "Bewijs",
        sortOrder: 0,
        items: [
          { id: "photo", type: "photo", label: "Situatiefoto", required: true, sortOrder: 0 },
          { id: "signature", type: "signature", label: "Handtekening", required: true, sortOrder: 1 },
        ],
      }],
    },
    effectiveRules: { ...checklist().effectiveRules, minimumPhotos: 0 },
  });
  const missing = validateAssignmentChecklistCompletion({ checklists: [evidenceChecklist], answers: [], evidence: [] });
  assert.deepEqual(Array.from(missing, (issue) => issue.code).sort(), ["photo_evidence_missing", "signature_evidence_missing"]);
  const complete = validateAssignmentChecklistCompletion({
    checklists: [evidenceChecklist],
    answers: [],
    evidence: [
      { assignmentChecklistId: "checklist-1", snapshotItemId: "photo", kind: "photo" },
      { assignmentChecklistId: "checklist-1", snapshotItemId: "signature", kind: "signature" },
    ],
  });
  assert.equal(complete.length, 0);
});

test("each configured lifecycle moment blocks only at that moment", () => {
  for (const blockingMoment of ["before_start", "before_complete", "before_report_submit"]) {
    const momentChecklist = checklist({
      effectiveRules: {
        ...checklist().effectiveRules,
        required: false,
        minimumPhotos: 0,
        blockingMoments: [blockingMoment],
      },
    });
    const configured = validateAssignmentChecklistCompletion({
      checklists: [momentChecklist],
      answers: [],
      evidence: [],
      blockingMoment,
    });
    assert.ok(configured.length > 0, `${blockingMoment} should enforce its checklist`);
    for (const otherMoment of ["before_start", "before_complete", "before_report_submit"].filter((moment) => moment !== blockingMoment)) {
      const unrelated = validateAssignmentChecklistCompletion({
        checklists: [momentChecklist],
        answers: [],
        evidence: [],
        blockingMoment: otherMoment,
      });
      assert.equal(unrelated.length, 0, `${blockingMoment} should not block ${otherMoment}`);
    }
  }
});

test("legacy required checklist without explicit moments defaults to completion", () => {
  const legacyChecklist = checklist({
    effectiveRules: {
      ...checklist().effectiveRules,
      blockingMoments: [],
      minimumPhotos: 0,
    },
  });
  assert.ok(validateAssignmentChecklistCompletion({
    checklists: [legacyChecklist], answers: [], evidence: [], blockingMoment: "before_complete",
  }).length > 0);
  assert.equal(validateAssignmentChecklistCompletion({
    checklists: [legacyChecklist], answers: [], evidence: [], blockingMoment: "before_start",
  }).length, 0);
});

test("report-bound requirements are completed before lock and revalidated read-only afterwards", () => {
  const reportChecklist = checklist({
    effectiveRules: {
      ...checklist().effectiveRules,
      required: false,
      minimumPhotos: 0,
      blockingMoments: ["before_report_submit"],
    },
  });
  assert.ok(validateAssignmentChecklistCompletion({
    checklists: [reportChecklist],
    answers: [],
    evidence: [],
    blockingMoments: ["before_complete", "before_report_submit"],
  }).length > 0);
  assert.ok(validateAssignmentChecklistCompletion({
    checklists: [{ ...reportChecklist, status: "completed" }],
    answers: [],
    evidence: [],
    blockingMoment: "before_report_submit",
  }).length > 0);
});
