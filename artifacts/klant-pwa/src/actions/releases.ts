"use server";

import {
  auditLogTable,
  db,
  getActiveReleaseHighlightsForContext,
  getReleaseMediaByIdForContext,
  getReleaseBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listReleasesForContext,
  releaseDismissalsTable,
  type ReleaseHighlightSummary,
  type ReleaseMediaAccess,
  type ReleaseSummary,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { getMyCustomerIdentity } from "@/actions/customer";

async function customerReleaseContext() {
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(identity.tenantId);
  if (!activeModuleKeys.includes("releases")) return null;

  return {
    tenantId: identity.tenantId,
    surface: "customer_pwa" as const,
    audiences: ["tenant_customer" as const],
    activeModuleKeys,
    userId: identity.userId,
    customerId: identity.customerId,
  };
}

export async function listCustomerReleases(): Promise<ReleaseSummary[]> {
  const context = await customerReleaseContext();
  if (!context) return [];
  return listReleasesForContext(context);
}

export async function getCustomerRelease(slug: string): Promise<ReleaseSummary | null> {
  const context = await customerReleaseContext();
  if (!context) return null;
  return getReleaseBySlugForContext(context, slug);
}

export async function getCustomerReleaseMedia(mediaId: string): Promise<ReleaseMediaAccess | null> {
  const context = await customerReleaseContext();
  if (!context) return null;
  return getReleaseMediaByIdForContext(context, mediaId);
}

export async function getCustomerReleaseHighlight(): Promise<ReleaseHighlightSummary | null> {
  const context = await customerReleaseContext();
  if (!context) return null;
  const highlights = await getActiveReleaseHighlightsForContext(context);
  return highlights[0] ?? null;
}

export async function dismissCustomerReleaseHighlight(formData: FormData): Promise<void> {
  const identity = await getMyCustomerIdentity();
  const context = await customerReleaseContext();
  if (!identity || !context) return;

  const highlightId = String(formData.get("highlightId") ?? "").trim();
  if (!highlightId) return;

  const visibleHighlight = (await getActiveReleaseHighlightsForContext(context)).find(
    (highlight) => highlight.id === highlightId,
  );
  if (!visibleHighlight) return;

  await db.insert(releaseDismissalsTable).values({
    highlightId,
    tenantId: identity.tenantId,
    userId: identity.userId,
    customerId: identity.customerId,
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    tenantId: identity.tenantId,
    userId: identity.userId,
    action: "release_highlight_dismissed",
    resource: "releases",
    resourceId: highlightId,
    metadata: { surface: "customer_pwa", customerId: identity.customerId },
  });

  revalidatePath("/");
  revalidatePath("/releases");
}
