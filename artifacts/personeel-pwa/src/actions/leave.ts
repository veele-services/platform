"use server";

import { db } from "@workspace/db";
import { organizationSettingsTable, personnelTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendEmail, buildLeaveRequestedEmail } from "@/lib/email";

export type LeavePeriod = {
  id: string;
  startDate: string;
  endDate: string | null;
  leaveType: string;
  reason: string | null;
  status: string;
  createdAt: Date;
};

async function getPersonnelId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("personnel")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data?.id ?? null;
}

export async function getMyLeavePeriods(): Promise<LeavePeriod[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return [];

  const { data } = await supabase
    .from("leave_periods")
    .select("id, start_date, end_date, leave_type, reason, status, created_at")
    .eq("personnel_id", personnelId)
    .order("created_at", { ascending: false });

  if (!data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date ?? null,
    leaveType: r.leave_type,
    reason: r.reason ?? null,
    status: r.status ?? "pending",
    createdAt: new Date(r.created_at),
  }));
}

export async function requestLeave(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const startDate = formData.get("startDate") as string;
  const endDate = (formData.get("endDate") as string) || null;
  const leaveType = formData.get("leaveType") as string;
  const reason = (formData.get("reason") as string) || null;

  if (!startDate || !leaveType) {
    return { success: false, error: "Vul alle verplichte velden in" };
  }

  const { error } = await supabase
    .from("leave_periods")
    .insert({
      personnel_id: personnelId,
      start_date: startDate,
      end_date: endDate,
      leave_type: leaveType as "vakantie" | "ziekte" | "overig",
      reason,
      status: "pending",
      created_by: personnelId,
    });

  if (error) return { success: false, error: "Aanvraag mislukt" };

  // Notify org admin — fire-and-forget
  void (async () => {
    const [orgSettings] = await db
      .select({ emailAfzender: organizationSettingsTable.emailAfzender })
      .from(organizationSettingsTable)
      .limit(1);
    if (orgSettings?.emailAfzender) {
      const [person] = await db
        .select({ firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(eq(personnelTable.id, personnelId))
        .limit(1);
      const { subject, html } = buildLeaveRequestedEmail({
        personnelName: `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim(),
        startDate,
        endDate:       endDate ?? null,
        leaveType,
        reason:        reason ?? null,
      });
      await sendEmail({ to: orgSettings.emailAfzender, subject, html });
    }
  })();

  revalidatePath("/verlof");
  return { success: true };
}
