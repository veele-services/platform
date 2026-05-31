"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { leavePeriodsTable, personnelTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type LeavePeriod = {
  id: string;
  startDate: string;
  endDate: string | null;
  leaveType: string;
  reason: string | null;
  status: string;
  createdAt: Date;
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

export async function getMyLeavePeriods(): Promise<LeavePeriod[]> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return [];

  const rows = await db
    .select({
      id: leavePeriodsTable.id,
      startDate: leavePeriodsTable.startDate,
      endDate: leavePeriodsTable.endDate,
      leaveType: leavePeriodsTable.leaveType,
      reason: leavePeriodsTable.reason,
      status: leavePeriodsTable.status,
      createdAt: leavePeriodsTable.createdAt,
    })
    .from(leavePeriodsTable)
    .where(eq(leavePeriodsTable.personnelId, personnelId))
    .orderBy(desc(leavePeriodsTable.createdAt));

  return rows;
}

export async function requestLeave(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd" };

  const startDate = formData.get("startDate") as string;
  const endDate = (formData.get("endDate") as string) || null;
  const leaveType = formData.get("leaveType") as string;
  const reason = (formData.get("reason") as string) || null;

  if (!startDate || !leaveType) {
    return { success: false, error: "Vul alle verplichte velden in" };
  }

  await db.insert(leavePeriodsTable).values({
    personnelId,
    startDate,
    endDate,
    leaveType: leaveType as "vakantie" | "ziekte" | "overig",
    reason,
    status: "pending",
    createdBy: personnelId,
  });

  revalidatePath("/verlof");
  return { success: true };
}
