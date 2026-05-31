"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  objectsTable,
  insertAssignmentSchema,
  type AssignmentStatus,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { getMyCustomerId } from "./customer";
import { createClient } from "@/lib/supabase/server";

export type CustomerAssignment = {
  id:             string;
  code:           string;
  title:          string;
  status:         AssignmentStatus;
  scheduledDate:  string | null;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  objectName:     string | null;
  objectAddress:  string | null;
  objectCity:     string | null;
  createdAt:      string;
};

export async function getMyAssignments(): Promise<CustomerAssignment[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  const rows = await db
    .select({
      id:             assignmentsTable.id,
      code:           assignmentsTable.code,
      title:          assignmentsTable.title,
      status:         assignmentsTable.status,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      createdAt:      assignmentsTable.createdAt,
      objectName:     objectsTable.name,
      objectAddress:  objectsTable.address,
      objectCity:     objectsTable.city,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentsTable.customerId, customerId))
    .orderBy(desc(assignmentsTable.createdAt));

  return rows.map((r) => ({
    id:             r.id,
    code:           r.code,
    title:          r.title,
    status:         r.status as AssignmentStatus,
    scheduledDate:  r.scheduledDate,
    scheduledStart: r.scheduledStart,
    scheduledEnd:   r.scheduledEnd,
    objectName:     r.objectName ?? null,
    objectAddress:  r.objectAddress ?? null,
    objectCity:     r.objectCity ?? null,
    createdAt:      r.createdAt.toISOString(),
  }));
}

export type RequestResult =
  | { success: true;  id: string }
  | { success: false; message: string };

const requestSchema = z.object({
  title:       z.string().min(2, "Titel is verplicht").max(255),
  description: z.string().min(5, "Omschrijving is verplicht").max(5000),
  objectId:    z.string().uuid().optional(),
  priority:    z.enum(["low", "normal", "high", "urgent"]),
});

export type RequestAssignmentInput = z.infer<typeof requestSchema>;

export async function requestAssignment(input: RequestAssignmentInput): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden voor dit account." };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, message: first?.message ?? "Ongeldig verzoek." };
  }

  const { title, description, objectId, priority } = parsed.data;

  // Ownership check: verify the selected object belongs to this customer.
  // This prevents IDOR — a customer submitting another customer's objectId.
  if (objectId) {
    const [owned] = await db
      .select({ id: objectsTable.id })
      .from(objectsTable)
      .where(
        and(
          eq(objectsTable.id, objectId),
          eq(objectsTable.customerId, customerId),
        ),
      )
      .limit(1);
    if (!owned) return { success: false, message: "Object niet gevonden of niet toegankelijk." };
  }

  const validatedData = insertAssignmentSchema.parse({
    title,
    description,
    customerId,
    objectId:   objectId ?? null,
    status:     "requested",
    priority,
    createdBy:  user.id,
  });

  const [inserted] = await db
    .insert(assignmentsTable)
    .values(validatedData)
    .returning({ id: assignmentsTable.id });

  if (!inserted) return { success: false, message: "Aanmaken mislukt." };

  return { success: true, id: inserted.id };
}

// ─── Quote approval workflow ──────────────────────────────────────────────────

/**
 * Customer approves a quote (assignment in `awaiting_approval` state).
 * Enforces customer ownership — only the assignment's own customer may approve.
 */
export async function approveQuote(assignmentId: string): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.customerId, customerId),
        eq(assignmentsTable.status, "awaiting_approval"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }

  await db
    .update(assignmentsTable)
    .set({ status: "approved" })
    .where(eq(assignmentsTable.id, assignmentId));

  revalidatePath("/klant/opdrachten");
  return { success: true, id: assignmentId };
}

/**
 * Customer rejects a quote (assignment in `awaiting_approval` state).
 * Enforces customer ownership — only the assignment's own customer may reject.
 */
export async function rejectQuote(assignmentId: string): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.customerId, customerId),
        eq(assignmentsTable.status, "awaiting_approval"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }

  // Move back to "review" — the valid lifecycle transition from awaiting_approval
  // when the customer does not accept. "rejected" is not a canonical status.
  // This returns the assignment to the backoffice for re-evaluation or cancellation.
  await db
    .update(assignmentsTable)
    .set({ status: "review" })
    .where(eq(assignmentsTable.id, assignmentId));

  revalidatePath("/klant/opdrachten");
  return { success: true, id: assignmentId };
}
