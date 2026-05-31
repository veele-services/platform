"use server";

import { createClient } from "@/lib/supabase/server";
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

export async function getMyPersonnel(): Promise<PersonnelProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("personnel")
    .select("id, first_name, last_name, email, phone, region, certificates, diplomas, knowledge, roles(name)")
    .eq("user_id", user.id)
    .single();

  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return {
    id: d.id,
    firstName: d.first_name,
    lastName: d.last_name,
    email: d.email,
    phone: d.phone ?? null,
    region: d.region ?? null,
    roleName: d.roles?.name ?? null,
    certificates: d.certificates ?? [],
    diplomas: d.diplomas ?? [],
    knowledge: d.knowledge ?? [],
  };
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
