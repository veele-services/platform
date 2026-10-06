export type StaffCompletionTask = {
  quantity: number;
  transferred_quantity: number;
  withdrawn_quantity: number;
  completed_at: string | null;
  execution_state: string;
  is_extra_work: boolean;
  extra_work_status: string | null;
};

const quantityTolerance = 0.000_001;

export function staffOrderPermissions(assignmentStatus: string | undefined, reportState: string, deliveryOwner: boolean) {
  const contributionOpen = ["draft", "correction"].includes(reportState);
  return {
    editable: contributionOpen && ["seen", "travelling", "in_progress", "correction_required"].includes(assignmentStatus ?? ""),
    canFinishDelivery: deliveryOwner && assignmentStatus === "completed" && ["draft", "correction", "waiting_signature"].includes(reportState),
  };
}

export function staffTaskOwnQuantity(task: StaffCompletionTask) {
  // The database contract is numeric(12,3). Normalising at that boundary
  // prevents JavaScript subtraction (for example 0.3 - 0.1) from sending a
  // value that fails the RPC's exact completed-quantity check.
  return Math.max(0, Math.round((task.quantity - task.transferred_quantity - task.withdrawn_quantity) * 1_000) / 1_000);
}

export function staffTaskIsChecked(task: StaffCompletionTask) {
  return task.execution_state === "completed";
}

export function staffTaskBlocksCompletion(task: StaffCompletionTask) {
  if (task.is_extra_work && task.extra_work_status === "rejected") return false;
  if (task.completed_at) return false;
  return task.transferred_quantity + task.withdrawn_quantity + quantityTolerance < task.quantity;
}

export function externalMapsUrl(destination: string) {
  const query = destination.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
