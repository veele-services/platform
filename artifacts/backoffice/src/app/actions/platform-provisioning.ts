"use server";

import {
  completeProvisionedTenantOwnerInvite,
  provisionTenant,
  rollbackProvisionedTenant,
  type TenantPlanKey,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;

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
