"use server";

import {
  activatePlatformWebsiteDeployment,
  approvePlatformWebsiteDeployment,
  checkPlatformWebsiteDeploymentHealth,
  getPlatformWebsiteDelivery,
  registerPlatformWebsiteDeployment,
  rollbackPlatformWebsiteDelivery,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/platform";

function required(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function numberValue(formData: FormData, name: string): number {
  const value = Number(required(formData, name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function revalidateTenant(tenantId: string): void {
  revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function getPlatformWebsiteDeliveryAction(tenantId: string) {
  await requirePlatformAdmin();
  return getPlatformWebsiteDelivery(tenantId);
}

export async function registerPlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await registerPlatformWebsiteDeployment({
    tenantId,
    siteId: required(formData, "siteId"),
    providerKey: required(formData, "providerKey"),
    routeKey: required(formData, "routeKey"),
    releaseId: required(formData, "releaseId"),
    expectedHost: required(formData, "expectedHost"),
    healthPath: required(formData, "healthPath"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
  });
  revalidateTenant(tenantId);
}

export async function checkPlatformWebsiteDeploymentHealthAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await checkPlatformWebsiteDeploymentHealth({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: "Run the strict staging health preflight for this deployment.",
  });
  revalidateTenant(tenantId);
}

export async function approvePlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await approvePlatformWebsiteDeployment({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: "Approve the exact healthy staging deployment identity.",
  });
  revalidateTenant(tenantId);
}

export async function activatePlatformWebsiteDeploymentAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await activatePlatformWebsiteDeployment({
    tenantId,
    siteId: required(formData, "siteId"),
    deploymentId: required(formData, "deploymentId"),
    expectedDeliveryRevision: numberValue(formData, "expectedDeliveryRevision"),
    expectedMode: required(formData, "expectedMode") as
      | "managed_cms"
      | "custom_nextjs",
    expectedTargetId: optional(formData, "expectedTargetId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: required(formData, "reason"),
  });
  revalidateTenant(tenantId);
}

export async function rollbackPlatformWebsiteDeliveryAction(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const tenantId = required(formData, "tenantId");
  await rollbackPlatformWebsiteDelivery({
    tenantId,
    siteId: required(formData, "siteId"),
    expectedDeliveryRevision: numberValue(formData, "expectedDeliveryRevision"),
    expectedMode: required(formData, "expectedMode") as
      | "managed_cms"
      | "custom_nextjs",
    expectedTargetId: optional(formData, "expectedTargetId"),
    actorUserId: actor.userId,
    changeReference: required(formData, "changeReference"),
    reason: required(formData, "reason"),
  });
  revalidateTenant(tenantId);
}
