"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  objectsTable,
  personnelTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type MyAssignment = {
  id: string;
  title: string;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: string;
  objectAddress: string | null;
  objectCity: string | null;
};

export type MyAssignmentDetail = MyAssignment & {
  description: string | null;
  tasks: { id: string; sortOrder: number; notes: string | null }[];
};

async function getMyPersonnelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row?.id ?? null;
}

export async function getMyAssignments(): Promise<MyAssignment[]> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return [];

  const rows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      status: assignmentsTable.status,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
    )
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(eq(assignmentPersonnelTable.personnelId, personnelId))
    .orderBy(desc(assignmentsTable.scheduledDate));

  return rows;
}

export async function getMyAssignment(
  id: string,
): Promise<MyAssignmentDetail | null> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return null;

  const [row] = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      status: assignmentsTable.status,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentPersonnelTable.personnelId, personnelId),
      ),
    )
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!row) return null;

  const tasks = await db
    .select({
      id: assignmentTasksTable.id,
      sortOrder: assignmentTasksTable.sortOrder,
      notes: assignmentTasksTable.notes,
    })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, id));

  return {
    ...row,
    description: row.description ?? null,
    tasks,
  };
}

export async function setAssignmentStatus(
  assignmentId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd" };

  const [assignment] = await db
    .select({ id: assignmentsTable.id, status: assignmentsTable.status })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentPersonnelTable.personnelId, personnelId),
      ),
    )
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, error: "Opdracht niet gevonden" };

  const TRANSITIONS: Record<string, string[]> = {
    plannable:  ["scheduled", "in_progress"],
    scheduled:  ["seen", "in_progress"],
    seen:       ["in_progress"],
    in_progress: ["completed", "not_completed"],
  };

  const allowed = TRANSITIONS[assignment.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { success: false, error: "Status-overgang niet toegestaan" };
  }

  await db
    .update(assignmentsTable)
    .set({ status: newStatus })
    .where(eq(assignmentsTable.id, assignmentId));

  revalidatePath("/opdrachten");
  revalidatePath(`/opdrachten/${assignmentId}`);

  return { success: true };
}
