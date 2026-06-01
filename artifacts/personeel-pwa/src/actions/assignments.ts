"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type MyAssignment = {
  id:               string;
  code:             string;
  title:            string;
  scheduledDate:    string | null;
  scheduledStart:   string | null;
  scheduledEnd:     string | null;
  status:           string;
  customerName:     string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  objectPostalCode: string | null;
};

export type MyAssignmentDetail = MyAssignment & {
  description: string | null;
  tasks: { id: string; sortOrder: number; notes: string | null }[];
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

export async function getMyAssignments(): Promise<MyAssignment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return [];

  const { data } = await supabase
    .from("assignment_personnel")
    .select(`
      assignments!inner(
        id, code, title, scheduled_date, scheduled_start, scheduled_end, status,
        customers(name),
        objects(address, city, postal_code)
      )
    `)
    .eq("personnel_id", personnelId)
    .eq("status", "assigned");

  if (!data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map((row) => {
      const a = row.assignments;
      return {
        id:               a.id,
        code:             a.code ?? "",
        title:            a.title,
        scheduledDate:    a.scheduled_date ?? null,
        scheduledStart:   a.scheduled_start ?? null,
        scheduledEnd:     a.scheduled_end ?? null,
        status:           a.status,
        customerName:     a.customers?.name ?? null,
        objectAddress:    a.objects?.address ?? null,
        objectCity:       a.objects?.city ?? null,
        objectPostalCode: a.objects?.postal_code ?? null,
      } as MyAssignment;
    })
    .sort((a, b) => {
      // Upcoming first, then descending
      const today = new Date().toISOString().slice(0, 10);
      const aFuture = (a.scheduledDate ?? "") >= today;
      const bFuture = (b.scheduledDate ?? "") >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");
      return (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? "");
    });
}

export async function getMyAssignment(id: string): Promise<MyAssignmentDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return null;

  const { data } = await supabase
    .from("assignment_personnel")
    .select(`
      assignments!inner(
        id, code, title, description, scheduled_date, scheduled_start, scheduled_end, status,
        customers(name),
        objects(address, city, postal_code),
        assignment_tasks(id, sort_order, notes)
      )
    `)
    .eq("personnel_id", personnelId)
    .eq("assignment_id", id)
    .eq("status", "assigned")
    .single();

  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (data as any).assignments;
  if (!a) return null;

  return {
    id:               a.id,
    code:             a.code ?? "",
    title:            a.title,
    description:      a.description ?? null,
    scheduledDate:    a.scheduled_date ?? null,
    scheduledStart:   a.scheduled_start ?? null,
    scheduledEnd:     a.scheduled_end ?? null,
    status:           a.status,
    customerName:     a.customers?.name ?? null,
    objectAddress:    a.objects?.address ?? null,
    objectCity:       a.objects?.city ?? null,
    objectPostalCode: a.objects?.postal_code ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tasks: (a.assignment_tasks ?? []).map((t: any) => ({
      id:        t.id,
      sortOrder: t.sort_order,
      notes:     t.notes ?? null,
    })),
  };
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  plannable:   ["scheduled", "in_progress"],
  scheduled:   ["seen", "in_progress"],
  seen:        ["in_progress"],
  in_progress: ["completed", "not_completed"],
};

export async function setAssignmentStatus(
  assignmentId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const { data: ap } = await supabase
    .from("assignment_personnel")
    .select("assignments!inner(id, status)")
    .eq("personnel_id", personnelId)
    .eq("assignment_id", assignmentId)
    .eq("status", "assigned")
    .single();

  if (!ap) return { success: false, error: "Opdracht niet gevonden of nog niet bevestigd door de planner" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentStatus: string = (ap as any).assignments?.status ?? "";
  const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return { success: false, error: "Status-overgang niet toegestaan" };
  }

  const { data: rpcResult, error } = await supabase.rpc(
    "pwa_set_assignment_status",
    { p_assignment_id: assignmentId, p_new_status: newStatus },
  );

  if (error) return { success: false, error: "Bijwerken mislukt" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = rpcResult as any;
  if (!result?.success) {
    return { success: false, error: result?.error ?? "Bijwerken mislukt" };
  }

  revalidatePath("/opdrachten");
  revalidatePath(`/opdrachten/${assignmentId}`);
  return { success: true };
}
