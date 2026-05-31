"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type PersonnelProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  region: string | null;
  roleName: string | null;
  certificates: string[];
  diplomas: string[];
  knowledge: string[];
};

const PERSONNEL_SELECT =
  "id, first_name, last_name, email, phone, region, certificates, diplomas, knowledge, roles(name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfile(d: any): PersonnelProfile {
  return {
    id:           d.id,
    firstName:    d.first_name,
    lastName:     d.last_name,
    email:        d.email,
    phone:        d.phone ?? null,
    region:       d.region ?? null,
    roleName:     d.roles?.name ?? null,
    certificates: d.certificates ?? [],
    diplomas:     d.diplomas ?? [],
    knowledge:    d.knowledge ?? [],
  };
}

export async function getMyPersonnel(): Promise<PersonnelProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // ── Primary lookup: by user_id (RLS-filtered) ─────────────────────────────
  const { data: byId } = await supabase
    .from("personnel")
    .select(PERSONNEL_SELECT)
    .eq("user_id", user.id)
    .single();

  if (byId) return mapProfile(byId);

  // ── First-login account-linking ───────────────────────────────────────────
  // The employee was invited (invite_sent_at set) but user_id is still null
  // in our DB because we don't set it at invite time. On first successful login
  // we find their personnel record by email and link it.
  const admin = createAdminClient();
  const { data: byEmail } = await admin
    .from("personnel")
    .select("id, user_id")
    .eq("email", user.email!)
    .is("user_id", null)
    .single();

  if (!byEmail) return null;

  // Link the Supabase user to the personnel record.
  const { error: linkError } = await admin
    .from("personnel")
    .update({ user_id: user.id })
    .eq("id", byEmail.id);

  if (linkError) return null;

  // Fetch via RLS-filtered client now that user_id is set.
  const { data: linked } = await supabase
    .from("personnel")
    .select(PERSONNEL_SELECT)
    .eq("user_id", user.id)
    .single();

  return linked ? mapProfile(linked) : null;
}

export async function updateMyPhone(
  phone: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const cleaned = phone.trim();
  if (cleaned.length > 0 && !/^\+?[\d\s\-().]{7,20}$/.test(cleaned)) {
    return { success: false, error: "Ongeldig telefoonnummer" };
  }

  const { error } = await supabase
    .from("personnel")
    .update({ phone: cleaned || null })
    .eq("user_id", user.id);

  if (error) return { success: false, error: "Opslaan mislukt" };

  revalidatePath("/profiel");
  return { success: true };
}
