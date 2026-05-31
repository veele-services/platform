"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { personnelTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type PersonnelProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  region: string | null;
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
      certificates: personnelTable.certificates,
      diplomas: personnelTable.diplomas,
      knowledge: personnelTable.knowledge,
    })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row ?? null;
}
