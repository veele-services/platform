"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { personnelTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  const [row] = await db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      email: personnelTable.email,
      phone: personnelTable.phone,
      region: personnelTable.region,
      roleName: rolesTable.name,
      certificates: personnelTable.certificates,
      diplomas: personnelTable.diplomas,
      knowledge: personnelTable.knowledge,
    })
    .from(personnelTable)
    .leftJoin(rolesTable, eq(rolesTable.id, personnelTable.roleId))
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row ?? null;
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

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!row) return { success: false, error: "Personeelsprofiel niet gevonden" };

  await db
    .update(personnelTable)
    .set({ phone: cleaned || null })
    .where(eq(personnelTable.id, row.id));

  revalidatePath("/profiel");
  return { success: true };
}
