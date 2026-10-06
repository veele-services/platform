"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { WorkOrderResult } from "./model";
const checklistLink = z.object({ orderId: z.uuid(), revisionId: z.uuid(), version: z.number().int().positive(), mutationId: z.uuid() }).strict();
export async function attachWorkOrderChecklist(input: z.input<typeof checklistLink>): Promise<WorkOrderResult> {
  try {
    const { tenant } = await getAuthContext();
    if (!tenant?.enabledServices.includes("planning") || !tenant.enabledServices.includes("rapportage") || !tenant.roles.some(role => ["tenant_admin", "management", "planner"].includes(role))) throw new Error("Geen checklistbeheer");
    const value = checklistLink.parse(input), db = await createClient();
    const { data, error } = await db.rpc("attach_work_order_checklist", { target_tenant: tenant.id, input: value });
    if (error) {
      return { ok: false, error: error.code === "40001" ? "De werkbon is intussen gewijzigd. Vernieuw het dossier en probeer opnieuw." : error.code === "23514" ? error.message : "Checklist toevoegen is niet gelukt. Controleer je toegang en probeer opnieuw." };
    }
    revalidatePath("/app", "layout"); revalidatePath("/staff", "layout"); revalidatePath("/klant", "layout");
    return data as unknown as WorkOrderResult;
  } catch { return { ok: false, error: "Checklist toevoegen is niet gelukt. Controleer je toegang en invoer." }; }
}
