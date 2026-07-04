"use server";

import {
  assignmentsTable,
  customersTable,
  db,
  modulesTable,
  objectsTable,
  organizationSettingsTable,
  tenantFirstRunStateTable,
  tenantModulesTable,
  tenantRegionsTable,
  tenantSectorsTable,
  tenantUsersTable,
  tenantsTable,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

const DEFAULT_BRAND_COLOR = "#081D3A";
const DEFAULT_ACCENT_COLOR = "#00B7B3";
const DEFAULT_FOOTER_TEXT =
  "Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.";
const DEFAULT_SIGNATURE = "Met vriendelijke groet,\nFieldgrid";

export const FIRST_RUN_WIZARD_STEPS = [
  {
    id: "company",
    title: "Bedrijfsgegevens",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "branding",
    title: "Branding",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "sectors",
    title: "Sectoren",
    href: "/instellingen/sectoren",
    required: true,
  },
  {
    id: "regions",
    title: "Regio's",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "users",
    title: "Gebruikers",
    href: "/instellingen/gebruikers",
    required: true,
  },
  {
    id: "modules",
    title: "Modules",
    href: "/platform",
    required: true,
  },
  {
    id: "basics",
    title: "Basisinstellingen",
    href: "/instellingen/organisatie",
    required: true,
  },
  {
    id: "first_data",
    title: "Eerste klant/object/opdracht",
    href: "/customers",
    required: false,
  },
] as const;

const DEFAULT_FIRST_RUN_STEPS = FIRST_RUN_WIZARD_STEPS.filter((step) => step.required).map(
  (step) => step.id,
);

const ALL_FIRST_RUN_STEPS = FIRST_RUN_WIZARD_STEPS.map((step) => step.id);

export type TenantFirstRunStep = (typeof FIRST_RUN_WIZARD_STEPS)[number]["id"];

export type TenantFirstRunStateRow = {
  tenantId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  requiredSteps: string[];
  completedSteps: string[];
  completedAt: string | null;
  updatedAt: string;
};

export type TenantFirstRunWizardStep = {
  id: TenantFirstRunStep;
  title: string;
  href: string;
  required: boolean;
  done: boolean;
  autoDone: boolean;
  manualDone: boolean;
  warning: string | null;
};

export type TenantFirstRunWizard = TenantFirstRunStateRow & {
  tenantName: string;
  readinessScore: number;
  requiredDone: number;
  requiredTotal: number;
  readinessWarnings: string[];
  settings: {
    companyName: string;
    companyAddress: string;
    kvkNumber: string;
    btwNumber: string;
    logoUrl: string;
    brandColor: string;
    accentColor: string;
    emailSender: string;
    paymentTermDays: number;
    availabilityAdvanceDays: number;
    emailFooterText: string;
    emailSignature: string;
  };
  counts: {
    sectors: number;
    regions: number;
    users: number;
    modules: number;
    customers: number;
    objects: number;
    assignments: number;
  };
  regionNames: string[];
  moduleNames: string[];
  steps: TenantFirstRunWizardStep[];
};

type FirstRunSnapshot = {
  tenantName: string;
  settings: TenantFirstRunWizard["settings"];
  counts: TenantFirstRunWizard["counts"];
  regionNames: string[];
  moduleNames: string[];
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStepIds(values: unknown, fallback: readonly TenantFirstRunStep[] = []): TenantFirstRunStep[] {
  const allowed = new Set<TenantFirstRunStep>(ALL_FIRST_RUN_STEPS);
  const seen = new Set<TenantFirstRunStep>();
  const steps: TenantFirstRunStep[] = [];

  for (const value of [...stringArray(values), ...fallback]) {
    if (!allowed.has(value as TenantFirstRunStep)) continue;
    const step = value as TenantFirstRunStep;
    if (seen.has(step)) continue;
    seen.add(step);
    steps.push(step);
  }

  return steps;
}

function normalizeStep(value: string): TenantFirstRunStep | null {
  return ALL_FIRST_RUN_STEPS.includes(value as TenantFirstRunStep) ? (value as TenantFirstRunStep) : null;
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeRegionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanText(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, max) : "";
}

function cleanNullableText(value: FormDataEntryValue | null, max: number): string | null {
  const cleaned = cleanText(value, max);
  return cleaned ? cleaned : null;
}

function cleanColor(value: FormDataEntryValue | null, fallback: string): string {
  const color = cleanText(value, 20);
  return /^#[0-9a-fA-F]{6}$/u.test(color) ? color.toUpperCase() : fallback;
}

function cleanNumber(value: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseRegionNames(value: FormDataEntryValue | null): string[] {
  const raw = typeof value === "string" ? value : "";
  const seen = new Set<string>();
  const names: string[] = [];

  for (const chunk of raw.split(/[\n,;]+/u)) {
    const name = chunk.trim().replace(/\s+/g, " ").slice(0, 120);
    const normalized = normalizeRegionName(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }

  return names;
}

function revalidateFirstRun(): void {
  revalidatePath("/first-run");
  revalidatePath("/dashboard");
  revalidatePath("/instellingen/organisatie");
  revalidatePath("/instellingen/gebruikers");
  revalidatePath("/instellingen/sectoren");
  revalidatePath("/customers");
  revalidatePath("/objects");
  revalidatePath("/assignments");
  revalidatePath("/platform");
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

  const requiredSteps = uniqueStepIds(state.requiredSteps, DEFAULT_FIRST_RUN_STEPS);
  const completedSteps = uniqueStepIds(state.completedSteps);

  if (
    !sameArray(requiredSteps, stringArray(state.requiredSteps)) ||
    !sameArray(completedSteps, stringArray(state.completedSteps))
  ) {
    await db
      .update(tenantFirstRunStateTable)
      .set({
        requiredSteps,
        completedSteps,
        updatedAt: new Date(),
      })
      .where(eq(tenantFirstRunStateTable.tenantId, tenantId));
  }

  return { ...state, requiredSteps, completedSteps };
}

function toStateRow(state: Awaited<ReturnType<typeof ensureTenantFirstRunState>>): TenantFirstRunStateRow {
  return {
    tenantId: state.tenantId,
    status: state.status,
    requiredSteps: state.requiredSteps,
    completedSteps: state.completedSteps,
    completedAt: state.completedAt?.toISOString() ?? null,
    updatedAt: state.updatedAt.toISOString(),
  };
}

async function ensureTenantRegions(tenantId: string, names: readonly string[]): Promise<void> {
  if (!names.length) return;

  const normalizedNames = names.map(normalizeRegionName);
  const existingRows = await db
    .select({ normalizedName: tenantRegionsTable.normalizedName })
    .from(tenantRegionsTable)
    .where(and(eq(tenantRegionsTable.tenantId, tenantId), inArray(tenantRegionsTable.normalizedName, normalizedNames)));

  const existing = new Set(existingRows.map((row) => row.normalizedName));
  const missing = names.filter((name) => !existing.has(normalizeRegionName(name)));

  if (!missing.length) return;

  await db
    .insert(tenantRegionsTable)
    .values(
      missing.map((name) => ({
        tenantId,
        name,
        normalizedName: normalizeRegionName(name),
        source: "manual" as const,
      })),
    )
    .onConflictDoNothing();
}

async function upsertOrganizationSettings(
  tenantId: string,
  values: {
    naam: string;
    adres: string | null;
    kvkNummer: string | null;
    btwNummer: string | null;
    logoUrl: string | null;
    emailAfzender: string | null;
    betaaltermijnDagen: number;
    availabilityAdvanceDays: number;
    emailTemplateBrandColor: string;
    emailTemplateAccentColor: string;
    emailTemplateFooterText: string;
    emailTemplateSignature: string;
  },
): Promise<void> {
  const [existing] = await db
    .select({ id: organizationSettingsTable.id })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  if (existing) {
    await db
      .update(organizationSettingsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(organizationSettingsTable.id, existing.id), eq(organizationSettingsTable.tenantId, tenantId)));
    return;
  }

  await db.insert(organizationSettingsTable).values({ tenantId, ...values });
}

async function loadFirstRunSnapshot(tenantId: string): Promise<FirstRunSnapshot> {
  const [
    [tenant],
    [settings],
    regionRows,
    moduleRows,
    [sectorCount],
    [userCount],
    [customerCount],
    [objectCount],
    [assignmentCount],
  ] = await Promise.all([
    db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db
      .select()
      .from(organizationSettingsTable)
      .where(eq(organizationSettingsTable.tenantId, tenantId))
      .limit(1),
    db
      .select({ name: tenantRegionsTable.name })
      .from(tenantRegionsTable)
      .where(and(eq(tenantRegionsTable.tenantId, tenantId), eq(tenantRegionsTable.isActive, true)))
      .orderBy(asc(tenantRegionsTable.sortOrder), asc(tenantRegionsTable.name)),
    db
      .select({ name: modulesTable.name })
      .from(tenantModulesTable)
      .innerJoin(modulesTable, eq(tenantModulesTable.moduleId, modulesTable.id))
      .where(and(eq(tenantModulesTable.tenantId, tenantId), eq(tenantModulesTable.isEnabled, true)))
      .orderBy(asc(modulesTable.name)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantSectorsTable)
      .where(and(eq(tenantSectorsTable.tenantId, tenantId), eq(tenantSectorsTable.isEnabled, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantUsersTable)
      .where(and(eq(tenantUsersTable.tenantId, tenantId), eq(tenantUsersTable.status, "active"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(customersTable)
      .where(and(eq(customersTable.tenantId, tenantId), eq(customersTable.isActive, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectsTable)
      .where(and(eq(objectsTable.tenantId, tenantId), eq(objectsTable.isActive, true))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.tenantId, tenantId), eq(assignmentsTable.isActive, true))),
  ]);

  const tenantName = tenant?.name ?? "";
  const regionNames = regionRows.map((row) => row.name);
  const moduleNames = moduleRows.map((row) => row.name);

  return {
    tenantName,
    settings: {
      companyName: settings?.naam?.trim() || tenantName,
      companyAddress: settings?.adres ?? "",
      kvkNumber: settings?.kvkNummer ?? "",
      btwNumber: settings?.btwNummer ?? "",
      logoUrl: settings?.logoUrl ?? "",
      brandColor: settings?.emailTemplateBrandColor ?? DEFAULT_BRAND_COLOR,
      accentColor: settings?.emailTemplateAccentColor ?? DEFAULT_ACCENT_COLOR,
      emailSender: settings?.emailAfzender ?? "",
      paymentTermDays: settings?.betaaltermijnDagen ?? 30,
      availabilityAdvanceDays: settings?.availabilityAdvanceDays ?? 60,
      emailFooterText: settings?.emailTemplateFooterText ?? DEFAULT_FOOTER_TEXT,
      emailSignature: settings?.emailTemplateSignature ?? DEFAULT_SIGNATURE,
    },
    counts: {
      sectors: Number(sectorCount?.count ?? 0),
      regions: regionNames.length,
      users: Number(userCount?.count ?? 0),
      modules: moduleNames.length,
      customers: Number(customerCount?.count ?? 0),
      objects: Number(objectCount?.count ?? 0),
      assignments: Number(assignmentCount?.count ?? 0),
    },
    regionNames,
    moduleNames,
  };
}

function buildWizard(
  state: Awaited<ReturnType<typeof ensureTenantFirstRunState>>,
  snapshot: FirstRunSnapshot,
): TenantFirstRunWizard {
  const autoStatus: Record<TenantFirstRunStep, boolean> = {
    company: Boolean(snapshot.settings.companyName.trim() && snapshot.settings.companyAddress.trim()),
    branding:
      Boolean(snapshot.settings.logoUrl.trim()) ||
      snapshot.settings.brandColor !== DEFAULT_BRAND_COLOR ||
      snapshot.settings.accentColor !== DEFAULT_ACCENT_COLOR ||
      !snapshot.settings.emailSignature.includes("Fieldgrid"),
    sectors: snapshot.counts.sectors > 0,
    regions: snapshot.counts.regions > 0,
    users: snapshot.counts.users > 0,
    modules: snapshot.counts.modules > 0,
    basics: Boolean(snapshot.settings.emailSender.trim()) && snapshot.settings.paymentTermDays > 0,
    first_data: snapshot.counts.customers > 0 || snapshot.counts.objects > 0 || snapshot.counts.assignments > 0,
  };

  const warnings: Record<TenantFirstRunStep, string | null> = {
    company: autoStatus.company ? null : "Vul bedrijfsnaam en adres in.",
    branding: autoStatus.branding ? null : "Pas branding of handtekening aan voordat de tenant live gaat.",
    sectors: autoStatus.sectors ? null : "Schakel minimaal een sector in.",
    regions: autoStatus.regions ? null : "Maak minimaal een tenant-regio aan.",
    users: autoStatus.users ? null : "Voeg minimaal een actieve gebruiker toe.",
    modules: autoStatus.modules ? null : "Schakel minimaal een module in.",
    basics: autoStatus.basics ? null : "Vul afzender en basisinstellingen aan.",
    first_data: autoStatus.first_data ? null : "Optioneel: maak alvast een eerste klant, object of opdracht aan.",
  };

  const completed = new Set(state.completedSteps);
  const steps = FIRST_RUN_WIZARD_STEPS.map<TenantFirstRunWizardStep>((step) => {
    const autoDone = autoStatus[step.id];
    const manualDone = completed.has(step.id);
    return {
      id: step.id,
      title: step.title,
      href: step.href,
      required: step.required,
      done: autoDone || manualDone,
      autoDone,
      manualDone,
      warning: warnings[step.id],
    };
  });

  const requiredSteps = steps.filter((step) => step.required);
  const requiredDone = requiredSteps.filter((step) => step.done).length;
  const requiredTotal = requiredSteps.length;

  return {
    ...toStateRow(state),
    tenantName: snapshot.tenantName,
    readinessScore: Math.round((requiredDone / requiredTotal) * 100),
    requiredDone,
    requiredTotal,
    readinessWarnings: requiredSteps.flatMap((step) => (step.autoDone ? [] : [step.warning ?? step.title])),
    settings: snapshot.settings,
    counts: snapshot.counts,
    regionNames: snapshot.regionNames,
    moduleNames: snapshot.moduleNames,
    steps,
  };
}

async function buildAndPersistCompletion(
  tenantId: string,
  status: "in_progress" | "completed",
): Promise<ActionResult> {
  const state = await ensureTenantFirstRunState(tenantId);
  const snapshot = await loadFirstRunSnapshot(tenantId);
  const wizard = buildWizard(state, snapshot);
  const autoCompleted = wizard.steps.filter((step) => step.autoDone).map((step) => step.id);
  const completedSteps = uniqueStepIds([...state.completedSteps, ...autoCompleted]);
  const requiredComplete = state.requiredSteps.every((step) => completedSteps.includes(step));

  if (status === "completed" && !requiredComplete) {
    return { success: false, message: "Niet alle verplichte first-run stappen zijn klaar." };
  }

  await db
    .update(tenantFirstRunStateTable)
    .set({
      completedSteps,
      status: status === "completed" ? "completed" : state.status === "completed" ? "completed" : "in_progress",
      completedAt: status === "completed" ? new Date() : state.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(tenantFirstRunStateTable.tenantId, tenantId));

  revalidateFirstRun();
  return { success: true };
}

export async function getTenantFirstRunState(): Promise<TenantFirstRunStateRow> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const state = await ensureTenantFirstRunState(tenantId);
  return toStateRow(state);
}

export async function getTenantFirstRunWizard(): Promise<TenantFirstRunWizard> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();
  const [state, snapshot] = await Promise.all([
    ensureTenantFirstRunState(tenantId),
    loadFirstRunSnapshot(tenantId),
  ]);

  return buildWizard(state, snapshot);
}

export async function saveTenantFirstRunWizardDraft(formData: FormData): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();

  await upsertOrganizationSettings(tenantId, {
    naam: cleanText(formData.get("companyName"), 200),
    adres: cleanNullableText(formData.get("companyAddress"), 2000),
    kvkNummer: cleanNullableText(formData.get("kvkNumber"), 20),
    btwNummer: cleanNullableText(formData.get("btwNumber"), 30),
    logoUrl: cleanNullableText(formData.get("logoUrl"), 2000),
    emailAfzender: cleanNullableText(formData.get("emailSender"), 200),
    betaaltermijnDagen: cleanNumber(formData.get("paymentTermDays"), 1, 365, 30),
    availabilityAdvanceDays: cleanNumber(formData.get("availabilityAdvanceDays"), 7, 365, 60),
    emailTemplateBrandColor: cleanColor(formData.get("brandColor"), DEFAULT_BRAND_COLOR),
    emailTemplateAccentColor: cleanColor(formData.get("accentColor"), DEFAULT_ACCENT_COLOR),
    emailTemplateFooterText: cleanText(formData.get("emailFooterText"), 2000) || DEFAULT_FOOTER_TEXT,
    emailTemplateSignature: cleanText(formData.get("emailSignature"), 2000) || DEFAULT_SIGNATURE,
  });

  await ensureTenantRegions(tenantId, parseRegionNames(formData.get("regionNames")));

  return buildAndPersistCompletion(tenantId, "in_progress");
}

export async function finishTenantFirstRunWizard(_formData?: FormData): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  return buildAndPersistCompletion(tenantId, "completed");
}

export async function completeTenantFirstRunStep(formData: FormData): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const step = normalizeStep(String(formData.get("step") ?? ""));
  if (!step) return { success: false, message: "Onbekende onboardingstap." };

  const state = await ensureTenantFirstRunState(tenantId);
  const completedSteps = uniqueStepIds([...state.completedSteps, step]);
  const allDone = state.requiredSteps.every((requiredStep) => completedSteps.includes(requiredStep));

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
