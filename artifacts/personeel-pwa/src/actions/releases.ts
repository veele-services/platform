"use server";

import {
  auditLogTable,
  db,
  getActiveReleaseHighlightsForContext,
  getReleaseBySlugForContext,
  listEnabledKnowledgebaseModuleKeysForTenant,
  listReleasesForContext,
  releaseDismissalsTable,
  type ReleaseHighlightSummary,
  type ReleaseSummary,
} from "@workspace/db";
import { revalidatePath } from "next/cache";
import { getMyPersonnel } from "@/actions/personnel";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";

async function personnelReleaseContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) return null;

  const personnel = await getMyPersonnel();
  if (!personnel) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  if (!activeModuleKeys.includes("releases")) return null;

  return {
    tenantId,
    surface: "personnel_pwa" as const,
    audiences: ["tenant_personnel" as const],
    activeModuleKeys,
    userId: user.id,
    personnelId: personnel.id,
  };
}

export async function listPersonnelReleases(): Promise<ReleaseSummary[]> {
  const context = await personnelReleaseContext();
  if (!context) return [];
  return listReleasesForContext(context);
}

export async function getPersonnelRelease(slug: string): Promise<ReleaseSummary | null> {
  const context = await personnelReleaseContext();
  if (!context) return null;
  return getReleaseBySlugForContext(context, slug);
}

export async function getPersonnelReleaseHighlight(): Promise<ReleaseHighlightSummary | null> {
  const context = await personnelReleaseContext();
  if (!context) return null;
  const highlights = await getActiveReleaseHighlightsForContext(context);
  return highlights[0] ?? null;
}

export async function dismissPersonnelReleaseHighlight(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const context = await personnelReleaseContext();
  if (!user || !context?.personnelId) return;

  const highlightId = String(formData.get("highlightId") ?? "").trim();
  if (!highlightId) return;

  const visibleHighlight = (await getActiveReleaseHighlightsForContext(context)).find(
    (highlight) => highlight.id === highlightId,
  );
  if (!visibleHighlight) return;

  await db.insert(releaseDismissalsTable).values({
    highlightId,
    tenantId: context.tenantId,
    userId: user.id,
    personnelId: context.personnelId,
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    tenantId: context.tenantId,
    userId: user.id,
    action: "release_highlight_dismissed",
    resource: "releases",
    resourceId: highlightId,
    metadata: { surface: "personnel_pwa", personnelId: context.personnelId },
  });

  revalidatePath("/");
  revalidatePath("/releases");
}
