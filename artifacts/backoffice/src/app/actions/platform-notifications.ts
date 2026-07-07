"use server";

import {
  auditLogTable,
  db,
  modulesTable,
  platformNotificationDispatchesTable,
  platformNotificationRecipientsTable,
  platformUsersTable,
  plansTable,
  tenantDomainsTable,
  tenantModulesTable,
  tenantOwnerInvitesTable,
  tenantRegionsTable,
  tenantSectorsTable,
  tenantSubscriptionsTable,
  tenantUsersTable,
  tenantsTable,
  type PlatformNotificationAudienceType,
  type PlatformNotificationChannel,
  type PlatformNotificationScheduleType,
  type PlatformNotificationTemplateKey,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, type CurrentPlatformUser } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

export type PlatformNotificationTemplate = {
  key: PlatformNotificationTemplateKey;
  label: string;
  description: string;
  title: string;
  body: string;
};

export type PlatformNotificationTenantRecipientPreview = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planKey: string;
  ownerEmail: string;
  ownerInviteStatus: string;
  readinessStatus: "ready" | "warning" | "blocked";
};

export type PlatformNotificationPlatformUserPreview = {
  id: string;
  userId: string;
  role: string;
  status: string;
};

export type PlatformNotificationPlanOption = {
  key: string;
  name: string;
  recipientCount: number;
};

export type PlatformNotificationModuleOption = {
  key: string;
  name: string;
  recipientCount: number;
};

export type PlatformNotificationDispatchRow = {
  id: string;
  templateKey: string;
  audienceType: string;
  scheduleType: string;
  status: string;
  title: string;
  channels: PlatformNotificationChannel[];
  tenantCount: number;
  recipientCount: number;
  scheduledAt: string | null;
  queuedAt: string | null;
  createdAt: string;
};

export type PlatformNotificationCenter = {
  generatedAt: string;
  templates: PlatformNotificationTemplate[];
  stats: {
    totalDispatches: number;
    queued: number;
    scheduled: number;
    recipients: number;
    tenantOwners: number;
    readinessIssues: number;
    platformUsers: number;
  };
  platformUsers: PlatformNotificationPlatformUserPreview[];
  tenantOwners: PlatformNotificationTenantRecipientPreview[];
  readinessIssueOwners: PlatformNotificationTenantRecipientPreview[];
  plans: PlatformNotificationPlanOption[];
  modules: PlatformNotificationModuleOption[];
  dispatches: PlatformNotificationDispatchRow[];
};

type RecipientDraft = {
  recipientType: "platform_user" | "tenant_owner";
  tenantId: string | null;
  platformUserId: string | null;
  tenantOwnerInviteId: string | null;
  recipientUserId: string | null;
  recipientEmail: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  metadata: Record<string, unknown>;
};

const TEMPLATE_KEYS: PlatformNotificationTemplateKey[] = [
  "maintenance",
  "incident",
  "onboarding_reminder",
  "domain_dns_reminder",
  "subscription_warning",
];

const AUDIENCE_TYPES: PlatformNotificationAudienceType[] = [
  "platform_users",
  "tenant_owners",
  "tenants_by_plan",
  "tenants_by_module",
  "tenants_with_readiness_issue",
];

const CHANNELS: PlatformNotificationChannel[] = ["in_app", "email", "push"];
const SCHEDULE_TYPES: PlatformNotificationScheduleType[] = ["immediate", "scheduled"];
const ACTIVE_OWNER_INVITE_STATUSES = ["pending", "sent", "accepted"] as const;
const NOTIFIABLE_TENANT_STATUSES = ["provisioning", "trial", "active"] as const;

