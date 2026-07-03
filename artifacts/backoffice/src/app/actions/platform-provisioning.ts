"use server";

import {
  completeProvisionedTenantOwnerInvite,
  db,
  provisionTenant,
  rollbackProvisionedTenant,
  tenantProvisioningRunsTable,
  tenantsTable,
  type TenantPlanKey,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;

export type PlatformProvisioningRunRow = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  name: string;
  slug: string;
  planKey: string;
  primaryDomain: string | null;
  ownerEmail: string | null;
  ownerInviteStatus: string;
  status: string;
  currentStep: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

function actionValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function normalizePlanKey(value: string): TenantPlanKey {
  return TENANT_PLAN_KEYS.includes(value as TenantPlanKey) ? (value as TenantPlanKey) : "starter";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tenant provisioning mislukt.";
}

async function inviteOwnerByEmail(email: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(`Owner-uitnodiging mislukt: ${error.message}`);
  if (!data.user?.id) throw new Error("Owner-uitnodiging gaf geen gebruiker terug.");
  return data.user.id;
}

export async function listTenantProvisioningRuns(limit = 12): Promise<PlatformProvisioningRunRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantProvisioningRunsTable.id,
      tenantId: tenantProvisioningRunsTable.tenantId,
      tenantName: tenantsTable.name,
      name: tenantProvisioningRunsTable.name,
      slug: tenantProvisioningRunsTable.slug,
      planKey: tenantProvisioningRunsTable.planKey,
      primaryDomain: tenantProvisioningRunsTable.primaryDomain,
      ownerEmail: tenantProvisioningRunsTable.ownerEmail,
      ownerInviteStatus: tenantProvisioningRunsTable.ownerInviteStatus,
      status: tenantProvisioningRunsTable.status,
      currentStep: tenantProvisioningRunsTable.currentStep,
      errorMessage: tenantProvisioningRunsTable.errorMessage,
      startedAt: tenantProvisioningRunsTable.startedAt,
      completedAt: tenantProvisioningRunsTable.completedAt,
    })
    .from(tenantProvisioningRunsTable)
    .leftJoin(tenantsTable, eq(tenantProvisioningRunsTable.tenantId, tenantsTable.id))
    .orderBy(desc(tenantProvisioningRunsTable.startedAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows.map((row) => ({
    ...row,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }));
}

export async function createPlatformTenant(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const name = actionValue(formData, "name");
  const slug = actionValue(formData, "slug") || null;
  const planKey = normalizePlanKey(actionValue(formData, "planKey"));
  const primaryDomain = actionValue(formData, "domain") || null;
  const ownerEmail = actionValue(formData, "ownerEmail").toLowerCase() || null;

  const result = await provisionTenant({
    name,
    slug,
    planKey,
    primaryDomain,
    ownerEmail,
    requestedBy: actor.userId,
    metadata: {
      source: "platform-admin",
      actorPlatformUserId: actor.id,
      ownerInviteRequested: Boolean(ownerEmail),
    },
  });

  try {
    if (ownerEmail) {
      const ownerUserId = await inviteOwnerByEmail(ownerEmail);
      await completeProvisionedTenantOwnerInvite({
        tenantId: result.tenantId,
        runId: result.runId,
        ownerEmail,
        ownerUserId,
        invitedBy: actor.userId,
      });
    }
  } catch (error) {
    await rollbackProvisionedTenant({
      tenantId: result.tenantId,
      runId: result.runId,
      requestedBy: actor.userId,
      reason: errorMessage(error),
    });
    throw error;
  }

  await writeSupportAccessAuditLog({
    tenantId: result.tenantId,
    action: "tenant_provisioned",
    resource: "tenant_provisioning_runs",
    resourceId: result.runId,
    metadata: {
      slug: result.slug,
      planKey: result.planKey,
      primaryDomain: result.primaryDomain,
      ownerInviteRequested: Boolean(ownerEmail),
    },
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${result.tenantId}`);
  redirect(`/platform/tenants/${result.tenantId}`);
}
