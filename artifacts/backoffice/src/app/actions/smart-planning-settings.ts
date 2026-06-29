"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  planningSectorRulesTable,
  sectorsTable,
  type SmartPlanningScoreWeights,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; message: string };

export type SmartPlanningSectorRuleRow = {
  id: string | null;
  sectorId: string;
  sectorName: string;
  isActive: boolean;
  weights: SmartPlanningScoreWeights;
  topMatchThreshold: number;
  defaultRoundSize: number;
  roundIntervalMinutes: number;
  maxDailyInvites: number;
  reminderAfterMinutes: number;
  inviteCooldownMinutes: number;
  allowEmergencyOverride: boolean;
  totalWeight: number;
  updatedAt: string | null;
};

const DEFAULT_WEIGHTS: SmartPlanningScoreWeights = {
  availability: 25,
  role: 12,
  qualifications: 20,
  region: 15,
  objectExperience: 10,
  workload: 8,
  emergency: 4,
  fixedTeams: 3,
  preferences: 3,
};

const SECURITY_WEIGHTS: SmartPlanningScoreWeights = {
  availability: 18,
  role: 16,
  qualifications: 26,
  region: 8,
  objectExperience: 8,
  workload: 8,
  emergency: 4,
  fixedTeams: 6,
  preferences: 6,
};

const FACILITY_WEIGHTS: SmartPlanningScoreWeights = {
  availability: 28,
  role: 12,
  qualifications: 18,
  region: 10,
  objectExperience: 8,
  workload: 10,
  emergency: 8,
  fixedTeams: 3,
  preferences: 3,
};

const weightSchema = z.object({
  availability: z.coerce.number().int().min(0).max(100),
  role: z.coerce.number().int().min(0).max(100),
  qualifications: z.coerce.number().int().min(0).max(100),
  region: z.coerce.number().int().min(0).max(100),
  objectExperience: z.coerce.number().int().min(0).max(100),
  workload: z.coerce.number().int().min(0).max(100),
  emergency: z.coerce.number().int().min(0).max(100),
  fixedTeams: z.coerce.number().int().min(0).max(100),
  preferences: z.coerce.number().int().min(0).max(100),
});

const ruleInputSchema = z
  .object({
    sectorId: z.string().uuid(),
    weights: weightSchema,
    topMatchThreshold: z.coerce.number().int().min(1).max(100),
    defaultRoundSize: z.coerce.number().int().min(1).max(50),
    roundIntervalMinutes: z.coerce.number().int().min(1).max(1440),
    maxDailyInvites: z.coerce.number().int().min(1).max(100),
    reminderAfterMinutes: z.coerce.number().int().min(1).max(1440),
    inviteCooldownMinutes: z.coerce.number().int().min(0).max(10080),
    allowEmergencyOverride: z.boolean(),
    isActive: z.boolean(),
  })
  .refine(
    (value) => Object.values(value.weights).reduce((sum, weight) => sum + weight, 0) > 0,
    { message: "Minimaal een gewicht moet groter zijn dan 0." },
  );

function defaultWeightsForSectorName(sectorName: string): SmartPlanningScoreWeights {
  const lower = sectorName.toLowerCase();
  if (lower.includes("beveilig")) return SECURITY_WEIGHTS;
  if (lower.includes("facilit")) return FACILITY_WEIGHTS;
  return DEFAULT_WEIGHTS;
}

function normalizeWeights(
  value: unknown,
  fallback: SmartPlanningScoreWeights,
): SmartPlanningScoreWeights {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<keyof SmartPlanningScoreWeights, unknown>>)
      : {};
  const weights = { ...fallback };
  for (const key of Object.keys(weights) as Array<keyof SmartPlanningScoreWeights>) {
    const next = Number(input[key]);
    if (Number.isFinite(next) && next >= 0) weights[key] = next;
  }
  return weights;
}

function totalWeight(weights: SmartPlanningScoreWeights): number {
  return Object.values(weights).reduce((sum, weight) => sum + weight, 0);
}

async function requireSmartPlanningRead() {
  const allowed =
    (await hasPermission("planning", "read")) || (await hasPermission("settings", "read"));
  if (!allowed) throw new Error("Forbidden: planning/settings read");
}

async function requireSmartPlanningWrite() {
  const allowed =
    (await hasPermission("planning", "write")) || (await hasPermission("settings", "write"));
  if (!allowed) throw new Error("Forbidden: planning/settings write");
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function audit(action: string, resourceId: string | null, metadata: Record<string, unknown>) {
  const userId = await currentUserId();
  if (!userId) return;
  await db.insert(auditLogTable).values({
    userId,
    action,
    resource: "planning_sector_rules",
    resourceId,
    metadata,
  });
}

function revalidateSmartPlanning() {
  revalidatePath("/instellingen/slim-plannen");
  revalidatePath("/planning");
  revalidatePath("/assignments");
}

export async function listSmartPlanningSectorRules(): Promise<SmartPlanningSectorRuleRow[]> {
  await requireSmartPlanningRead();
  const tenantId = await requireCurrentTenantId();

  const [sectors, rules] = await Promise.all([
    db
      .select({
        id: sectorsTable.id,
        name: sectorsTable.name,
      })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),
    db
      .select()
      .from(planningSectorRulesTable)
      .where(eq(planningSectorRulesTable.tenantId, tenantId)),
  ]);

  const rulesBySectorId = new Map(rules.map((rule) => [rule.sectorId, rule]));

  return sectors.map((sector) => {
    const rule = rulesBySectorId.get(sector.id) ?? null;
    const weights = normalizeWeights(rule?.weights, defaultWeightsForSectorName(sector.name));
    return {
      id: rule?.id ?? null,
      sectorId: sector.id,
      sectorName: sector.name,
      isActive: rule?.isActive ?? true,
      weights,
      topMatchThreshold: rule?.topMatchThreshold ?? 85,
      defaultRoundSize: rule?.defaultRoundSize ?? 5,
      roundIntervalMinutes: rule?.roundIntervalMinutes ?? 30,
      maxDailyInvites: rule?.maxDailyInvites ?? 6,
      reminderAfterMinutes: rule?.reminderAfterMinutes ?? 15,
      inviteCooldownMinutes: rule?.inviteCooldownMinutes ?? 120,
      allowEmergencyOverride: rule?.allowEmergencyOverride ?? true,
      totalWeight: totalWeight(weights),
      updatedAt: rule?.updatedAt ? rule.updatedAt.toISOString() : null,
    };
  });
}

