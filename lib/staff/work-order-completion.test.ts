import { describe, expect, it } from "vitest";
import {
  externalMapsUrl,
  staffOrderPermissions,
  staffExecutionLabel,
  staffTaskBlocksCompletion,
  staffTaskIsChecked,
  staffTaskOwnQuantity,
  type StaffCompletionTask,
} from "./work-order-completion";

const task = (input: Partial<StaffCompletionTask> = {}): StaffCompletionTask => ({
  quantity: 4,
  transferred_quantity: 0,
  withdrawn_quantity: 0,
  completed_at: null,
  execution_state: "planned",
  is_extra_work: false,
  extra_work_status: null,
  ...input,
});

describe("staff work-order completion helpers", () => {
  it("locks completed contributions and never resumes a submitted delivery", () => {
    expect(staffOrderPermissions("completed", "review", true)).toEqual({ editable: false, canFinishDelivery: false });
    expect(staffOrderPermissions("completed", "approved", true)).toEqual({ editable: false, canFinishDelivery: false });
    expect(staffOrderPermissions("completed", "draft", false)).toEqual({ editable: false, canFinishDelivery: false });
    expect(staffOrderPermissions("completed", "waiting_signature", true)).toEqual({ editable: false, canFinishDelivery: true });
    expect(staffOrderPermissions("in_progress", "draft", false).editable).toBe(true);
    expect(staffOrderPermissions("in_progress", "review", false).editable).toBe(false);
  });
  it("does not label a stopped assignment as a submitted report", () => {
    expect(staffExecutionLabel("completed", "draft")).toBe("Werkzaamheden afgerond");
    expect(staffExecutionLabel("completed", "waiting_signature")).toBe("Wacht op ondertekening");
    expect(staffExecutionLabel("completed", "review")).toBe("Gereedgemeld");
    expect(staffExecutionLabel("seen", "draft")).toBe("Gezien");
  });
  it("checks only a genuinely completed execution", () => {
    expect(staffTaskIsChecked(task({ execution_state: "completed", completed_at: "2026-10-05T10:00:00Z" }))).toBe(true);
    expect(staffTaskIsChecked(task({ execution_state: "partial", completed_at: "2026-10-05T10:00:00Z" }))).toBe(false);
    expect(staffTaskIsChecked(task({ execution_state: "not_done", completed_at: "2026-10-05T10:00:00Z" }))).toBe(false);
  });

  it("blocks only unresolved scope that still belongs to the active work order", () => {
    expect(staffTaskBlocksCompletion(task())).toBe(true);
    expect(staffTaskBlocksCompletion(task({ completed_at: "2026-10-05T10:00:00Z", execution_state: "partial" }))).toBe(false);
    expect(staffTaskBlocksCompletion(task({ transferred_quantity: 3, withdrawn_quantity: 1 }))).toBe(false);
    expect(staffTaskBlocksCompletion(task({ is_extra_work: true, extra_work_status: "rejected" }))).toBe(false);
  });

  it("uses the remaining own quantity for a versioned completion", () => {
    expect(staffTaskOwnQuantity(task({ quantity: 8, transferred_quantity: 2, withdrawn_quantity: 1 }))).toBe(5);
    expect(staffTaskOwnQuantity(task({ quantity: 0.3, transferred_quantity: 0.1 }))).toBe(0.2);
  });

  it("creates an encoded HTTPS maps destination and refuses an empty address", () => {
    expect(externalMapsUrl("IJdok 8, 1013 MM Amsterdam")).toBe("https://www.google.com/maps/search/?api=1&query=IJdok%208%2C%201013%20MM%20Amsterdam");
    expect(externalMapsUrl("  ")).toBeNull();
  });
});