const TEMPLATES: PlatformNotificationTemplate[] = [
  {
    key: "maintenance",
    label: "Onderhoud",
    description: "Gepland onderhoud of korte onderbreking.",
    title: "Gepland onderhoud aan Fieldgrid",
    body: "We voeren gepland onderhoud uit. De omgeving kan tijdelijk minder goed bereikbaar zijn. We houden de impact zo klein mogelijk.",
  },
  {
    key: "incident",
    label: "Storing",
    description: "Actieve storing of herstelupdate.",
    title: "Update over Fieldgrid storing",
    body: "We onderzoeken een storing in Fieldgrid. Zodra er meer bekend is volgt een update via hetzelfde kanaal.",
  },
  {
    key: "onboarding_reminder",
    label: "Onboarding reminder",
    description: "Tenant heeft nog open first-run of readiness stappen.",
    title: "Fieldgrid onboarding afronden",
    body: "Er staan nog onboardingstappen open. Rond de inrichting af zodat de tenant volledig operationeel wordt.",
  },
  {
    key: "domain_dns_reminder",
    label: "Domain DNS reminder",
    description: "Custom domain DNS-records ontbreken of zijn onvolledig.",
    title: "DNS-instellingen voor Fieldgrid controleren",
    body: "De domeinverificatie is nog niet compleet. Controleer TXT en A/AAAA/CNAME records in DNS en start daarna de verificatie opnieuw.",
  },
  {
    key: "subscription_warning",
    label: "Subscription warning",
    description: "Billing, past-due of planwijziging.",
    title: "Belangrijke update over uw Fieldgrid subscription",
    body: "Er is aandacht nodig voor de subscription. Controleer de billingstatus en neem contact op als dit niet klopt.",
  },
];

function formValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function formValues(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizeTemplateKey(value: string): PlatformNotificationTemplateKey {
  return TEMPLATE_KEYS.includes(value as PlatformNotificationTemplateKey)
    ? (value as PlatformNotificationTemplateKey)
    : "maintenance";
}

function normalizeAudienceType(value: string): PlatformNotificationAudienceType {
  return AUDIENCE_TYPES.includes(value as PlatformNotificationAudienceType)
    ? (value as PlatformNotificationAudienceType)
    : "platform_users";
}

function normalizeScheduleType(value: string): PlatformNotificationScheduleType {
  return SCHEDULE_TYPES.includes(value as PlatformNotificationScheduleType)
    ? (value as PlatformNotificationScheduleType)
    : "immediate";
}

function normalizeChannels(values: string[]): PlatformNotificationChannel[] {
  const channels = values.filter((value): value is PlatformNotificationChannel =>
    CHANNELS.includes(value as PlatformNotificationChannel),
  );
  return channels.length > 0 ? [...new Set(channels)] : ["in_app"];
}

function templateFor(key: PlatformNotificationTemplateKey): PlatformNotificationTemplate {
  return TEMPLATES.find((template) => template.key === key) ?? TEMPLATES[0];
}

function optionalScheduledAt(formData: FormData, scheduleType: PlatformNotificationScheduleType): Date | null {
  if (scheduleType !== "scheduled") return null;
  const value = formValue(formData, "scheduledAt");
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readinessStatusSql(): SQL<"ready" | "warning" | "blocked"> {
  return sql<"ready" | "warning" | "blocked">`(
    CASE
      WHEN ${tenantsTable.status} IN ('suspended', 'archived')
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantsTable.id}
            AND td.type <> 'platform_reserved'
            AND td.verification_status IN ('verified', 'active')
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantUsersTable} tu
          WHERE tu.tenant_id = ${tenantsTable.id}
            AND tu.status = 'active'
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantModulesTable} tm
          WHERE tm.tenant_id = ${tenantsTable.id}
            AND tm.is_enabled = true
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantSectorsTable} ts
          WHERE ts.tenant_id = ${tenantsTable.id}
            AND ts.is_enabled = true
        )
      THEN 'blocked'
      WHEN NOT EXISTS (
          SELECT 1 FROM ${tenantRegionsTable} tr
          WHERE tr.tenant_id = ${tenantsTable.id}
            AND tr.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantsTable.id}
            AND td.type <> 'platform_reserved'
            AND td.verification_status NOT IN ('verified', 'active')
        )
        OR EXISTS (
          SELECT 1 FROM ${tenantSubscriptionsTable} sub
          WHERE sub.tenant_id = ${tenantsTable.id}
            AND sub.status = 'past_due'
        )
      THEN 'warning'
      ELSE 'ready'
    END
  )`;
}

function notifiableTenantConditions(): SQL[] {
  return [
    eq(tenantsTable.isActive, true),
    inArray(tenantsTable.status, [...NOTIFIABLE_TENANT_STATUSES]),
    inArray(tenantOwnerInvitesTable.status, [...ACTIVE_OWNER_INVITE_STATUSES]),
  ];
}

function dedupeRecipients(rows: RecipientDraft[]): RecipientDraft[] {
  const seen = new Set<string>();
  const result: RecipientDraft[] = [];

  for (const row of rows) {
    const key = `${row.recipientType}:${row.tenantId ?? "platform"}:${row.recipientEmail ?? row.recipientUserId ?? row.platformUserId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
}

function tenantOwnerPreviewFromRow(row: {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planKey: string;
  email: string;
  inviteStatus: string;
  readinessStatus: "ready" | "warning" | "blocked";
}): PlatformNotificationTenantRecipientPreview {
  return {
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    planKey: row.planKey,
    ownerEmail: row.email,
    ownerInviteStatus: row.inviteStatus,
    readinessStatus: row.readinessStatus,
  };
}

async function selectTenantOwnerRows(where: SQL[]): Promise<Array<PlatformNotificationTenantRecipientPreview & { inviteId: string; userId: string | null }>> {
  const rows = await db
    .select({
      inviteId: tenantOwnerInvitesTable.id,
      tenantId: tenantsTable.id,
      tenantName: tenantsTable.name,
      tenantSlug: tenantsTable.slug,
      planKey: tenantsTable.planKey,
      email: tenantOwnerInvitesTable.email,
      userId: tenantOwnerInvitesTable.userId,
      inviteStatus: tenantOwnerInvitesTable.status,
      readinessStatus: readinessStatusSql(),
    })
    .from(tenantOwnerInvitesTable)
    .innerJoin(tenantsTable, eq(tenantOwnerInvitesTable.tenantId, tenantsTable.id))
    .where(and(...where))
    .orderBy(asc(tenantsTable.name), asc(tenantOwnerInvitesTable.email));

  const deduped = new Map<string, PlatformNotificationTenantRecipientPreview & { inviteId: string; userId: string | null }>();
  for (const row of rows) {
    const key = `${row.tenantId}:${row.email.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        ...tenantOwnerPreviewFromRow(row),
        inviteId: row.inviteId,
        userId: row.userId,
      });
    }
  }

  return [...deduped.values()];
}

