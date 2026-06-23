"use server";

import { db } from "@workspace/db";
import { reportsTable, assignmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getMyCustomerIdentity } from "./customer";

export type CustomerReport = {
  id:              string;
  assignmentId:    string;
  assignmentTitle: string;
  submittedAt:     string;
  hoursWorked:     string | null;
  /** Customer-visible report body. Internal review notes are never exposed here. */
  customerVisibleSummary: string;
};

/**
 * Returns all approved reports for assignments belonging to the logged-in customer.
 * Filters strictly by: status = 'approved' AND assignment.customer_id = caller's customer ID.
 * Draft / submitted / rejected reports are never returned.
 */
export async function getMyReports(): Promise<CustomerReport[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const rows = await db
    .select({
      id:              reportsTable.id,
      assignmentId:    reportsTable.assignmentId,
      assignmentTitle: assignmentsTable.title,
      submittedAt:     reportsTable.submittedAt,
      hoursWorked:     reportsTable.hoursWorked,
      customerVisibleSummary: reportsTable.content,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(reportsTable.status, "approved"),
      ),
    )
    .orderBy(desc(reportsTable.submittedAt));

  return rows.map((r) => ({
    id:              r.id,
    assignmentId:    r.assignmentId,
    assignmentTitle: r.assignmentTitle,
    submittedAt:     r.submittedAt.toISOString(),
    hoursWorked:     r.hoursWorked ?? null,
    customerVisibleSummary: r.customerVisibleSummary,
  }));
}
