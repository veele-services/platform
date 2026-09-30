"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getPlanboard } from "@/lib/planning/data";
import type {
  PlanningQuery,
  PlanningResult,
  Proposal,
  PlanningOrder,
} from "@/lib/planning/model";

async function access() {
  const context = await getAuthContext();
  if (
    !context.tenant?.enabledServices.includes("planning") ||
    !context.tenant.roles.some((r) =>
      ["tenant_admin", "management", "planner"].includes(r),
    )
  )
    throw new Error("Geen toegang tot planning.");
  return context.tenant;
}
const querySchema = z.object({
  day: z.iso.date(),
  view: z.enum([
    "unassigned",
    "planned",
    "running",
    "completed",
    "cancelled",
    "all",
  ]),
  search: z.string().max(200),
  status: z.string().max(40),
  page: z.number().int().min(1).max(100000),
});
export async function loadPlanboard(input: PlanningQuery) {
  const tenant = await access();
  return getPlanboard(tenant.id, querySchema.parse(input));
}
export async function loadPlanboardOrder(id: string): Promise<PlanningOrder> {
  const tenant = await access();
  const db = await createClient();
  const result = await db.rpc("get_planboard_order", {
    target_tenant: tenant.id,
    target_order: z.uuid().parse(id),
  });
  if (result.error) throw new Error("Werkbon niet beschikbaar.");
  return result.data as unknown as PlanningOrder;
}
const instant = z.iso.datetime({ offset: true });
const proposalSchema = z.object({
  orderId: z.uuid(),
  version: z.number().int().positive(),
  mutationId: z.uuid(),
  start: instant.nullable(),
  end: instant.nullable(),
  assignments: z
    .array(z.object({ personnelId: z.uuid(), start: instant, end: instant }))
    .max(100),
  confirmedWarnings: z.array(z.string().max(200)).max(300),
  undoChange: z.uuid().optional(),
  appointment: z
    .object({
      requestedDate: z.iso.date().nullable(),
      windowKind: z.enum(["arrival", "execution", "unknown"]),
      requiredPersonnel: z.number().int().min(1).max(100),
      instructions: z.string().max(2000),
    })
    .optional(),
});
export async function savePlanning(raw: Proposal): Promise<PlanningResult> {
  try {
    const tenant = await access();
    const input = proposalSchema.parse(raw);
    const db = await createClient();
    const { data, error } = await db.rpc("change_work_order_planning", {
      target_tenant: tenant.id,
      target_work_order: input.orderId,
      expected_version: input.version,
      mutation_id: input.mutationId,
      target_start: input.start!,
      target_end: input.end!,
      target_assignments: input.assignments,
      confirmed_warnings: input.confirmedWarnings,
      undo_change: input.undoChange,
      appointment_data: input.appointment,
    });
    if (error)
      return {
        ok: false,
        code:
          error.code === "40001" || error.code === "40P01"
            ? "conflict"
            : "error",
        error: ["40001", "40P01"].includes(error.code)
          ? "De planning is intussen gewijzigd. Bekijk de actuele gegevens en kies opnieuw."
          : ["23514", "23P01"].includes(error.code)
            ? error.message
            : "De planning kon niet worden opgeslagen. Controleer je toegang en probeer opnieuw.",
      };
    const result = data as unknown as PlanningResult;
    if (result.ok) {
      revalidatePath("/app", "layout");
      revalidatePath("/staff");
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      code: "error",
      error:
        error instanceof z.ZodError
          ? "Controleer de datum, tijden en medewerkers."
          : "Opslaan is niet gelukt. De bestaande planning blijft behouden.",
    };
  }
}
