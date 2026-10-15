"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
import type { Json } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/result";
import { relatedCommandSchema, type RelatedContext } from "@/lib/work-orders/lineage";
import { recurrenceSchema } from "@/lib/work-orders/recurrence";

function failure(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message || "Controleer de verplichte gegevens." };
  const source = error as { code?: string; message?: string };
  return { ok: false, error: source.code === "23514" || source.code === "40001" ? source.message || "De gegevens zijn gewijzigd. Vernieuw eerst." : "Deze actie is niet beschikbaar. Controleer je toegang en probeer opnieuw." };
}

function refresh() {
  revalidatePath("/app", "layout");
  revalidatePath("/staff", "layout");
  revalidatePath("/klant", "layout");
}

export async function readWorkOrderRelated(orderId: string): Promise<ActionResult<{ data: RelatedContext }>> {
  try {
    const { db, tenant } = await getObjectActor();
    const result = await db.rpc("work_order_related_context", { target_tenant: tenant.id, target_order: z.uuid().parse(orderId) });
    if (result.error) throw result.error;
    return { ok: true, data: result.data as unknown as RelatedContext };
  } catch (error) { return failure(error); }
}

export async function createRelatedWorkOrder(command: "split" | "followup" | "duplicate", input: unknown, commandId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const data = relatedCommandSchema.parse(input);
    const { db, tenant } = await getObjectActor();
    const result = await db.rpc("work_order_related_command", { target_tenant: tenant.id, command_id: z.uuid().parse(commandId), command: z.enum(["split", "followup", "duplicate"]).parse(command), input: data as Json });
    if (result.error) throw result.error;
    refresh();
    return { ok: true, id: z.object({ id: z.uuid() }).parse(result.data).id };
  } catch (error) { return failure(error); }
}

export async function changeWorkOrderSeries(command: "create" | "update" | "generate" | "skip", input: Record<string, unknown>, commandId: string): Promise<ActionResult<{ data: Record<string, Json | undefined> }>> {
  try {
    const kind = z.enum(["create", "update", "generate", "skip"]).parse(command);
    const data: Record<string, Json | undefined> = {};
    if (kind === "create") data.orderId = z.uuid().parse(input.orderId);
    else data.seriesId = z.uuid().parse(input.seriesId);
    data.version = z.number().int().positive().parse(input.version);
    if (kind === "create" || kind === "update") {
      data.title = z.string().trim().min(2).max(180).parse(input.title);
      data.definition = recurrenceSchema.parse(input.definition);
      if (kind === "update") data.applyFuture = z.boolean().parse(input.applyFuture);
    }
    if (kind === "skip") {
      data.day = z.iso.date().parse(input.day);
      data.reason = z.string().trim().min(3).max(1000).parse(input.reason);
    }
    const { db, tenant } = await getObjectActor();
    const result = await db.rpc("work_order_series_command", { target_tenant: tenant.id, command_id: z.uuid().parse(commandId), command: kind, input: data });
    if (result.error) throw result.error;
    refresh(); return { ok: true, data: result.data as Record<string, Json | undefined> };
  } catch (error) { return failure(error); }
}

export async function recordWorkOrderMaterial(form: FormData): Promise<ActionResult> {
  try {
    const input: Record<string, Json> = z.object({
      orderId: z.uuid(), version: z.coerce.number().int().positive(),
      description: z.string().trim().min(2).max(300), quantity: z.coerce.number().positive().max(999999999),
      unit: z.string().trim().min(1).max(40), taskId: z.uuid().or(z.literal("")),
    }).parse(Object.fromEntries(form));
    input.customerVisible = form.get("customerVisible") === "on";
    for (const [field, key] of [["price", "unitPriceCents"], ["cost", "costCents"]]) {
      const value = form.get(field);
      if (typeof value === "string" && value !== "") input[key] = Math.round(z.coerce.number().min(0).max(100000000).parse(value) * 100);
    }
    const { db, tenant } = await getObjectActor();
    const result = await db.rpc("work_order_related_command", { target_tenant: tenant.id, command_id: z.uuid().parse(form.get("commandId")), command: "material", input });
    if (result.error) throw result.error;
    refresh(); return { ok: true };
  } catch (error) { return failure(error); }
}
