import { db } from "@workspace/db";
import {
  assignmentExtraWorkTable,
  assignmentInventoryItemsTable,
  assignmentMaterialUsageTable,
  assignmentsTable,
  assignmentTasksTable,
  auditLogTable,
  inventoryItemsTable,
  invoicesTable,
  taskCodesTable,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";

export type InvoiceProposalLineItem = {
  category: "task" | "extra_work" | "material" | "inventory";
  taskCodeCode: string | null;
  taskCodeName: string | null;
  description: string;
  quantity: string;
  unitPrice: string | null;
  price: string | null;
  invoiceable: boolean;
};

export type InvoiceProposalTotals = {
  amount: string;
  vatPercentage: string;
  vatAmount: string;
  totalAmount: string;
};

export type InvoiceProposalData = InvoiceProposalTotals & {
  lineItems: InvoiceProposalLineItem[];
  taskSubtotal: string;
  extraWorkSubtotal: string;
  materialSubtotal: string;
  inventorySubtotal: string;
};

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildTotals(amount: number, vatPercentage = 21): InvoiceProposalTotals {
  const vatAmount = amount * (vatPercentage / 100);

  return {
    amount:        money(amount),
    vatPercentage: money(vatPercentage),
    vatAmount:     money(vatAmount),
    totalAmount:   money(amount + vatAmount),
  };
}

function inventoryUsageLabel(value: string | null | undefined): string {
  if (value === "rented") return "Verhuur";
  if (value === "issued") return "Uitgegeven";
  if (value === "returned") return "Retour";
  if (value === "defect_found") return "Defect geconstateerd";
  return "Gebruikt";
}

export async function calculateInvoiceProposalForAssignment(
  assignmentId: string,
  vatPercentage = 21,
): Promise<InvoiceProposalData> {
  const [taskRows, extraWorkRows, materialRows, inventoryRows] = await Promise.all([
    db
      .select({
        snapshotCode:        assignmentTasksTable.taskCodeCode,
        snapshotName:        assignmentTasksTable.taskCodeName,
        snapshotPrice:       assignmentTasksTable.taskCodePrice,
        snapshotInvoiceable: assignmentTasksTable.taskCodeInvoiceable,
        code:                taskCodesTable.code,
        name:                taskCodesTable.name,
        price:               taskCodesTable.price,
        invoiceable:         taskCodesTable.invoiceable,
      })
      .from(assignmentTasksTable)
      .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
      .where(eq(assignmentTasksTable.assignmentId, assignmentId))
      .orderBy(asc(assignmentTasksTable.sortOrder)),

    db
      .select({
        code:         taskCodesTable.code,
        taskCodeName: assignmentExtraWorkTable.taskCodeName,
        description:  assignmentExtraWorkTable.description,
        hours:        assignmentExtraWorkTable.hours,
        price:        assignmentExtraWorkTable.price,
      })
      .from(assignmentExtraWorkTable)
      .leftJoin(taskCodesTable, eq(assignmentExtraWorkTable.taskCodeId, taskCodesTable.id))
      .where(eq(assignmentExtraWorkTable.assignmentId, assignmentId))
      .orderBy(asc(assignmentExtraWorkTable.createdAt)),

    db
      .select({
        materialCode: assignmentMaterialUsageTable.materialCodeSnapshot,
        name:         assignmentMaterialUsageTable.approvedName,
        quantity:     assignmentMaterialUsageTable.approvedQuantity,
        unitPrice:    assignmentMaterialUsageTable.approvedUnitPrice,
        unitLabel:    assignmentMaterialUsageTable.approvedUnitLabel,
        invoiceable:  assignmentMaterialUsageTable.invoiceable,
      })
      .from(assignmentMaterialUsageTable)
      .where(
        and(
          eq(assignmentMaterialUsageTable.assignmentId, assignmentId),
          eq(assignmentMaterialUsageTable.approvalStatus, "approved"),
          eq(assignmentMaterialUsageTable.invoiceable, true),
        ),
      )
      .orderBy(asc(assignmentMaterialUsageTable.createdAt)),

    db
      .select({
        inventoryCode: inventoryItemsTable.code,
        name:          inventoryItemsTable.name,
        usageType:     assignmentInventoryItemsTable.usageType,
        quantity:      assignmentInventoryItemsTable.approvedQuantity,
        unitPrice:     assignmentInventoryItemsTable.approvedUnitPrice,
        periodLabel:   assignmentInventoryItemsTable.registeredPeriodLabel,
        invoiceable:   assignmentInventoryItemsTable.invoiceable,
      })
      .from(assignmentInventoryItemsTable)
      .innerJoin(
        inventoryItemsTable,
        eq(assignmentInventoryItemsTable.inventoryItemId, inventoryItemsTable.id),
      )
      .where(
        and(
          eq(assignmentInventoryItemsTable.assignmentId, assignmentId),
          eq(assignmentInventoryItemsTable.approvalStatus, "approved"),
          eq(assignmentInventoryItemsTable.invoiceable, true),
        ),
      )
      .orderBy(asc(assignmentInventoryItemsTable.attachedAt)),
  ]);

  const taskItems: InvoiceProposalLineItem[] = taskRows.map((row) => {
    const invoiceable = row.snapshotInvoiceable ?? row.invoiceable ?? false;
    const code = row.snapshotCode ?? row.code ?? null;
    const name = row.snapshotName ?? row.name ?? null;
    const price = invoiceable ? money(parseMoney(row.snapshotPrice ?? row.price)) : null;

    return {
      category:     "task",
      taskCodeCode: code,
      taskCodeName: name,
      description:  name ?? "Taak zonder taakcode",
      quantity:     "1",
      unitPrice:    price,
      price,
      invoiceable,
    };
  });

  const extraWorkItems: InvoiceProposalLineItem[] = extraWorkRows.map((row) => {
    const price = money(parseMoney(row.price));

    return {
      category:     "extra_work",
      taskCodeCode: row.code ?? null,
      taskCodeName: row.taskCodeName ?? row.description,
      description:  row.description,
      quantity:     row.hours ?? "1",
      unitPrice:    row.hours ? money(parseMoney(row.price) / Math.max(parseMoney(row.hours), 1)) : price,
      price,
      invoiceable:  parseMoney(row.price) > 0,
    };
  });

  const materialItems: InvoiceProposalLineItem[] = materialRows.map((row) => {
    const quantity = parseMoney(row.quantity);
    const unitPrice = parseMoney(row.unitPrice);
    const price = money(quantity * unitPrice);
    const unitLabel = row.unitLabel ? ` (${row.unitLabel})` : "";

    return {
      category:     "material",
      taskCodeCode: row.materialCode ?? null,
      taskCodeName: row.name ?? "Materiaal",
      description:  `${row.name ?? "Materiaal"}${unitLabel}`,
      quantity:     row.quantity ?? "1",
      unitPrice:    money(unitPrice),
      price,
      invoiceable:  row.invoiceable,
    };
  });

  const inventoryItems: InvoiceProposalLineItem[] = inventoryRows.map((row) => {
    const quantity = parseMoney(row.quantity);
    const unitPrice = parseMoney(row.unitPrice);
    const price = money(quantity * unitPrice);
    const usage = inventoryUsageLabel(row.usageType);
    const period = row.periodLabel ? ` (${row.periodLabel})` : "";

    return {
      category:     "inventory",
      taskCodeCode: row.inventoryCode ?? null,
      taskCodeName: row.name ?? "Inventaris",
      description:  `${row.name ?? "Inventaris"} - ${usage}${period}`,
      quantity:     row.quantity ?? "1",
      unitPrice:    money(unitPrice),
      price,
      invoiceable:  row.invoiceable,
    };
  });

  const lineItems = [...taskItems, ...extraWorkItems, ...materialItems, ...inventoryItems];
  const taskSubtotal = taskItems.reduce((sum, item) => sum + (item.invoiceable ? parseMoney(item.price) : 0), 0);
  const extraWorkSubtotal = extraWorkItems.reduce((sum, item) => sum + (item.invoiceable ? parseMoney(item.price) : 0), 0);
  const materialSubtotal = materialItems.reduce((sum, item) => sum + (item.invoiceable ? parseMoney(item.price) : 0), 0);
  const inventorySubtotal = inventoryItems.reduce((sum, item) => sum + (item.invoiceable ? parseMoney(item.price) : 0), 0);
  const totals = buildTotals(
    taskSubtotal + extraWorkSubtotal + materialSubtotal + inventorySubtotal,
    vatPercentage,
  );

  return {
    ...totals,
    lineItems,
    taskSubtotal:      money(taskSubtotal),
    extraWorkSubtotal: money(extraWorkSubtotal),
    materialSubtotal:  money(materialSubtotal),
    inventorySubtotal: money(inventorySubtotal),
  };
}

export async function createInvoiceProposalForAssignment(input: {
  assignmentId: string;
  actorUserId: string;
  source: "report_approval" | "manual";
}): Promise<{ id: string; created: boolean; totals: InvoiceProposalTotals }> {
  const [assignment] = await db
    .select({
      status:     assignmentsTable.status,
      customerId: assignmentsTable.customerId,
      code:       assignmentsTable.code,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, input.assignmentId))
    .limit(1);

  if (!assignment) {
    throw new Error("Opdracht niet gevonden.");
  }

  const [existing] = await db
    .select({
      id:            invoicesTable.id,
      amount:        invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount:     invoicesTable.vatAmount,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.assignmentId, input.assignmentId),
        inArray(invoicesTable.status, ["draft", "sent", "paid"]),
      ),
    )
    .limit(1);

  if (existing) {
    if (assignment.status !== "invoice_ready") {
      await db
        .update(assignmentsTable)
        .set({ status: "invoice_ready", updatedAt: new Date() })
        .where(eq(assignmentsTable.id, input.assignmentId));
    }

    return {
      id: existing.id,
      created: false,
      totals: {
        amount:        existing.amount ?? "0.00",
        vatPercentage: existing.vatPercentage ?? "21.00",
        vatAmount:     existing.vatAmount ?? "0.00",
        totalAmount:   existing.totalAmount ?? "0.00",
      },
    };
  }

  const currentStatus = assignment.status as AssignmentStatus;
  const allowedNext = ASSIGNMENT_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (currentStatus !== "invoice_ready" && !allowedNext.includes("invoice_ready")) {
    throw new Error(`Factuurvoorstel aanmaken is niet mogelijk vanuit status "${currentStatus}".`);
  }

  const proposal = await calculateInvoiceProposalForAssignment(input.assignmentId);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const [created] = await db
    .insert(invoicesTable)
    .values({
      customerId:     assignment.customerId,
      assignmentId:   input.assignmentId,
      amount:         proposal.amount,
      vatPercentage:  proposal.vatPercentage,
      vatAmount:      proposal.vatAmount,
      totalAmount:    proposal.totalAmount,
      status:         "draft",
      dueDate:        dueDate.toISOString().slice(0, 10),
      notes:          [
        "Automatisch factuurvoorstel na rapportgoedkeuring.",
        `Taken: EUR ${proposal.taskSubtotal}`,
        `Meerwerk: EUR ${proposal.extraWorkSubtotal}`,
        `Materiaal/verbruik: EUR ${proposal.materialSubtotal}`,
        `Inventaris/verhuur: EUR ${proposal.inventorySubtotal}`,
      ].join("\n"),
      createdBy:      input.actorUserId,
    })
    .returning({ id: invoicesTable.id });

  if (!created) {
    throw new Error("Factuurvoorstel aanmaken mislukt.");
  }

  await db
    .update(assignmentsTable)
    .set({ status: "invoice_ready", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, input.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     input.actorUserId,
    action:     "create_invoice_proposal",
    resource:   "invoices",
    resourceId: created.id,
    metadata: {
      assignmentId:       input.assignmentId,
      assignmentCode:     assignment.code,
      source:             input.source,
      amount:             proposal.amount,
      vatAmount:          proposal.vatAmount,
      totalAmount:        proposal.totalAmount,
      taskSubtotal:       proposal.taskSubtotal,
      extraWorkSubtotal:  proposal.extraWorkSubtotal,
      materialSubtotal:   proposal.materialSubtotal,
      inventorySubtotal:  proposal.inventorySubtotal,
      administrativeGate: "draft_requires_review",
      materialGate:       "approved_invoiceable_only",
      inventoryGate:      "approved_invoiceable_only",
    },
  });

  return { id: created.id, created: true, totals: proposal };
}
