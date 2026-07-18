"use server";

import { db } from "@workspace/db";
import { reportsTable, assignmentsTable, objectsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getMyCustomerIdentity } from "./customer";

export type CustomerReport = {
  id:              string;
  assignmentId:    string;
  assignmentCode:  string;
  assignmentTitle: string;
  objectId:        string | null;
  objectName:      string | null;
  submittedAt:     string;
  hoursWorked:     string | null;
  /** Customer-visible report body. Internal review notes are never exposed here. */
  customerVisibleSummary: string;
};

/**
 * Returns all approved reports for assignments belonging to the logged-in customer.
 * Filters strictly by approved customer visibility and caller customer/tenant.
 * Draft / submitted / rejected reports are never returned.
 */
export async function getMyReports(): Promise<CustomerReport[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const rows = await db
    .select({
      id:              reportsTable.id,
      assignmentId:    reportsTable.assignmentId,
      assignmentCode:  assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      objectId:        assignmentsTable.objectId,
      objectName:      objectsTable.name,
      submittedAt:     reportsTable.submittedAt,
      hoursWorked:     reportsTable.hoursWorked,
      customerVisibleSummary: reportsTable.content,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(reportsTable.status, "approved"),
        eq(reportsTable.visibilityScope, "customer_approved"),
      ),
    )
    .orderBy(desc(reportsTable.submittedAt));

  return rows.map((r) => ({
    id:              r.id,
    assignmentId:    r.assignmentId,
    assignmentCode:  r.assignmentCode,
    assignmentTitle: r.assignmentTitle,
    objectId:        r.objectId ?? null,
    objectName:      r.objectName ?? null,
    submittedAt:     r.submittedAt.toISOString(),
    hoursWorked:     r.hoursWorked ?? null,
    customerVisibleSummary: r.customerVisibleSummary,
  }));
}