function ownerRowsToRecipients(rows: Array<PlatformNotificationTenantRecipientPreview & { inviteId: string; userId: string | null }>): RecipientDraft[] {
  return rows.map((row) => ({
    recipientType: "tenant_owner",
    tenantId: row.tenantId,
    platformUserId: null,
    tenantOwnerInviteId: row.inviteId,
    recipientUserId: row.userId,
    recipientEmail: row.ownerEmail,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    metadata: {
      planKey: row.planKey,
      readinessStatus: row.readinessStatus,
      ownerInviteStatus: row.ownerInviteStatus,
    },
  }));
}

async function buildRecipients(input: {
  audienceType: PlatformNotificationAudienceType;
  selectedTenantIds: string[];
  planKey: string;
  moduleKey: string;
}): Promise<RecipientDraft[]> {
  if (input.audienceType === "platform_users") {
    const platformUsers = await db
      .select({
        id: platformUsersTable.id,
        userId: platformUsersTable.userId,
        role: platformUsersTable.role,
        status: platformUsersTable.status,
      })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.status, "active"))
      .orderBy(asc(platformUsersTable.role), asc(platformUsersTable.createdAt));

    return platformUsers.map((user) => ({
      recipientType: "platform_user",
      tenantId: null,
      platformUserId: user.id,
      tenantOwnerInviteId: null,
      recipientUserId: user.userId,
      recipientEmail: null,
      tenantName: null,
      tenantSlug: null,
      metadata: { role: user.role, status: user.status },
    }));
  }

  const conditions = notifiableTenantConditions();

  if (input.audienceType === "tenant_owners") {
    if (input.selectedTenantIds.length === 0) return [];
    conditions.push(inArray(tenantsTable.id, input.selectedTenantIds));
  } else if (input.audienceType === "tenants_by_plan") {
    if (!input.planKey) return [];
    conditions.push(sql`${tenantsTable.planKey} = ${input.planKey}`);
  } else if (input.audienceType === "tenants_by_module") {
    if (!input.moduleKey) return [];
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${tenantModulesTable} tm
      INNER JOIN ${modulesTable} m ON m.id = tm.module_id
      WHERE tm.tenant_id = ${tenantsTable.id}
        AND tm.is_enabled = true
        AND m.key = ${input.moduleKey}
    )`);
  } else if (input.audienceType === "tenants_with_readiness_issue") {
    conditions.push(sql`${readinessStatusSql()} <> 'ready'`);
  }

  const ownerRows = await selectTenantOwnerRows(conditions);
  return dedupeRecipients(ownerRowsToRecipients(ownerRows));
}

async function writePlatformNotificationAudit(input: {
  actor: CurrentPlatformUser;
  dispatchId: string;
  action: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    tenantId: null,
    userId: input.actor.userId,
    action: input.action,
    resource: "platform_notifications",
    resourceId: input.dispatchId,
    metadata: input.metadata,
  });
}

async function listPlatformUsersPreview(): Promise<PlatformNotificationPlatformUserPreview[]> {
  const rows = await db
    .select({
      id: platformUsersTable.id,
      userId: platformUsersTable.userId,
      role: platformUsersTable.role,
      status: platformUsersTable.status,
    })
    .from(platformUsersTable)
    .where(eq(platformUsersTable.status, "active"))
    .orderBy(asc(platformUsersTable.role), asc(platformUsersTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    role: row.role,
    status: row.status,
  }));
}

async function listTenantOwnersPreview(): Promise<PlatformNotificationTenantRecipientPreview[]> {
  const rows = await selectTenantOwnerRows(notifiableTenantConditions());
  return rows.map((row) => ({
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    planKey: row.planKey,
    ownerEmail: row.ownerEmail,
    ownerInviteStatus: row.ownerInviteStatus,
    readinessStatus: row.readinessStatus,
  }));
}

function countUniqueTenants(rows: RecipientDraft[]): number {
  return new Set(rows.map((row) => row.tenantId).filter(Boolean)).size;
}

function planOptionsFromOwners(owners: PlatformNotificationTenantRecipientPreview[], plans: Array<{ key: string; name: string }>): PlatformNotificationPlanOption[] {
  return plans.map((plan) => ({
    key: plan.key,
    name: plan.name,
    recipientCount: owners.filter((owner) => owner.planKey === plan.key).length,
  }));
}

async function listModuleOptionsWithCounts(): Promise<PlatformNotificationModuleOption[]> {
  const rows = await db
    .select({
      moduleKey: modulesTable.key,
      moduleName: modulesTable.name,
      recipientCount: sql<number>`count(DISTINCT (${tenantOwnerInvitesTable.tenantId}::text || ':' || lower(${tenantOwnerInvitesTable.email})))::int`,
    })
    .from(modulesTable)
    .leftJoin(tenantModulesTable, and(eq(tenantModulesTable.moduleId, modulesTable.id), eq(tenantModulesTable.isEnabled, true)))
    .leftJoin(tenantsTable, and(eq(tenantModulesTable.tenantId, tenantsTable.id), eq(tenantsTable.isActive, true), inArray(tenantsTable.status, [...NOTIFIABLE_TENANT_STATUSES])))
    .leftJoin(tenantOwnerInvitesTable, and(eq(tenantOwnerInvitesTable.tenantId, tenantsTable.id), inArray(tenantOwnerInvitesTable.status, [...ACTIVE_OWNER_INVITE_STATUSES])))
    .groupBy(modulesTable.key, modulesTable.name)
    .orderBy(asc(modulesTable.name));

  return rows.map((row) => ({
    key: row.moduleKey,
    name: row.moduleName,
    recipientCount: Number(row.recipientCount ?? 0),
  }));
}

async function listDispatchRows(): Promise<PlatformNotificationDispatchRow[]> {
  const rows = await db
    .select({
      id: platformNotificationDispatchesTable.id,
      templateKey: platformNotificationDispatchesTable.templateKey,
      audienceType: platformNotificationDispatchesTable.audienceType,
      scheduleType: platformNotificationDispatchesTable.scheduleType,
      status: platformNotificationDispatchesTable.status,
      title: platformNotificationDispatchesTable.title,
      channels: platformNotificationDispatchesTable.channels,
      tenantCount: platformNotificationDispatchesTable.tenantCount,
      recipientCount: platformNotificationDispatchesTable.recipientCount,
      scheduledAt: platformNotificationDispatchesTable.scheduledAt,
      queuedAt: platformNotificationDispatchesTable.queuedAt,
      createdAt: platformNotificationDispatchesTable.createdAt,
    })
    .from(platformNotificationDispatchesTable)
    .orderBy(desc(platformNotificationDispatchesTable.createdAt))
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    templateKey: row.templateKey,
    audienceType: row.audienceType,
    scheduleType: row.scheduleType,
    status: row.status,
    title: row.title,
    channels: row.channels,
    tenantCount: row.tenantCount,
    recipientCount: row.recipientCount,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    queuedAt: row.queuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listPlatformNotificationCenter(): Promise<PlatformNotificationCenter> {
  await requirePlatformAdmin();

  const [platformUsers, tenantOwners, plansRaw, modules, dispatches] = await Promise.all([
    listPlatformUsersPreview(),
    listTenantOwnersPreview(),
    db
      .select({ key: plansTable.key, name: plansTable.name })
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.sortOrder), asc(plansTable.name)),
    listModuleOptionsWithCounts(),
    listDispatchRows(),
  ]);

  const readinessIssueOwners = tenantOwners.filter((owner) => owner.readinessStatus !== "ready");
  const plans = planOptionsFromOwners(tenantOwners, plansRaw);

  return {
    generatedAt: new Date().toISOString(),
    templates: TEMPLATES,
    stats: {
      totalDispatches: dispatches.length,
      queued: dispatches.filter((dispatch) => dispatch.status === "queued").length,
      scheduled: dispatches.filter((dispatch) => dispatch.status === "scheduled").length,
      recipients: dispatches.reduce((total, dispatch) => total + dispatch.recipientCount, 0),
      tenantOwners: tenantOwners.length,
      readinessIssues: readinessIssueOwners.length,
      platformUsers: platformUsers.length,
    },
    platformUsers,
    tenantOwners,
    readinessIssueOwners,
    plans,
    modules,
    dispatches,
  };
}

export async function createPlatformNotificationDispatch(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const templateKey = normalizeTemplateKey(formValue(formData, "templateKey"));
  const template = templateFor(templateKey);
  const audienceType = normalizeAudienceType(formValue(formData, "audienceType"));
  const scheduleType = normalizeScheduleType(formValue(formData, "scheduleType"));
  const channels = normalizeChannels(formValues(formData, "channels"));
  const scheduledAt = optionalScheduledAt(formData, scheduleType);
  const title = (formValue(formData, "title") || template.title).slice(0, 180);
  const body = (formValue(formData, "body") || template.body).slice(0, 5000);
  const planKey = formValue(formData, "planKey");
  const moduleKey = formValue(formData, "moduleKey");
  const selectedTenantIds = formValues(formData, "tenantIds");

  if (!title || !body) {
    return { success: false, message: "Titel en bericht zijn verplicht." };
  }
  if (scheduleType === "scheduled" && !scheduledAt) {
    return { success: false, message: "Kies een geldig gepland verzendmoment." };
  }

  const recipients = await buildRecipients({ audienceType, selectedTenantIds, planKey, moduleKey });
  if (recipients.length === 0) {
    return { success: false, message: "Geen ontvangers gevonden voor deze selectie." };
  }

  const now = new Date();
  const status = scheduleType === "scheduled" ? "scheduled" : "queued";
  const deliveryStatus = scheduleType === "scheduled" ? "scheduled" : "queued";
  const targetCriteria = {
    selectedTenantIds,
    planKey: planKey || null,
    moduleKey: moduleKey || null,
    readiness: audienceType === "tenants_with_readiness_issue" ? ["warning", "blocked"] : null,
  };

  const [dispatch] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(platformNotificationDispatchesTable)
      .values({
        templateKey,
        audienceType,
        scheduleType,
        status,
        title,
        body,
        channels,
        targetCriteria,
        tenantCount: countUniqueTenants(recipients),
        recipientCount: recipients.length,
        createdByPlatformUserId: actor.id,
        scheduledAt,
        queuedAt: scheduleType === "immediate" ? now : null,
        metadata: {
          source: "platform_admin",
          pushDelivery: channels.includes("push") ? "not_configured" : null,
        },
      })
      .returning({ id: platformNotificationDispatchesTable.id });

    await tx.insert(platformNotificationRecipientsTable).values(
      recipients.map((recipient) => ({
        dispatchId: created.id,
        recipientType: recipient.recipientType,
        tenantId: recipient.tenantId,
        platformUserId: recipient.platformUserId,
        tenantOwnerInviteId: recipient.tenantOwnerInviteId,
        recipientUserId: recipient.recipientUserId,
        recipientEmail: recipient.recipientEmail,
        tenantName: recipient.tenantName,
        tenantSlug: recipient.tenantSlug,
        channels,
        deliveryStatus,
        metadata: recipient.metadata,
      })),
    );

    return [created];
  });

  await writePlatformNotificationAudit({
    actor,
    dispatchId: dispatch.id,
    action: "platform_notification_dispatch_created",
    metadata: {
      templateKey,
      audienceType,
      scheduleType,
      channels,
      recipientCount: recipients.length,
      tenantCount: countUniqueTenants(recipients),
      targetCriteria,
    },
  });

  revalidatePath("/platform/notifications");
  revalidatePath("/platform");
  return { success: true };
}
