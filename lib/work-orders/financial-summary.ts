import type { WorkOrderDossier } from "./model";
export const financialMoney = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
export function agreedTaskAmount(task: WorkOrderDossier["tasks"][number], quantity: number) {
  const snapshot = task.commercial_snapshot as { quote_id?: string; line?: { net_cents?: number; quantity?: number } } | undefined;
  const line = snapshot?.line;
  return snapshot?.quote_id && typeof line?.net_cents === "number" && typeof line.quantity === "number" && line.quantity > 0
    ? Math.round(quantity * line.net_cents / line.quantity)
    : Math.round((task.unit_price_cents ?? 0) * quantity);
}
export function orderFinancialSummary(data: Pick<WorkOrderDossier, "tasks" | "financial">) {
  const taskPrice = agreedTaskAmount;
  const originalCents = data.tasks.filter(task => !task.is_extra_work).reduce((sum, task) => sum + taskPrice(task, task.quantity), 0);
  const approvedExtraCents = data.tasks.filter(task => task.is_extra_work && task.extra_work_status === "approved").reduce((sum, task) => sum + taskPrice(task, task.executed_quantity ?? (task.completed_at ? task.quantity : 0)), 0);
  const proposedExtraCents = data.tasks.filter(task => task.is_extra_work && !["approved", "rejected"].includes(task.extra_work_status ?? "")).reduce((sum, task) => sum + taskPrice(task, task.quantity), 0);
  const materials = data.financial?.materials ?? [], expenses = data.financial?.expenses ?? [];
  const materialCents = materials.filter(item => item.customerVisible && item.unitPriceCents != null).reduce((sum, item) => sum + Math.round(item.quantity * item.unitPriceCents!), 0);
  const expenseCents = expenses.filter(item => item.customerVisible).reduce((sum, item) => sum + item.amountCents, 0);
  return { originalCents, approvedExtraCents, proposedExtraCents, materialCents, expenseCents,
    totalCents: originalCents + approvedExtraCents + materialCents + expenseCents,
    unpricedMaterials: materials.filter(item => item.customerVisible && item.unitPriceCents == null).length,
    issuedCents: (data.financial?.invoices ?? []).filter(invoice => invoice.status !== "draft").reduce((sum, invoice) => sum + (invoice.orderTotalCents ?? invoice.totalCents), 0),
  };
}
