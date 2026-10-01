import { describe, expect, it } from "vitest";
import { checklistQuestionState, type ChecklistInstance, type ChecklistQuestion } from "./model";

const gate = { id: "gate", type: "boolean" } as ChecklistQuestion;
const followup = { id: "followup", type: "text", condition: { questionId: "gate", equals: true } } as ChecklistQuestion;
const checklist: ChecklistInstance = { id: "checklist", revisionId: "revision", name: "FICTITIOUS", version: 1, questions: [gate, followup], answers: [] };

describe("privacy-preserving shared checklist progress", () => {
  it("shows a server-activated follow-up without receiving another employee's answer", () => {
    const limited = { ...checklist, questionStates: [
      { questionId: "gate", visible: true, answered: true, editable: false },
      { questionId: "followup", visible: true, answered: false, editable: true },
    ] };
    expect(checklistQuestionState(limited, gate)).toMatchObject({ answered: true, editable: false });
    expect(checklistQuestionState(limited, followup)).toMatchObject({ visible: true, editable: true });
    expect(limited.answers).toEqual([]);
  });
  it("respects a newly inactive condition and fails closed for missing restricted metadata", () => {
    const limited = { ...checklist, questionStates: [{ questionId: "followup", visible: false, answered: false, editable: true }] };
    expect(checklistQuestionState(limited, followup).visible).toBe(false);
    expect(checklistQuestionState(limited, gate)).toMatchObject({ visible: false, editable: false });
  });
  it("preserves full backoffice condition evaluation", () => {
    expect(checklistQuestionState(checklist, followup).visible).toBe(false);
    const full = { ...checklist, answers: [{ questionId: "gate", value: true, notApplicable: false, reason: "", version: 1, actor: "actor", updatedAt: "2030-01-01" }] };
    expect(checklistQuestionState(full, followup).visible).toBe(true);
  });
});
