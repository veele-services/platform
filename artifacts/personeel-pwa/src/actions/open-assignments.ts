"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type OpenAssignment = {
  id:               string;
  title:            string;
  scheduledDate:    string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  isAlreadyApplied: boolean;
};

/**
 * List plannable assignments the current personnel member can apply for.
 * Shows all active plannable assignments; marks ones already applied for.
 * Region/sector filtering requires a sector field on assignments (future schema
 * enhancement) — currently shows all plannable assignments.
 */
export async function getOpenAssignments(): Promise<OpenAssignment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: personnel } = await supabase
    .from("personnel")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!personnel) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnelId = (personnel as any).id as string;

  const [{ data: assignments }, { data: myLinks }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, scheduled_date, objects(address, city)")
      .eq("status", "plannable")
      .eq("is_active", true)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("assignment_personnel")
      .select("assignment_id")
      .eq("personnel_id", personnelId),
  ]);

  const myIds = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (myLinks ?? []).map((l: any) => l.assignment_id as string),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (assignments ?? []).map((a: any) => ({
    id:               a.id,
    title:            a.title,
    scheduledDate:    a.scheduled_date ?? null,
    objectAddress:    a.objects?.address ?? null,
    objectCity:       a.objects?.city ?? null,
    isAlreadyApplied: myIds.has(a.id),
  }));
}

/**
 * Apply for an open (plannable) assignment. Inserts a row in assignment_personnel.
 * The unique constraint prevents duplicate applications.
 */
export async function applyForAssignment(
  assignmentId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const { data: personnel } = await supabase
    .from("personnel")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!personnel) return { success: false, error: "Personeelsprofiel niet gevonden" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnelId = (personnel as any).id as string;

  // Verify assignment is still plannable
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .eq("status", "plannable")
    .single();

  if (!assignment) return { success: false, error: "Opdracht is niet meer beschikbaar" };

  const { error } = await supabase
    .from("assignment_personnel")
    .insert({ assignment_id: assignmentId, personnel_id: personnelId });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "U heeft zich al aangemeld voor deze opdracht" };
    }
    return { success: false, error: "Aanmelden mislukt" };
  }

  revalidatePath("/openstaand");
  revalidatePath("/opdrachten");
  return { success: true };
}
