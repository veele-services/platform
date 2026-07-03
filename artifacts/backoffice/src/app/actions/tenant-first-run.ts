"use server";

import { db, tenantFirstRunStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

const DEFAULT_FIRST_RUN_STEPS = ["branding", "users", "sectors", "modules"] as const;

export type TenantFirstRunStep = (typeof DEFAULT_FIRST_RUN_STEPS)[number];

export type TenantFirstRunStateRow = {
  tenantId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  requiredSteps: string[];
  completedSteps: string[];
  completedAt: string | null;
  updatedAt: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeStep(value: string): TenantFirstRunStep | null {
  return DEFAULT_FIRST_RUN_STEPS.includes(value as TenantFirstRunStep) ? (value as TenantFirstRunStep) : null;
}

function revalidateFirstRun(): void {
  revalidatePath("/first-run");
  revalidatePath("/instellingen/organisatie");
  revalidatePath("/instellingen/gebruikers");
  revalidatePath("/instellingen/sectoren");
}

async function ensureTenantFirstRunState(tenantId: string) {
  await db
    .insert(tenantFirstRunStateTable)
    .values({
      tenantId,
      status: "pending",
      requiredSteps: [...DEFAULT_FIRST_RUN_STEPS],
      completedSteps: [],
    })
    .onConflictDoNothing();

  const [state] = await db
    .select()
    .from(tenantFirstRunStateTable)
    .where(eq(tenantFirstRunStateTable.tenantId, tenantId))
    .limit(1);

  if (!state) throw new Error("First-run state kon niet worden geladen.");
  return state;
}

export async function getTenantFirstRunState(): Promise<TenantFirstRunStateRow> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const state = await ensureTenantFirstRunState(tenantId);

  return {
    tenantId: state.tenantId,
    status: state.status,
    requiredSteps: stringArray(state.requiredSteps),
    completedSteps: stringArray(state.completedSteps),
    completedAt: state.completedAt?.toISOString() ?? null,
    updatedAt: state.updatedAt.toISOString(),
  };
}

export async function completeTenantFirstRunStep(formData: FormData): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const step = normalizeStep(String(formData.get("step") ?? ""));
  if (!step) return { success: false, message: "Onbekende onboardingstap." };

  const state = await ensureTenantFirstRunState(tenantId);
  const requiredSteps = stringArray(state.requiredSteps);
  const completedSteps = [...new Set([...stringArray(state.completedSteps), step])];
  const allDone = requiredSteps.every((requiredStep) => completedSteps.includes(requiredStep));

  await db
    .update(tenantFirstRunStateTable)
    .set({
      completedSteps,
      status: allDone ? "completed" : "in_progress",
      completedAt: allDone ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tenantFirstRunStateTable.tenantId, tenantId));

  revalidateFirstRun();
  return { success: true };
}

export async function skipTenantFirstRun(): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  await ensureTenantFirstRunState(tenantId);

  await db
    .update(tenantFirstRunStateTable)
    .set({ status: "skipped", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenantFirstRunStateTable.tenantId, tenantId));

  revalidateFirstRun();
  return { success: true };
}
