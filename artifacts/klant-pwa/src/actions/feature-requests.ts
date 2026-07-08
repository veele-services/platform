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
import { getMyCustomerIdentity } from "@/actions/customer";

export type CustomerFeatureRequestOptions = {
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
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  const activeModuleKeys = await listEnabledKnowledgebaseModuleKeysForTenant(identity.tenantId);
  const [settings] = await db
    .select({ enabled: organizationSettingsTable.roadmapCustomerRequestsEnabled })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, identity.tenantId))
    .limit(1);

  return {
    identity,
    activeModuleKeys,
    enabled: Boolean(settings?.enabled) && activeModuleKeys.includes("roadmap"),
  };
}

export async function getCustomerFeatureRequestOptions(): Promise<CustomerFeatureRequestOptions> {
  const context = await loadContext();
  if (!context) return { enabled: false, reason: "Geen actieve klanttoegang.", modules: [] };
  if (!context.activeModuleKeys.includes("roadmap")) {
    return { enabled: false, reason: "Roadmapmodule is niet actief voor deze organisatie.", modules: [] };
  }
  if (!context.enabled) {
    return { enabled: false, reason: "Featurewensen vanuit het klantportaal staan uit voor deze organisatie.", modules: [] };
  }

  const modules = await db
    .select({ key: modulesTable.key, name: modulesTable.name })
    .from(modulesTable)
    .where(inArray(modulesTable.key, context.activeModuleKeys))
    .orderBy(asc(modulesTable.name));

  return { enabled: true, reason: null, modules };
}

export async function submitCustomerFeatureRequest(formData: FormData): Promise<void> {
  const context = await loadContext();
  if (!context?.enabled) return;

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = normalizePriority(String(formData.get("priority") ?? ""));
  const moduleKeys = [...new Set(formData.getAll("moduleKeys").map(String))]
    .filter((moduleKey) => context.activeModuleKeys.includes(moduleKey));

  if (!title || !description) return;

  const [saved] = await db.insert(roadmapItemsTable).values({
    tenantId: context.identity.tenantId,
    scope: "tenant",
    title,
    slug: slugify(title),
    description,
    status: "new",
    priority,
    submittedBy: context.identity.userId,
    publicVisible: false,
    createdBy: context.identity.userId,
    updatedBy: context.identity.userId,
    metadata: { source: "customer_pwa", customerId: context.identity.customerId },
  }).returning({ id: roadmapItemsTable.id });

  if (!saved) return;

  await db.insert(roadmapItemAudiencesTable).values([
    { roadmapItemId: saved.id, audienceKey: "tenant_admin" },
    { roadmapItemId: saved.id, audienceKey: "tenant_management" },
    { roadmapItemId: saved.id, audienceKey: "tenant_customer" },
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
    changedBy: context.identity.userId,
    note: "Ingediend vanuit klantportaal.",
  });

  await db.insert(roadmapItemTenantLinksTable).values({
    roadmapItemId: saved.id,
    tenantId: context.identity.tenantId,
    relationType: "requested_by",
  }).onConflictDoNothing();

  await db.insert(auditLogTable).values({
    tenantId: context.identity.tenantId,
    userId: context.identity.userId,
    action: "roadmap_request_submitted_customer",
    resource: "roadmap",
    resourceId: saved.id,
    metadata: { title, priority, moduleKeys, customerId: context.identity.customerId },
  });

  revalidatePath("/meer");
  revalidatePath("/roadmap/new");
  redirect("/meer?featureRequest=sent");
}
