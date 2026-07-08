"use server";

import {
  auditLogTable,
  db,
  listEnabledKnowledgebaseModuleKeysForTenant,
  modulesTable,
  organizationSettingsTable,
  roadmapItemAudiencesTable,
  roadmapItemModulesTable,
  roadmapItemStatusHistoryTable,
  roadmapItemTenantLinksTable,
  roadmapItemsTable,
  type RoadmapPriority,
} from "@workspace/db";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMyPersonnel } from "@/actions/personnel";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";

export type PersonnelFeatureRequestOptions = {
  enabled: boolean;
  reason: string | null;
  modules: Array<{ key: string; name: string }>;
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || `wens-${Date.now()}`;
}

function normalizePriority(value: string): RoadmapPriority {
  if (value === "low" || value === "high" || value === "critical") return value;
  return "normal";
}

async function loadContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) return null;

  const personnel = await getMyPersonnel();
  if (!personnel) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(tenantId);
  const [settings] = await db
    .select({ enabled: organizationSettingsTable.roadmapPersonnelRequestsEnabled })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  return {
    tenantId,
    userId: user.id,
    personnelId: personnel.id,
    activeModuleKeys,
    enabled: Boolean(settings?.enabled) && activeModuleKeys.includes("roadmap"),
  };
}

export async function getPersonnelFeatureRequestOptions(): Promise<PersonnelFeatureRequestOptions> {
  const context = await loadContext();
  if (!context) return { enabled: false, reason: "Geen actieve personeelstoegang.", modules: [] };
  if (!context.activeModuleKeys.includes("roadmap")) {
    return { enabled: false, reason: "Roadmapmodule is niet actief voor deze organisatie.", modules: [] };
  }
  if (!context.enabled) {
    return { enabled: false, reason: "Featurewensen vanuit de personeelsapp staan uit voor deze organisatie.", modules: [] };
  }

  const modules = await db
    .select({ key: modulesTable.key, name: modulesTable.name })
    .from(modulesTable)
    .where(inArray(modulesTable.key, context.activeModuleKeys))
    .orderBy(asc(modulesTable.name));

  return { enabled: true, reason: null, modules };
}

export async function submitPersonnelFeatureRequest(formData: FormData): Promise<void> {
  const context = await loadContext();
  if (!context?.enabled) return;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = normalizePriority(String(formData.get("priority") ?? ""));
  const moduleKeys = [...new Set(formData.getAll("moduleKeys").map(String))]
    .filter((moduleKey) => context.activeModuleKeys.includes(moduleKey));

  if (!title || !description) return;

  const [saved] = await db.insert(roadmapItemsTable).values({
    tenantId: context.tenantId,
    scope: "tenant",
    title,
    slug: slugify(title),
    description,
    status: "new",
    priority,
    submittedBy: context.userId,
    publicVisible: false,
    createdBy: context.userId,
    updatedBy: context.userId,
    metadata: { source: "personnel_pwa", personnelId: context.personnelId },
  }).returning({ id: roadmapItemsTable.id });

  if (!saved) return;

  await db.insert(roadmapItemAudiencesTable).values([
    { roadmapItemId: saved.id, audienceKey: "tenant_admin" },
    { roadmapItemId: saved.id, audienceKey: "tenant_management" },
    { roadmapItemId: saved.id, audienceKey: "tenant_personnel" },
  ]).onConflictDoNothing();

  if (moduleKeys.length > 0) {
    await db.insert(roadmapItemModulesTable).values(moduleKeys.map((moduleKey) => ({
      roadmapItemId: saved.id,
      moduleKey,
    }))).onConflictDoNothing();
  }

  await db.insert(roadmapItemStatusHistoryTable).values({
    roadmapItemId: saved.id,
    fromStatus: null,
    toStatus: "new",
    changedBy: context.userId,
    note: "Ingediend vanuit personeelsapp.",
  });

  await db.insert(roadmapItemTenantLinksTable).values({
    roadmapItemId: saved.id,
    tenantId: context.tenantId,
    relationType: "requested_by",
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    tenantId: context.tenantId,
    userId: context.userId,
    action: "roadmap_request_submitted_personnel",
    resource: "roadmap",
    resourceId: saved.id,
    metadata: { title, priority, moduleKeys, personnelId: context.personnelId },
  });

  revalidatePath("/meer");
  revalidatePath("/roadmap/new");
  redirect("/meer?featureRequest=sent");
}