export async function updateSmartPlanningSectorRule(
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireSmartPlanningWrite();
  const tenantId = await requireCurrentTenantId();

  const parsed = ruleInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Controleer de slimme planningsregels.",
    };
  }

  const [sector] = await db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.id, parsed.data.sectorId))
    .limit(1);

  if (!sector) {
    return { success: false, message: "Sector niet gevonden." };
  }

  const [saved] = await db
    .insert(planningSectorRulesTable)
    .values({
      tenantId,
      sectorId: parsed.data.sectorId,
      weights: parsed.data.weights,
      topMatchThreshold: parsed.data.topMatchThreshold,
      defaultRoundSize: parsed.data.defaultRoundSize,
      roundIntervalMinutes: parsed.data.roundIntervalMinutes,
      maxDailyInvites: parsed.data.maxDailyInvites,
      reminderAfterMinutes: parsed.data.reminderAfterMinutes,
      inviteCooldownMinutes: parsed.data.inviteCooldownMinutes,
      allowEmergencyOverride: parsed.data.allowEmergencyOverride,
      isActive: parsed.data.isActive,
    })
    .onConflictDoUpdate({
      target: [planningSectorRulesTable.tenantId, planningSectorRulesTable.sectorId],
      set: {
        weights: parsed.data.weights,
        topMatchThreshold: parsed.data.topMatchThreshold,
        defaultRoundSize: parsed.data.defaultRoundSize,
        roundIntervalMinutes: parsed.data.roundIntervalMinutes,
        maxDailyInvites: parsed.data.maxDailyInvites,
        reminderAfterMinutes: parsed.data.reminderAfterMinutes,
        inviteCooldownMinutes: parsed.data.inviteCooldownMinutes,
        allowEmergencyOverride: parsed.data.allowEmergencyOverride,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      },
    })
    .returning({ id: planningSectorRulesTable.id });

  await audit("update_smart_planning_sector_rule", saved?.id ?? null, {
    sectorId: sector.id,
    sectorName: sector.name,
    weights: parsed.data.weights,
    topMatchThreshold: parsed.data.topMatchThreshold,
    defaultRoundSize: parsed.data.defaultRoundSize,
    roundIntervalMinutes: parsed.data.roundIntervalMinutes,
    maxDailyInvites: parsed.data.maxDailyInvites,
    reminderAfterMinutes: parsed.data.reminderAfterMinutes,
    inviteCooldownMinutes: parsed.data.inviteCooldownMinutes,
    allowEmergencyOverride: parsed.data.allowEmergencyOverride,
    isActive: parsed.data.isActive,
  });
  revalidateSmartPlanning();

  return { success: true, data: { id: saved!.id } };
}

export async function resetSmartPlanningSectorRule(
  sectorId: string,
): Promise<ActionResult<{ id: string }>> {
  await requireSmartPlanningWrite();
  const tenantId = await requireCurrentTenantId();

  const [sector] = await db
    .select({ id: sectorsTable.id, name: sectorsTable.name })
    .from(sectorsTable)
    .where(eq(sectorsTable.id, sectorId))
    .limit(1);

  if (!sector) {
    return { success: false, message: "Sector niet gevonden." };
  }

  const weights = defaultWeightsForSectorName(sector.name);
  const [saved] = await db
    .insert(planningSectorRulesTable)
    .values({
      tenantId,
      sectorId,
      weights,
      topMatchThreshold: 85,
      defaultRoundSize: 5,
      roundIntervalMinutes: 30,
      maxDailyInvites: 6,
      reminderAfterMinutes: 15,
      inviteCooldownMinutes: 120,
      allowEmergencyOverride: true,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [planningSectorRulesTable.tenantId, planningSectorRulesTable.sectorId],
      set: {
        weights,
        topMatchThreshold: 85,
        defaultRoundSize: 5,
        roundIntervalMinutes: 30,
        maxDailyInvites: 6,
        reminderAfterMinutes: 15,
        inviteCooldownMinutes: 120,
        allowEmergencyOverride: true,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning({ id: planningSectorRulesTable.id });

  await audit("reset_smart_planning_sector_rule", saved?.id ?? null, {
    sectorId,
    sectorName: sector.name,
    weights,
  });
  revalidateSmartPlanning();

  return { success: true, data: { id: saved!.id } };
}
