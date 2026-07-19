"use server";

import { db } from "@workspace/db";
import {
  getTenantBranding,
  invoicesTable,
  assignmentsTable,
  customersTable,
  customerPaymentBatchItemsTable,
  customerPaymentBatchesTable,
  objectsTable,
  paymentsTable,
  paymentAllocationsTable,
  auditLogTable,
  invoicePaymentSettingsTable,
  invoiceTemplateSettingsTable,
  invoiceLineItemSnapshotsTable,
  tenantCompanySettingsTable,
  finalizeOfficialInvoice,
  claimOfficialInvoiceCollectionNumberInTransaction,
  cancelInvoiceAndReopenAssignment,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type InvoiceStatus,
} from "@workspace/db";
import {
  eq,
  ilike,
  or,
  and,
  asc,
  desc,
  sql,
  inArray,
  lt,
  type SQL,
} from "drizzle-orm";
import { emitInvoiceWorkflowEvent } from "@workspace/db/workflow-events";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requirePermission,
  hasPermission,
  hasPermissionFromRequest,
} from "@/lib/auth/permissions";
import {
  requireCurrentTenantId,
  requireCurrentTenantIdFromRequest,
} from "@/lib/auth/tenant";
import {
  sendEmailWithResult,
  buildInvoiceEmail,
  buildPaymentReminderEmail,
  klantPortalUrl,
} from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import {
  calculateInvoiceProposalForAssignment,
  type InvoiceProposalLineItem,
} from "@/lib/invoice-proposals";
import {
  requireSensitiveRuntimeAccess,
  requireSensitiveRuntimeAccessFromRequest,
} from "@/lib/security/sensitive-runtime";
import { toPlatformInvoiceMetadataDto } from "@/lib/security/safe-dtos";
import type { ActionResult } from "./customers";

export type { ActionResult, InvoiceStatus };

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

export type InvoicePdfPaymentSettings = {
  paymentProvider: "none" | "mollie";
  mollieEnabled: boolean;
  showPaymentLinkOnInvoice: boolean;
  showPaymentQrOnInvoice: boolean;
  paymentBlockTitle: string;
  paymentBlockText: string;
  paymentLinkLabel: string;
};

export type InvoicePdfCompanySnapshot = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  kvkNumber: string | null;
  vatNumber: string | null;
  iban: string | null;
  bic: string | null;
  administrationEmail: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultPaymentTermDays: number;
};

export type InvoicePdfTemplateSettings = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  introText: string | null;
  footerText: string | null;
  paymentInstruction: string;
  showLogo: boolean;
  showCompanyFooter: boolean;
  showKvkFooter: boolean;
  showVatFooter: boolean;
  showIbanFooter: boolean;
};

const DEFAULT_INVOICE_PDF_COMPANY: InvoicePdfCompanySnapshot = {
  legalName: "",
  tradeName: null,
  addressLine1: null,
  addressLine2: null,
  postalCode: null,
  city: null,
  country: "Nederland",
  kvkNumber: null,
  vatNumber: null,
  iban: null,
  bic: null,
  administrationEmail: null,
  phone: null,
  website: null,
  logoUrl: null,
  primaryColor: "#081D3A",
  secondaryColor: "#00B7B3",
  defaultPaymentTermDays: 30,
};

const DEFAULT_INVOICE_PDF_TEMPLATE: InvoicePdfTemplateSettings = {
  logoUrl: null,
  primaryColor: "#081D3A",
  secondaryColor: "#00B7B3",
  introText: null,
  footerText: null,
  paymentInstruction:
    "Gelieve het bedrag binnen {{payment_term_days}} dagen te voldoen onder vermelding van factuurnummer {{invoice_number}}.",
  showLogo: true,
  showCompanyFooter: true,
  showKvkFooter: true,
  showVatFooter: true,
  showIbanFooter: true,
};

const DEFAULT_INVOICE_PDF_PAYMENT_SETTINGS: InvoicePdfPaymentSettings = {
  paymentProvider: "none",
  mollieEnabled: false,
  showPaymentLinkOnInvoice: false,
  showPaymentQrOnInvoice: false,
  paymentBlockTitle: "Online betalen",
  paymentBlockText: "Betaal deze factuur veilig via de betaallink.",
  paymentLinkLabel: "Betaal factuur",
};

function parseAmountCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function centsToMollieValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  if (/[",\n\r]/u.test(text)) return `"${text.replace(/"/gu, '""')}"`;
  return text;
}

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Concept",
): string {
  return value?.trim() || fallback;
}

function addDaysAsIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizePaymentTermDays(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 30;
  return Math.min(365, Math.max(1, Math.round(value!)));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/u.test(value.trim())
    ? value.trim()
    : fallback;
}

function normalizeInvoicePdfCompany(
  value: Record<string, unknown> | null | undefined,
): InvoicePdfCompanySnapshot {
  return {
    legalName:
      nullableString(value?.legalName) ?? DEFAULT_INVOICE_PDF_COMPANY.legalName,
    tradeName: nullableString(value?.tradeName),
    addressLine1: nullableString(value?.addressLine1),
    addressLine2: nullableString(value?.addressLine2),
    postalCode: nullableString(value?.postalCode),
    city: nullableString(value?.city),
    country:
      nullableString(value?.country) ?? DEFAULT_INVOICE_PDF_COMPANY.country,
    kvkNumber: nullableString(value?.kvkNumber),
    vatNumber: nullableString(value?.vatNumber),
    iban: nullableString(value?.iban),
    bic: nullableString(value?.bic),
    administrationEmail: nullableString(value?.administrationEmail),
    phone: nullableString(value?.phone),
    website: nullableString(value?.website),
    logoUrl: nullableString(value?.logoUrl),
    primaryColor: safeHexColor(
      value?.primaryColor,
      DEFAULT_INVOICE_PDF_COMPANY.primaryColor,
    ),
    secondaryColor: safeHexColor(
      value?.secondaryColor,
      DEFAULT_INVOICE_PDF_COMPANY.secondaryColor,
    ),
    defaultPaymentTermDays: normalizePaymentTermDays(
      typeof value?.defaultPaymentTermDays === "number"
        ? value.defaultPaymentTermDays
        : Number(value?.defaultPaymentTermDays),
    ),
  };
}

function normalizeInvoicePdfTemplate(
  value: Record<string, unknown> | null | undefined,
): InvoicePdfTemplateSettings {
  return {
    logoUrl: nullableString(value?.logoUrl),
    primaryColor: safeHexColor(
      value?.primaryColor,
      DEFAULT_INVOICE_PDF_TEMPLATE.primaryColor,
    ),
    secondaryColor: safeHexColor(
      value?.secondaryColor,
      DEFAULT_INVOICE_PDF_TEMPLATE.secondaryColor,
    ),
    introText: nullableString(value?.introText),
    footerText: nullableString(value?.footerText),
    paymentInstruction:
      nullableString(value?.paymentInstruction) ??
      DEFAULT_INVOICE_PDF_TEMPLATE.paymentInstruction,
    showLogo: value?.showLogo !== false,
    showCompanyFooter: value?.showCompanyFooter !== false,
    showKvkFooter: value?.showKvkFooter !== false,
    showVatFooter: value?.showVatFooter !== false,
    showIbanFooter: value?.showIbanFooter !== false,
  };
}

async function getDefaultInvoiceDueDate(
  tenantId: string,
): Promise<{ dueDate: string; paymentTermDays: number }> {
  const [settings] = await db
    .select({
      defaultPaymentTermDays: tenantCompanySettingsTable.defaultPaymentTermDays,
    })
    .from(tenantCompanySettingsTable)
    .where(eq(tenantCompanySettingsTable.tenantId, tenantId))
    .limit(1);

  const paymentTermDays = normalizePaymentTermDays(
    settings?.defaultPaymentTermDays,
  );
  return { dueDate: addDaysAsIsoDate(paymentTermDays), paymentTermDays };
}

async function getInvoiceCompanySettingsForTenant(
  tenantId: string,
): Promise<InvoicePdfCompanySnapshot> {
  const [settings] = await db
    .select({
      legalName: tenantCompanySettingsTable.legalName,
      tradeName: tenantCompanySettingsTable.tradeName,
      addressLine1: tenantCompanySettingsTable.addressLine1,
      addressLine2: tenantCompanySettingsTable.addressLine2,
      postalCode: tenantCompanySettingsTable.postalCode,
      city: tenantCompanySettingsTable.city,
      country: tenantCompanySettingsTable.country,
      kvkNumber: tenantCompanySettingsTable.kvkNumber,
      vatNumber: tenantCompanySettingsTable.vatNumber,
      iban: tenantCompanySettingsTable.iban,
      bic: tenantCompanySettingsTable.bic,
      administrationEmail: tenantCompanySettingsTable.administrationEmail,
      phone: tenantCompanySettingsTable.phone,
      website: tenantCompanySettingsTable.website,
      logoUrl: tenantCompanySettingsTable.logoUrl,
      primaryColor: tenantCompanySettingsTable.primaryColor,
      secondaryColor: tenantCompanySettingsTable.secondaryColor,
      defaultPaymentTermDays: tenantCompanySettingsTable.defaultPaymentTermDays,
    })
    .from(tenantCompanySettingsTable)
    .where(eq(tenantCompanySettingsTable.tenantId, tenantId))
    .limit(1);

  return normalizeInvoicePdfCompany(settings ?? null);
}

async function getInvoiceTemplateSettingsForTenant(
  tenantId: string,
): Promise<InvoicePdfTemplateSettings> {
  const [settings] = await db
    .select({
      logoUrl: invoiceTemplateSettingsTable.logoUrl,
      primaryColor: invoiceTemplateSettingsTable.primaryColor,
      secondaryColor: invoiceTemplateSettingsTable.secondaryColor,
      introText: invoiceTemplateSettingsTable.introText,
      footerText: invoiceTemplateSettingsTable.footerText,
      paymentInstruction: invoiceTemplateSettingsTable.paymentInstruction,
      showLogo: invoiceTemplateSettingsTable.showLogo,
      showCompanyFooter: invoiceTemplateSettingsTable.showCompanyFooter,
      showKvkFooter: invoiceTemplateSettingsTable.showKvkFooter,
      showVatFooter: invoiceTemplateSettingsTable.showVatFooter,
      showIbanFooter: invoiceTemplateSettingsTable.showIbanFooter,
    })
    .from(invoiceTemplateSettingsTable)
    .where(eq(invoiceTemplateSettingsTable.tenantId, tenantId))
    .limit(1);

  return normalizeInvoicePdfTemplate(settings ?? null);
}

function normalizeInvoicePdfPaymentSettings(
  value: Record<string, unknown> | null | undefined,
): InvoicePdfPaymentSettings {
  return {
    paymentProvider: value?.paymentProvider === "mollie" ? "mollie" : "none",
    mollieEnabled: value?.mollieEnabled === true,
    showPaymentLinkOnInvoice: value?.showPaymentLinkOnInvoice === true,
    showPaymentQrOnInvoice: value?.showPaymentQrOnInvoice === true,
    paymentBlockTitle:
      typeof value?.paymentBlockTitle === "string" &&
      value.paymentBlockTitle.trim()
        ? value.paymentBlockTitle.trim()
        : DEFAULT_INVOICE_PDF_PAYMENT_SETTINGS.paymentBlockTitle,
    paymentBlockText:
      typeof value?.paymentBlockText === "string" &&
      value.paymentBlockText.trim()
        ? value.paymentBlockText.trim()
        : DEFAULT_INVOICE_PDF_PAYMENT_SETTINGS.paymentBlockText,
    paymentLinkLabel:
      typeof value?.paymentLinkLabel === "string" &&
      value.paymentLinkLabel.trim()
        ? value.paymentLinkLabel.trim()
        : DEFAULT_INVOICE_PDF_PAYMENT_SETTINGS.paymentLinkLabel,
  };
}

async function getInvoicePaymentSettingsForTenant(
  tenantId: string,
): Promise<InvoicePdfPaymentSettings> {
  const [settings] = await db
    .select({
      paymentProvider: invoicePaymentSettingsTable.paymentProvider,
      mollieEnabled: invoicePaymentSettingsTable.mollieEnabled,
      showPaymentLinkOnInvoice:
        invoicePaymentSettingsTable.showPaymentLinkOnInvoice,
      showPaymentQrOnInvoice:
        invoicePaymentSettingsTable.showPaymentQrOnInvoice,
      paymentBlockTitle: invoicePaymentSettingsTable.paymentBlockTitle,
      paymentBlockText: invoicePaymentSettingsTable.paymentBlockText,
      paymentLinkLabel: invoicePaymentSettingsTable.paymentLinkLabel,
    })
    .from(invoicePaymentSettingsTable)
    .where(eq(invoicePaymentSettingsTable.tenantId, tenantId))
    .limit(1);

  return normalizeInvoicePdfPaymentSettings(settings ?? null);
}

async function requireMolliePaymentsEnabled(
  tenantId: string,
): Promise<ActionResult | null> {
  const settings = await getInvoicePaymentSettingsForTenant(tenantId);
  if (settings.paymentProvider !== "mollie" || !settings.mollieEnabled) {
    return {
      success: false,
      message: "Mollie is niet actief in factuurinstellingen.",
    };
  }
  return null;
}

function exportStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function getBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost";
}

async function notifyInvoiceWorkflow(
  input: Parameters<typeof emitInvoiceWorkflowEvent>[0],
) {
  try {
    await emitInvoiceWorkflowEvent(input);
  } catch (error) {
    console.error("invoice workflow notification failed", {
      eventKey: input.eventKey,
      invoiceId: input.invoiceId,
      error,
    });
  }
}

async function getInvoiceAssignmentForCurrentTenant(
  invoiceId: string,
): Promise<{
  assignmentId: string;
  status: InvoiceStatus;
  invoiceNumber: string | null;
  finalizedAt: Date | null;
} | null> {
  const tenantId = await requireCurrentTenantId();
  const [invoice] = await db
    .select({
      assignmentId: invoicesTable.assignmentId,
      status: invoicesTable.status,
      invoiceNumber: invoicesTable.invoiceNumber,
      finalizedAt: invoicesTable.finalizedAt,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  return invoice
    ? {
        assignmentId: invoice.assignmentId,
        status: invoice.status as InvoiceStatus,
        invoiceNumber: invoice.invoiceNumber ?? null,
        finalizedAt: invoice.finalizedAt ?? null,
      }
    : null;
}

async function getOpenPaymentCheckoutUrlForCurrentTenant(
  invoiceId: string,
  tenantIdOverride?: string,
): Promise<string | null> {
  const tenantId = tenantIdOverride ?? (await requireCurrentTenantId());
  const [payment] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(paymentsTable.invoiceId, invoiceId),
        eq(paymentsTable.status, "open"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  return payment?.checkoutUrl ?? null;
}

async function getInvoicePdfLineItems(input: {
  tenantId: string;
  invoiceId: string;
  assignmentId: string;
  vatPercentage: string;
}): Promise<InvoiceProposalLineItem[]> {
  const snapshotRows = await db
    .select({
      category: invoiceLineItemSnapshotsTable.category,
      description: invoiceLineItemSnapshotsTable.description,
      taskCodeCode: invoiceLineItemSnapshotsTable.taskCodeCode,
      quantity: invoiceLineItemSnapshotsTable.quantity,
      unitPrice: invoiceLineItemSnapshotsTable.unitPrice,
      totalPrice: invoiceLineItemSnapshotsTable.totalPrice,
      invoiceable: invoiceLineItemSnapshotsTable.invoiceable,
    })
    .from(invoiceLineItemSnapshotsTable)
    .where(
      and(
        eq(invoiceLineItemSnapshotsTable.tenantId, input.tenantId),
        eq(invoiceLineItemSnapshotsTable.invoiceId, input.invoiceId),
      ),
    )
    .orderBy(asc(invoiceLineItemSnapshotsTable.sortOrder));

  if (snapshotRows.length > 0) {
    return snapshotRows.map((row) => ({
      category:
        row.category === "extra_work" ||
        row.category === "material" ||
        row.category === "inventory"
          ? row.category
          : "task",
      taskCodeCode: row.taskCodeCode ?? null,
      taskCodeName: row.description,
      description: row.description,
      quantity: row.quantity ?? "1",
      unitPrice: row.unitPrice ?? "0",
      price: row.totalPrice ?? "0",
      invoiceable: row.invoiceable,
    }));
  }

  const proposal = await calculateInvoiceProposalForAssignment(
    input.assignmentId,
    parseFloat(input.vatPercentage ?? "21"),
  );
  return proposal.lineItems;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  assignmentId: string;
  assignmentCode: string;
  amount: string;
  vatPercentage: string;
  vatAmount: string;
  totalAmount: string;
  status: InvoiceStatus;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
};

export type InvoiceDetail = {
  id: string;
  brandName: string;
  invoiceNumber: string;
  officialInvoiceNumber: string | null;
  finalizedAt: string | null;
  customerId: string;
  customerName: string;
  customerAddress: string | null;
  customerCity: string | null;
  customerPostalCode: string | null;
  customerEmail: string | null;
  assignmentId: string;
  assignmentCode: string;
  assignmentTitle: string;
  scheduledDate: string | null;
  objectName: string | null;
  amount: string;
  vatPercentage: string;
  vatAmount: string;
  totalAmount: string;
  status: InvoiceStatus;
  dueDate: string;
  paidDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  paymentUrl: string | null;
  paymentSettings: InvoicePdfPaymentSettings;
  companySnapshot: InvoicePdfCompanySnapshot;
  templateSettings: InvoicePdfTemplateSettings;
  lineItems: InvoiceProposalLineItem[];
};

export type InvoiceSummary = {
  draftCount: number;
  draftAmount: string;
  sentCount: number;
  sentAmount: string;
  paidTotal: string;
  paidThisMonth: string;
  totalCount: number;
};

export type InvoiceStatusEvent = {
  action: string;
  label: string;
  timestamp: string;
};

export type AssignmentInvoiceData = {
  customerId: string;
  customerName: string;
  assignmentTitle: string;
  assignmentCode: string;
  suggestedAmount: string;
  lineItems: InvoiceProposalLineItem[];
};

export type CollectiveInvoiceCandidate = {
  id: string;
  invoiceNumber: string;
  assignmentId: string;
  assignmentCode: string;
  customerId: string;
  customerName: string;
  objectId: string | null;
  objectName: string | null;
  scheduledDate: string | null;
  amount: string;
  vatAmount: string;
  totalAmount: string;
  dueDate: string;
};

export type CollectiveInvoiceBatchRow = {
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  amountCents: number;
  subtotalCents: number;
  vatCents: number;
  discountCents: number;
  surchargeCents: number;
  checkoutUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  objectName: string | null;
  createdAt: string;
  invoiceCount: number;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listInvoices(params: {
  page?: number;
  search?: string;
  status?: string;
}): Promise<{ rows: InvoiceRow[]; total: number }> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return { rows: [], total: 0 };

  const tenantId = await requireCurrentTenantId();
  const { page = 1, search = "", status = "" } = params;

  const conditions = [eq(assignmentsTable.tenantId, tenantId)];
  if (search.trim()) {
    const searchCondition = or(
      ilike(invoicesTable.invoiceNumber, `%${search.trim()}%`),
      ilike(customersTable.name, `%${search.trim()}%`),
      ilike(assignmentsTable.code, `%${search.trim()}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (
    status &&
    (["draft", "sent", "paid", "cancelled"] as string[]).includes(status)
  ) {
    conditions.push(eq(invoicesTable.status, status));
  }

  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        customerId: invoicesTable.customerId,
        customerName: customersTable.name,
        assignmentId: invoicesTable.assignmentId,
        assignmentCode: assignmentsTable.code,
        amount: invoicesTable.amount,
        vatPercentage: invoicesTable.vatPercentage,
        vatAmount: invoicesTable.vatAmount,
        totalAmount: invoicesTable.totalAmount,
        status: invoicesTable.status,
        dueDate: invoicesTable.dueDate,
        paidDate: invoicesTable.paidDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .innerJoin(
        customersTable,
        eq(invoicesTable.customerId, customersTable.id),
      )
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .where(where)
      .orderBy(desc(invoicesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoicesTable)
      .innerJoin(
        customersTable,
        eq(invoicesTable.customerId, customersTable.id),
      )
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      invoiceNumber: displayInvoiceNumber(r.invoiceNumber),
      customerId: r.customerId,
      customerName: r.customerName ?? "",
      assignmentId: r.assignmentId,
      assignmentCode: r.assignmentCode,
      amount: r.amount ?? "0",
      vatPercentage: r.vatPercentage ?? "21",
      vatAmount: r.vatAmount ?? "0",
      totalAmount: r.totalAmount ?? "0",
      status: r.status as InvoiceStatus,
      dueDate: r.dueDate,
      paidDate: r.paidDate ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: count,
  };
}

export async function exportInvoices(params: {
  search?: string;
  status?: string;
}): Promise<ActionResult<{ csv: string; filename: string }>> {
  await requirePermission("invoices", "read");

  const tenantId = await requireCurrentTenantId();
  const { search = "", status = "" } = params;
  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_invoices",
    accessLevel: "export",
    resourceType: "invoices",
    exportDownload: true,
    metadata: { search, status, rowLimit: EXPORT_LIMIT },
  });
  const conditions: SQL[] = [eq(assignmentsTable.tenantId, tenantId)];

  if (search.trim()) {
    const searchCondition = or(
      ilike(invoicesTable.invoiceNumber, `%${search.trim()}%`),
      ilike(customersTable.name, `%${search.trim()}%`),
      ilike(assignmentsTable.code, `%${search.trim()}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (
    status &&
    (["draft", "sent", "paid", "cancelled"] as string[]).includes(status)
  ) {
    conditions.push(eq(invoicesTable.status, status));
  }

  const rows = await db
    .select({
      invoiceNumber: invoicesTable.invoiceNumber,
      customerName: customersTable.name,
      assignmentCode: assignmentsTable.code,
      amount: invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      dueDate: invoicesTable.dueDate,
      paidDate: invoicesTable.paidDate,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(and(...conditions))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(EXPORT_LIMIT);

  const headers = [
    "Factuurnummer",
    "Klant",
    "Opdracht",
    "Subtotaal",
    "BTW percentage",
    "BTW bedrag",
    "Totaal",
    "Status",
    "Vervaldatum",
    "Betaaldatum",
    "Aangemaakt op",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.invoiceNumber,
        row.customerName,
        row.assignmentCode,
        row.amount ?? "0",
        row.vatPercentage ?? "21",
        row.vatAmount ?? "0",
        row.totalAmount ?? "0",
        row.status,
        row.dueDate,
        row.paidDate ?? "",
        row.createdAt.toISOString().slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await db.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "export_csv",
      resource: "invoices",
      metadata: { search, status, rowCount: rows.length },
    });
  }

  return {
    success: true,
    data: { csv, filename: `facturen_${exportStamp()}.csv` },
  };
}

export async function getInvoice(
  id: string,
  options: { request?: Request } = {},
): Promise<InvoiceDetail | null> {
  const canRead = options.request
    ? await hasPermissionFromRequest(options.request, "invoices", "read")
    : await hasPermission("invoices", "read");
  if (!canRead) return null;

  const tenantId = options.request
    ? await requireCurrentTenantIdFromRequest(options.request)
    : await requireCurrentTenantId();
  const [row] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      finalizedAt: invoicesTable.finalizedAt,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      customerAddress: customersTable.address,
      customerCity: customersTable.city,
      customerPostalCode: customersTable.postalCode,
      customerEmail: customersTable.contactEmail,
      assignmentId: invoicesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
      amount: invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      dueDate: invoicesTable.dueDate,
      paidDate: invoicesTable.paidDate,
      notes: invoicesTable.notes,
      createdAt: invoicesTable.createdAt,
      updatedAt: invoicesTable.updatedAt,
      companySnapshotJson: invoicesTable.companySnapshotJson,
      paymentSettingsSnapshotJson: invoicesTable.paymentSettingsSnapshotJson,
      templateSnapshotJson: invoicesTable.templateSnapshotJson,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(eq(invoicesTable.id, id), eq(assignmentsTable.tenantId, tenantId)),
    )
    .limit(1);

  if (!row) return null;

  const sensitiveDecision = options.request
    ? await requireSensitiveRuntimeAccessFromRequest(options.request, {
        tenantId,
        scope: "tenant_invoices",
        accessLevel: "masked_read",
        resourceType: "invoices",
        resourceId: id,
      })
    : await requireSensitiveRuntimeAccess({
        tenantId,
        scope: "tenant_invoices",
        accessLevel: "masked_read",
        resourceType: "invoices",
        resourceId: id,
      });

  const [
    lineItems,
    branding,
    currentCompanySettings,
    currentTemplateSettings,
    currentPaymentSettings,
    paymentUrl,
  ] = await Promise.all([
    getInvoicePdfLineItems({
      tenantId,
      invoiceId: row.id,
      assignmentId: row.assignmentId,
      vatPercentage: row.vatPercentage ?? "21",
    }),
    getTenantBranding(tenantId),
    getInvoiceCompanySettingsForTenant(tenantId),
    getInvoiceTemplateSettingsForTenant(tenantId),
    getInvoicePaymentSettingsForTenant(tenantId),
    getOpenPaymentCheckoutUrlForCurrentTenant(id, tenantId),
  ]);
  const companySnapshot = row.companySnapshotJson
    ? normalizeInvoicePdfCompany(row.companySnapshotJson)
    : currentCompanySettings;
  const templateSettings = row.templateSnapshotJson
    ? normalizeInvoicePdfTemplate(row.templateSnapshotJson)
    : currentTemplateSettings;
  const paymentSettings = row.paymentSettingsSnapshotJson
    ? normalizeInvoicePdfPaymentSettings(row.paymentSettingsSnapshotJson)
    : currentPaymentSettings;
  const brandName =
    companySnapshot.tradeName ||
    companySnapshot.legalName ||
    branding.displayName;

  const detail: InvoiceDetail = {
    id: row.id,
    brandName,
    invoiceNumber: displayInvoiceNumber(
      row.invoiceNumber,
      `Factuur-${row.id.slice(0, 8)}`,
    ),
    officialInvoiceNumber: row.invoiceNumber ?? null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    customerId: row.customerId,
    customerName: row.customerName ?? "",
    customerAddress: row.customerAddress ?? null,
    customerCity: row.customerCity ?? null,
    customerPostalCode: row.customerPostalCode ?? null,
    customerEmail: row.customerEmail ?? null,
    assignmentId: row.assignmentId,
    assignmentCode: row.assignmentCode,
    assignmentTitle: row.assignmentTitle,
    scheduledDate: row.scheduledDate ?? null,
    objectName: row.objectName ?? null,
    amount: row.amount ?? "0",
    vatPercentage: row.vatPercentage ?? "21",
    vatAmount: row.vatAmount ?? "0",
    totalAmount: row.totalAmount ?? "0",
    status: row.status as InvoiceStatus,
    dueDate: row.dueDate,
    paidDate: row.paidDate ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    paymentUrl,
    paymentSettings,
    companySnapshot,
    templateSettings,
    lineItems,
  };
  return toPlatformInvoiceMetadataDto(detail, sensitiveDecision);
}

/**
 * Returns prefilled data for the create-invoice form:
 * customer info + suggested amount from invoiceable task codes.
 */
export async function getAssignmentInvoiceData(
  assignmentId: string,
): Promise<AssignmentInvoiceData | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const tenantId = await requireCurrentTenantId();
  const [row] = await db
    .select({
      customerId: assignmentsTable.customerId,
      customerName: customersTable.name,
      assignmentTitle: assignmentsTable.title,
      assignmentCode: assignmentsTable.code,
    })
    .from(assignmentsTable)
    .innerJoin(
      customersTable,
      eq(assignmentsTable.customerId, customersTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const proposal = await calculateInvoiceProposalForAssignment(assignmentId);

  return {
    customerId: row.customerId,
    customerName: row.customerName ?? "",
    assignmentTitle: row.assignmentTitle,
    assignmentCode: row.assignmentCode,
    suggestedAmount: proposal.amount,
    lineItems: proposal.lineItems,
  };
}

export async function getInvoiceDefaultPaymentTermDays(): Promise<number> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return 30;

  const tenantId = await requireCurrentTenantId();
  const [settings] = await db
    .select({
      defaultPaymentTermDays: tenantCompanySettingsTable.defaultPaymentTermDays,
    })
    .from(tenantCompanySettingsTable)
    .where(eq(tenantCompanySettingsTable.tenantId, tenantId))
    .limit(1);

  return normalizePaymentTermDays(settings?.defaultPaymentTermDays);
}

export async function getOutstandingInvoicesCount(): Promise<number> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return 0;

  const tenantId = await requireCurrentTenantId();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        inArray(invoicesTable.status, ["draft", "sent"]),
      ),
    );

  return count ?? 0;
}

export async function getOverdueInvoicesCount(): Promise<number> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return 0;

  const tenantId = await requireCurrentTenantId();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        eq(invoicesTable.status, "sent"),
        lt(invoicesTable.dueDate, today),
      ),
    );

  return count ?? 0;
}

export type SendRemindersResult = {
  sent: number;
  skippedNoEmail: number;
  failedSend: number;
};

export async function sendPaymentReminders(): Promise<
  ActionResult<SendRemindersResult>
> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const today = new Date().toISOString().slice(0, 10);

  const overdueRows = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount: invoicesTable.totalAmount,
      dueDate: invoicesTable.dueDate,
      customerEmail: customersTable.contactEmail,
      customerName: customersTable.name,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        eq(invoicesTable.status, "sent"),
        lt(invoicesTable.dueDate, today),
      ),
    )
    .orderBy(asc(invoicesTable.dueDate));

  // Split: no email vs has email
  const noEmailRows = overdueRows.filter((r) => !r.customerEmail);

  // Deduplicate by customer email — pick the oldest overdue invoice per customer
  // (rows already ordered by due_date asc, so first occurrence per email is the oldest)
  const seenEmails = new Set<string>();
  const deduped: typeof overdueRows = [];
  for (const row of overdueRows) {
    if (!row.customerEmail) continue;
    if (seenEmails.has(row.customerEmail)) continue;
    seenEmails.add(row.customerEmail);
    deduped.push(row);
  }

  let sent = 0;
  let failedSend = 0;

  for (const row of deduped) {
    const dueDateFormatted = new Date(
      row.dueDate + "T00:00:00",
    ).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const { subject, html } = buildPaymentReminderEmail({
      customerName: row.customerName ?? "",
      invoiceNumber: displayInvoiceNumber(
        row.invoiceNumber,
        `Factuur-${row.id.slice(0, 8)}`,
      ),
      totalAmount: row.totalAmount ?? "0",
      dueDate: dueDateFormatted,
    });

    const result = await sendEmailWithResult({
      to: row.customerEmail!,
      subject,
      html,
      tenantId,
      purpose: "invoice_payment_reminder",
    });

    if (result.success) {
      await db.insert(auditLogTable).values({
        userId: user.id,
        action: "send_payment_reminder",
        resource: "invoices",
        resourceId: row.id,
        metadata: { to: row.customerEmail, invoiceNumber: row.invoiceNumber },
      });
      sent++;
    } else {
      failedSend++;
    }
  }

  revalidatePath("/invoices");
  return {
    success: true,
    data: { sent, skippedNoEmail: noEmailRows.length, failedSend },
  };
}

export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) {
    return {
      draftCount: 0,
      draftAmount: "0.00",
      sentCount: 0,
      sentAmount: "0.00",
      paidTotal: "0.00",
      paidThisMonth: "0.00",
      totalCount: 0,
    };
  }

  const tenantId = await requireCurrentTenantId();
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [summary] = await db
    .select({
      draftCount: sql<number>`count(*) FILTER (WHERE ${invoicesTable.status} = 'draft')::int`,
      draftAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'draft'), 0)::text`,
      sentCount: sql<number>`count(*) FILTER (WHERE ${invoicesTable.status} = 'sent')::int`,
      sentAmount: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'sent'), 0)::text`,
      paidTotal: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'paid'), 0)::text`,
      paidThisMonth: sql<string>`coalesce(sum(${invoicesTable.totalAmount}) FILTER (WHERE ${invoicesTable.status} = 'paid' AND ${invoicesTable.paidDate} >= ${startOfMonth}), 0)::text`,
      totalCount: sql<number>`count(${invoicesTable.id})::int`,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(eq(assignmentsTable.tenantId, tenantId));

  return {
    draftCount: summary?.draftCount ?? 0,
    draftAmount: parseFloat(summary?.draftAmount ?? "0").toFixed(2),
    sentCount: summary?.sentCount ?? 0,
    sentAmount: parseFloat(summary?.sentAmount ?? "0").toFixed(2),
    paidTotal: parseFloat(summary?.paidTotal ?? "0").toFixed(2),
    paidThisMonth: parseFloat(summary?.paidThisMonth ?? "0").toFixed(2),
    totalCount: summary?.totalCount ?? 0,
  };
}

export async function listCollectiveInvoiceCandidates(): Promise<{
  candidates: CollectiveInvoiceCandidate[];
  batches: CollectiveInvoiceBatchRow[];
}> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return { candidates: [], batches: [] };

  const tenantId = await requireCurrentTenantId();
  const [invoiceRows, activeItems, batchRows] = await Promise.all([
    db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        assignmentId: invoicesTable.assignmentId,
        assignmentCode: assignmentsTable.code,
        customerId: invoicesTable.customerId,
        customerName: customersTable.name,
        objectId: assignmentsTable.objectId,
        objectName: objectsTable.name,
        scheduledDate: assignmentsTable.scheduledDate,
        amount: invoicesTable.amount,
        vatAmount: invoicesTable.vatAmount,
        totalAmount: invoicesTable.totalAmount,
        dueDate: invoicesTable.dueDate,
      })
      .from(invoicesTable)
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .innerJoin(
        customersTable,
        eq(invoicesTable.customerId, customersTable.id),
      )
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(
        and(
          eq(assignmentsTable.tenantId, tenantId),
          eq(invoicesTable.status, "sent"),
        ),
      )
      .orderBy(
        asc(customersTable.name),
        asc(assignmentsTable.scheduledDate),
        asc(invoicesTable.invoiceNumber),
      ),

    db
      .select({ invoiceId: customerPaymentBatchItemsTable.invoiceId })
      .from(customerPaymentBatchItemsTable)
      .innerJoin(
        customerPaymentBatchesTable,
        eq(
          customerPaymentBatchItemsTable.batchId,
          customerPaymentBatchesTable.id,
        ),
      )
      .innerJoin(
        invoicesTable,
        eq(customerPaymentBatchItemsTable.invoiceId, invoicesTable.id),
      )
      .innerJoin(
        assignmentsTable,
        eq(invoicesTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          eq(assignmentsTable.tenantId, tenantId),
          inArray(customerPaymentBatchesTable.status, ["open", "paid"]),
        ),
      ),

    db
      .select({
        id: customerPaymentBatchesTable.id,
        customerId: customerPaymentBatchesTable.customerId,
        customerName: customersTable.name,
        status: customerPaymentBatchesTable.status,
        amountCents: customerPaymentBatchesTable.amountCents,
        subtotalCents: customerPaymentBatchesTable.subtotalCents,
        vatCents: customerPaymentBatchesTable.vatCents,
        discountCents: customerPaymentBatchesTable.discountCents,
        surchargeCents: customerPaymentBatchesTable.surchargeCents,
        checkoutUrl: customerPaymentBatchesTable.checkoutUrl,
        periodStart: customerPaymentBatchesTable.periodStart,
        periodEnd: customerPaymentBatchesTable.periodEnd,
        objectName: objectsTable.name,
        createdAt: customerPaymentBatchesTable.createdAt,
        invoiceCount: sql<number>`count(${customerPaymentBatchItemsTable.id})::int`,
      })
      .from(customerPaymentBatchesTable)
      .innerJoin(
        customersTable,
        eq(customerPaymentBatchesTable.customerId, customersTable.id),
      )
      .leftJoin(
        objectsTable,
        eq(customerPaymentBatchesTable.objectId, objectsTable.id),
      )
      .leftJoin(
        customerPaymentBatchItemsTable,
        eq(
          customerPaymentBatchItemsTable.batchId,
          customerPaymentBatchesTable.id,
        ),
      )
      .where(eq(customersTable.tenantId, tenantId))
      .groupBy(
        customerPaymentBatchesTable.id,
        customersTable.name,
        objectsTable.name,
      )
      .orderBy(desc(customerPaymentBatchesTable.createdAt))
      .limit(20),
  ]);

  const lockedInvoiceIds = new Set(activeItems.map((item) => item.invoiceId));

  return {
    candidates: invoiceRows
      .filter((row) => !lockedInvoiceIds.has(row.id))
      .map((row) => ({
        id: row.id,
        invoiceNumber: displayInvoiceNumber(
          row.invoiceNumber,
          `Factuur-${row.id.slice(0, 8)}`,
        ),
        assignmentId: row.assignmentId,
        assignmentCode: row.assignmentCode,
        customerId: row.customerId,
        customerName: row.customerName ?? "",
        objectId: row.objectId ?? null,
        objectName: row.objectName ?? null,
        scheduledDate: row.scheduledDate ?? null,
        amount: row.amount ?? "0",
        vatAmount: row.vatAmount ?? "0",
        totalAmount: row.totalAmount ?? "0",
        dueDate: row.dueDate,
      })),
    batches: batchRows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName ?? "",
      status: row.status,
      amountCents: row.amountCents,
      subtotalCents: row.subtotalCents ?? 0,
      vatCents: row.vatCents ?? 0,
      discountCents: row.discountCents ?? 0,
      surchargeCents: row.surchargeCents ?? 0,
      checkoutUrl: row.checkoutUrl ?? null,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      objectName: row.objectName ?? null,
      createdAt: row.createdAt.toISOString(),
      invoiceCount: row.invoiceCount ?? 0,
    })),
  };
}

export async function getInvoiceStatusHistory(
  invoiceId: string,
): Promise<InvoiceStatusEvent[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const invoice = await getInvoiceAssignmentForCurrentTenant(invoiceId);
  if (!invoice) return [];

  const ACTION_LABELS: Record<string, string> = {
    create_invoice: "Factuur aangemaakt",
    create_invoice_proposal: "Factuurvoorstel aangemaakt",
    finalize_invoice: "Factuur gefinaliseerd",
    mark_invoice_sent: "Gemarkeerd als verzonden",
    mark_invoice_paid: "Gemarkeerd als betaald",
    cancel_invoice: "Factuur geannuleerd",
    email_invoice: "Factuur per e-mail verstuurd",
  };

  const rows = await db
    .select({
      action: auditLogTable.action,
      createdAt: auditLogTable.createdAt,
    })
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.resource, "invoices"),
        eq(auditLogTable.resourceId, invoiceId),
      ),
    )
    .orderBy(asc(auditLogTable.createdAt));

  return rows.map((r) => ({
    action: r.action,
    label: ACTION_LABELS[r.action] ?? r.action,
    timestamp: r.createdAt.toISOString(),
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createInvoice(
  assignmentId: string,
  data: {
    amount: string;
    vatPercentage: string;
    dueDate?: string | null;
    notes?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const amount = parseFloat(data.amount ?? "0");
  const vatPercentage = parseFloat(data.vatPercentage ?? "21");

  if (isNaN(amount) || amount < 0) {
    return {
      success: false,
      message: "Ongeldig bedrag.",
      fieldErrors: { amount: "Voer een geldig bedrag in." },
    };
  }
  if (isNaN(vatPercentage) || vatPercentage < 0 || vatPercentage > 100) {
    return {
      success: false,
      message: "Ongeldig BTW-percentage.",
      fieldErrors: { vatPercentage: "Voer een geldig percentage in (0–100)." },
    };
  }
  const explicitDueDate = data.dueDate?.trim();
  let defaultDueDate: { dueDate: string; paymentTermDays: number } | null =
    null;
  let dueDate = explicitDueDate;
  if (!dueDate) {
    defaultDueDate = await getDefaultInvoiceDueDate(tenantId);
    dueDate = defaultDueDate.dueDate;
  }

  const vatAmount = (amount * vatPercentage) / 100;
  const totalAmount = amount + vatAmount;

  // Verify assignment is in report_approved status and belongs to the current tenant.
  const [assignment] = await db
    .select({
      status: assignmentsTable.status,
      customerId: assignmentsTable.customerId,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!assignment)
    return { success: false, message: "Opdracht niet gevonden." };

  const [existingInvoice] = await db
    .select({ id: invoicesTable.id, status: invoicesTable.status })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.tenantId, tenantId),
        eq(invoicesTable.assignmentId, assignmentId),
        inArray(invoicesTable.status, ["draft", "sent", "paid"]),
      ),
    )
    .limit(1);

  if (existingInvoice) {
    return {
      success: false,
      message:
        existingInvoice.status === "draft"
          ? "Er bestaat al een factuurvoorstel voor deze opdracht."
          : "Deze opdracht is al gefactureerd.",
    };
  }

  const currentStatus = assignment.status as AssignmentStatus;
  const allowedNext = ASSIGNMENT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNext.includes("invoice_ready")) {
    return {
      success: false,
      message: `Factuur aanmaken is niet mogelijk vanuit status "${currentStatus}".`,
    };
  }

  try {
    const [created] = await db
      .insert(invoicesTable)
      .values({
        customerId: assignment.customerId,
        assignmentId,
        amount: amount.toFixed(2),
        vatPercentage: vatPercentage.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: "draft",
        dueDate,
        notes: data.notes?.trim() || null,
        createdBy: user.id,
      })
      .returning({ id: invoicesTable.id });

    // Advance assignment status → invoice_ready
    await db
      .update(assignmentsTable)
      .set({ status: "invoice_ready", updatedAt: new Date() })
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          eq(assignmentsTable.tenantId, tenantId),
        ),
      );

    await db.insert(auditLogTable).values({
      tenantId,
      userId: user.id,
      action: "create_invoice",
      resource: "invoices",
      resourceId: created!.id,
      metadata: {
        assignmentId,
        totalAmount: totalAmount.toFixed(2),
        dueDate,
        defaultPaymentTermDays: defaultDueDate?.paymentTermDays ?? null,
      },
    });

    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath("/invoices");
    return { success: true, data: { id: created!.id } };
  } catch {
    return { success: false, message: "Factuur aanmaken mislukt." };
  }
}

export async function createCreditNoteForInvoice(
  invoiceId: string,
  input: {
    reason: string;
    amount?: string;
    vatPercentage?: string;
    notes?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return {
      success: false,
      message: "Geef een duidelijke reden voor de creditnota op.",
    };
  }

  const [original] = await db
    .select({
      id: invoicesTable.id,
      tenantId: invoicesTable.tenantId,
      customerId: invoicesTable.customerId,
      assignmentId: invoicesTable.assignmentId,
      invoiceNumber: invoicesTable.invoiceNumber,
      status: invoicesTable.status,
      amount: invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      dueDate: invoicesTable.dueDate,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(invoicesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!original)
    return { success: false, message: "Originele factuur niet gevonden." };
  if (original.status === "draft" || original.status === "cancelled") {
    return {
      success: false,
      message:
        "Alleen definitieve of verzonden facturen kunnen worden gecrediteerd.",
    };
  }

  const [existingCredit] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.tenantId, tenantId),
        eq(invoicesTable.creditedInvoiceId, original.id),
        inArray(invoicesTable.status, ["draft", "sent", "paid"]),
      ),
    )
    .limit(1);

  if (existingCredit) {
    return {
      success: false,
      message: "Er bestaat al een actieve creditnota voor deze factuur.",
    };
  }

  const sourceAmount = Number.parseFloat(
    input.amount ?? original.amount ?? "0",
  );
  const sourceVat = Number.parseFloat(
    input.vatPercentage ?? original.vatPercentage ?? "21",
  );
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    return { success: false, message: "Creditbedrag is ongeldig." };
  }
  if (!Number.isFinite(sourceVat) || sourceVat < 0 || sourceVat > 100) {
    return { success: false, message: "BTW-percentage is ongeldig." };
  }

  const creditAmount = -Math.abs(sourceAmount);
  const creditVatAmount = (creditAmount * sourceVat) / 100;
  const creditTotalAmount = creditAmount + creditVatAmount;

  const [created] = await db
    .insert(invoicesTable)
    .values({
      type: "credit_note",
      customerId: original.customerId,
      assignmentId: original.assignmentId,
      creditedInvoiceId: original.id,
      creditReason: reason,
      originalInvoiceNumberSnapshot: original.invoiceNumber,
      amount: creditAmount.toFixed(2),
      vatPercentage: sourceVat.toFixed(2),
      vatAmount: creditVatAmount.toFixed(2),
      totalAmount: creditTotalAmount.toFixed(2),
      status: "draft",
      paymentStatus: "unpaid",
      collectionStatus: "none",
      dueDate: original.dueDate,
      notes: input.notes?.trim() || null,
      createdBy: user.id,
    })
    .returning({ id: invoicesTable.id });

  if (!created)
    return {
      success: false,
      message: "Creditnota kon niet worden aangemaakt.",
    };

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "create_credit_note",
    resource: "invoices",
    resourceId: created.id,
    metadata: {
      tenantId,
      creditedInvoiceId: original.id,
      originalInvoiceNumber: original.invoiceNumber,
      creditReason: reason,
      totalAmount: creditTotalAmount.toFixed(2),
    },
  });

  revalidatePath(`/invoices/${original.id}`);
  revalidatePath("/invoices");

  return { success: true, data: { id: created.id } };
}

export async function createCollectiveInvoicePayment(input: {
  invoiceIds: string[];
  periodStart?: string;
  periodEnd?: string;
  objectId?: string;
  discountCents?: number;
  surchargeCents?: number;
  notes?: string;
}): Promise<ActionResult<{ id: string; checkoutUrl: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const mollieDisabled = await requireMolliePaymentsEnabled(tenantId);
  if (mollieDisabled) return mollieDisabled;

  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    return {
      success: false,
      message:
        "Mollie API-sleutel niet geconfigureerd. Stel MOLLIE_API_KEY in.",
    };
  }

  const invoiceIds = [...new Set(input.invoiceIds)].filter(Boolean);
  if (invoiceIds.length < 2) {
    return {
      success: false,
      message: "Selecteer minimaal twee facturen voor een verzamelfactuur.",
    };
  }

  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      assignmentId: invoicesTable.assignmentId,
      objectId: assignmentsTable.objectId,
      scheduledDate: assignmentsTable.scheduledDate,
      amount: invoicesTable.amount,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
    })
    .from(invoicesTable)
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(
      and(
        inArray(invoicesTable.id, invoiceIds),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    );

  if (invoices.length !== invoiceIds.length) {
    return {
      success: false,
      message: "Een of meer geselecteerde facturen zijn niet gevonden.",
    };
  }

  const customerId = invoices[0]?.customerId;
  if (
    !customerId ||
    invoices.some((invoice) => invoice.customerId !== customerId)
  ) {
    return {
      success: false,
      message:
        "Een verzamelfactuur kan alleen facturen van dezelfde klant bevatten.",
    };
  }
  if (invoices.some((invoice) => invoice.status !== "sent")) {
    return {
      success: false,
      message: "Alleen verzonden/openstaande facturen kunnen worden gebundeld.",
    };
  }

  if (
    input.objectId &&
    invoices.some((invoice) => invoice.objectId !== input.objectId)
  ) {
    return {
      success: false,
      message: "Objectbundeling bevat facturen van een ander object.",
    };
  }
  if (
    input.periodStart &&
    input.periodEnd &&
    input.periodStart > input.periodEnd
  ) {
    return {
      success: false,
      message: "Periode is ongeldig: startdatum ligt na einddatum.",
    };
  }
  if (input.periodStart || input.periodEnd) {
    const outOfPeriod = invoices.some((invoice) => {
      if (!invoice.scheduledDate) return false;
      if (input.periodStart && invoice.scheduledDate < input.periodStart)
        return true;
      if (input.periodEnd && invoice.scheduledDate > input.periodEnd)
        return true;
      return false;
    });
    if (outOfPeriod) {
      return {
        success: false,
        message: "Een of meer facturen vallen buiten de gekozen periode.",
      };
    }
  }

  const activeBatchItems = await db
    .select({ invoiceId: customerPaymentBatchItemsTable.invoiceId })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(
      customerPaymentBatchesTable,
      eq(
        customerPaymentBatchItemsTable.batchId,
        customerPaymentBatchesTable.id,
      ),
    )
    .innerJoin(
      invoicesTable,
      eq(customerPaymentBatchItemsTable.invoiceId, invoicesTable.id),
    )
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        inArray(customerPaymentBatchItemsTable.invoiceId, invoiceIds),
        inArray(customerPaymentBatchesTable.status, ["open", "active", "paid"]),
      ),
    );

  if (activeBatchItems.length > 0) {
    return {
      success: false,
      message:
        "Een of meer facturen zitten al in een open of betaalde verzamelbetaling.",
    };
  }

  const subtotalCents = invoices.reduce(
    (sum, invoice) => sum + parseAmountCents(invoice.amount),
    0,
  );
  const vatCents = invoices.reduce(
    (sum, invoice) => sum + parseAmountCents(invoice.vatAmount),
    0,
  );
  const invoiceTotalCents = invoices.reduce(
    (sum, invoice) => sum + parseAmountCents(invoice.totalAmount),
    0,
  );
  const discountCents = Math.max(0, Math.round(input.discountCents ?? 0));
  const surchargeCents = Math.max(0, Math.round(input.surchargeCents ?? 0));
  const amountCents = invoiceTotalCents - discountCents + surchargeCents;

  if (amountCents <= 0) {
    return {
      success: false,
      message: "Totaalbedrag moet positief blijven na korting/toeslag.",
    };
  }

  const baseUrl = getBaseUrl();
  const webhookUrl =
    process.env.MOLLIE_WEBHOOK_URL ?? `${baseUrl}/api/webhooks/mollie`;
  const invoiceNumbers = invoices
    .map((invoice) => invoice.invoiceNumber)
    .join(", ");
  const branding = await getTenantBranding(tenantId);

  let mollieResp: Response;
  try {
    mollieResp = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mollieKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: centsToMollieValue(amountCents),
        },
        description: `Verzamelfactuur ${branding.displayName} (${invoices.length} facturen)`,
        redirectUrl: `${baseUrl}/klant/betalingen/succes`,
        webhookUrl,
        metadata: {
          type: "customer_payment_batch",
          source: "backoffice",
          customerId,
          invoiceIds,
          invoiceNumbers,
          discountCents,
          surchargeCents,
        },
      }),
    });
  } catch {
    return { success: false, message: "Verbinding met Mollie mislukt." };
  }

  if (!mollieResp.ok) {
    const body = await mollieResp.json().catch(() => ({}));
    const detail =
      (body as { detail?: string }).detail ?? mollieResp.statusText;
    return { success: false, message: `Mollie fout: ${detail}` };
  }

  const molliePayment = (await mollieResp.json()) as {
    id: string;
    _links?: { checkout?: { href?: string } };
  };
  const checkoutUrl = molliePayment._links?.checkout?.href ?? "";

  const [batch] = await db
    .insert(customerPaymentBatchesTable)
    .values({
      tenantId,
      customerId,
      molliePaymentId: molliePayment.id,
      amountCents,
      outstandingAmountCents: amountCents,
      currency: "EUR",
      status: "open",
      checkoutUrl,
      paymentProvider: "mollie",
      periodStart: input.periodStart || null,
      periodEnd: input.periodEnd || null,
      objectId: input.objectId || null,
      subtotalCents,
      vatCents,
      discountCents,
      surchargeCents,
      notes: input.notes?.trim() || null,
      createdBy: user.id,
      createdByActorType: "tenant_user",
    })
    .returning({ id: customerPaymentBatchesTable.id });

  if (!batch)
    return { success: false, message: "Verzamelfactuur opslaan mislukt." };

  await db.insert(paymentsTable).values({
    tenantId,
    customerId,
    invoiceId: null,
    sourceType: "invoice_collection",
    sourceId: batch.id,
    molliePaymentId: molliePayment.id,
    amountCents,
    amount: centsToMollieValue(amountCents),
    currency: "EUR",
    paymentMethod: "mollie",
    status: "open",
    checkoutUrl,
    registeredByUserId: user.id,
  });

  await db.insert(customerPaymentBatchItemsTable).values(
    invoices.map((invoice, index) => ({
      tenantId,
      batchId: batch.id,
      invoiceId: invoice.id,
      amountCents: parseAmountCents(invoice.totalAmount),
      invoiceNumberSnapshot: invoice.invoiceNumber,
      originalTotalAmountCents: parseAmountCents(invoice.totalAmount),
      outstandingAmountAtCollectionCents: parseAmountCents(invoice.totalAmount),
      includedAmountCents: parseAmountCents(invoice.totalAmount),
      sortOrder: index,
    })),
  );

  try {
    const { pool } = await import("@workspace/db");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await claimOfficialInvoiceCollectionNumberInTransaction(client, {
        batchId: batch.id,
        tenantId,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("collective invoice number claim failed", {
      batchId: batch.id,
      error,
    });
    return {
      success: false,
      message: "Verzamelfactuurnummer kon niet worden gereserveerd.",
    };
  }

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "create_collective_invoice_payment",
    resource: "customer_payment_batches",
    resourceId: batch.id,
    metadata: {
      customerId,
      invoiceCount: invoiceIds.length,
      subtotalCents,
      vatCents,
      discountCents,
      surchargeCents,
      amountCents,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      objectId: input.objectId ?? null,
    },
  });

  revalidatePath("/invoices");
  return { success: true, data: { id: batch.id, checkoutUrl } };
}

export async function finalizeInvoiceDraft(
  invoiceId: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const invoice = await getInvoiceAssignmentForCurrentTenant(invoiceId);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "draft") {
    return {
      success: false,
      message: "Alleen conceptfacturen kunnen worden gefinaliseerd.",
    };
  }

  const tenantId = await requireCurrentTenantId();
  try {
    const finalized = await finalizeOfficialInvoice({
      invoiceId,
      tenantId,
      actorUserId: user.id,
    });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath(`/assignments/${invoice.assignmentId}`);
    return {
      success: true,
      data: { invoiceNumber: finalized.invoiceNumber },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Factuur finaliseren mislukt.",
    };
  }
}

export async function markInvoiceSent(
  invoiceId: string,
): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const invoice = await getInvoiceAssignmentForCurrentTenant(invoiceId);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "draft") {
    return {
      success: false,
      message: "Alleen conceptfacturen kunnen als verzonden worden gemarkeerd.",
    };
  }

  const tenantId = await requireCurrentTenantId();
  let claimedInvoiceNumber = invoice.invoiceNumber ?? "";
  try {
    if (!invoice.finalizedAt || !invoice.invoiceNumber?.trim()) {
      const finalized = await finalizeOfficialInvoice({
        invoiceId,
        tenantId,
        actorUserId: user.id,
      });
      claimedInvoiceNumber = finalized.invoiceNumber;
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Factuur finaliseren mislukt.",
    };
  }

  await db
    .update(invoicesTable)
    .set({ status: "sent", updatedAt: new Date() })
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(invoicesTable.tenantId, tenantId),
      ),
    );

  // Advance assignment status → invoiced
  await db
    .update(assignmentsTable)
    .set({ status: "invoiced", updatedAt: new Date() })
    .where(
      and(
        eq(assignmentsTable.id, invoice.assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    );

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "mark_invoice_sent",
    resource: "invoices",
    resourceId: invoiceId,
    metadata: {
      assignmentId: invoice.assignmentId,
      invoiceNumber: claimedInvoiceNumber,
    },
  });

  await notifyInvoiceWorkflow({
    eventKey: "invoice_sent",
    invoiceId,
    actorUserId: user.id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/assignments/${invoice.assignmentId}`);
  return { success: true };
}

export async function markInvoicePaid(
  invoiceId: string,
): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const invoice = await getInvoiceAssignmentForCurrentTenant(invoiceId);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "sent") {
    return {
      success: false,
      message:
        "Alleen verzonden facturen kunnen als betaald worden gemarkeerd.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const tenantId = await requireCurrentTenantId();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM public.invoices WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`,
      );
      const [lockedInvoice] = await tx
        .select({
          totalAmount: invoicesTable.totalAmount,
          customerId: invoicesTable.customerId,
          assignmentId: invoicesTable.assignmentId,
          status: invoicesTable.status,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, invoiceId),
            eq(invoicesTable.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!lockedInvoice || lockedInvoice.status !== "sent")
        throw new Error("Factuur is gelijktijdig gewijzigd.");
      const [allocated] = await tx
        .select({
          cents: sql<number>`coalesce(sum(${paymentAllocationsTable.amountCents}), 0)::int`,
        })
        .from(paymentAllocationsTable)
        .where(
          and(
            eq(paymentAllocationsTable.invoiceId, invoiceId),
            eq(paymentAllocationsTable.tenantId, tenantId),
          ),
        );
      const totalCents = Math.round(
        Number.parseFloat(lockedInvoice.totalAmount ?? "0") * 100,
      );
      const outstandingCents = totalCents - Number(allocated?.cents ?? 0);
      if (outstandingCents <= 0)
        throw new Error("Factuur heeft geen positief openstaand bedrag.");
      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          tenantId,
          customerId: lockedInvoice.customerId,
          invoiceId,
          sourceType: "invoice",
          sourceId: invoiceId,
          amountCents: outstandingCents,
          amount: (outstandingCents / 100).toFixed(2),
          currency: "EUR",
          paymentMethod: "manual_bank",
          status: "paid",
          registeredByUserId: user.id,
          paidAt: new Date(),
          note: "Volledige handmatige betaling",
        })
        .returning({ id: paymentsTable.id });
      if (!payment) throw new Error("Betalingsboeking ontbreekt.");
      await tx.insert(paymentAllocationsTable).values({
        tenantId,
        paymentId: payment.id,
        invoiceId,
        amountCents: outstandingCents,
        amount: (outstandingCents / 100).toFixed(2),
        allocatedByUserId: user.id,
        note: "Volledige handmatige betaling toegewezen",
      });
      await tx
        .update(invoicesTable)
        .set({
          status: "paid",
          paymentStatus: "paid",
          paidAmount: (totalCents / 100).toFixed(2),
          outstandingAmount: "0.00",
          paidDate: today,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(invoicesTable.id, invoiceId),
            eq(invoicesTable.tenantId, tenantId),
          ),
        );
      await tx
        .update(assignmentsTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(
          and(
            eq(assignmentsTable.id, lockedInvoice.assignmentId),
            eq(assignmentsTable.tenantId, tenantId),
          ),
        );
      await tx
        .update(assignmentsTable)
        .set({ status: "closed", updatedAt: new Date() })
        .where(
          and(
            eq(assignmentsTable.id, lockedInvoice.assignmentId),
            eq(assignmentsTable.tenantId, tenantId),
          ),
        );
      await tx.insert(auditLogTable).values({
        tenantId,
        userId: user.id,
        action: "mark_invoice_paid",
        resource: "invoices",
        resourceId: invoiceId,
        metadata: {
          assignmentId: lockedInvoice.assignmentId,
          paidDate: today,
          paymentId: payment.id,
          amountCents: outstandingCents,
        },
      });
    });
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Betaling boeken mislukt.",
    };
  }

  await notifyInvoiceWorkflow({
    eventKey: "invoice_paid",
    invoiceId,
    actorUserId: user.id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/assignments/${invoice.assignmentId}`);
  return { success: true };
}

export async function cancelInvoice(
  invoiceId: string,
  reason: string,
): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    return {
      success: false,
      message: "Geef een annuleringsreden van 3 tot 500 tekens.",
    };
  }
  const tenantId = await requireCurrentTenantId();

  let cancellation;
  try {
    cancellation = await cancelInvoiceAndReopenAssignment({
      tenantId,
      invoiceId,
      actorUserId: user.id,
      reason: normalizedReason,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42501") {
      return {
        success: false,
        message: "Factuur niet gevonden of u bent niet bevoegd.",
      };
    }
    const message = error instanceof Error ? error.message : "";
    const safeMessage = [
      "Alleen een concept- of verzonden factuur kan worden geannuleerd.",
      "Een betaalde of gedeeltelijk betaalde factuur kan niet worden heropend.",
      "Annuleer eerst het openstaande betaalverzoek bij de betaalprovider.",
      "Een factuur in een actieve of betaalde verzameling kan niet worden geannuleerd.",
      "Een factuur met een actieve creditnota kan niet rechtstreeks worden heropend.",
      "Factuur en opdracht hebben geen bijpassende annuleerstatus.",
    ].find((candidate) => message.includes(candidate));
    return {
      success: false,
      message: safeMessage ?? "Factuur kon niet veilig worden geannuleerd.",
    };
  }

  if (
    cancellation.invoiceStatus !== "cancelled" ||
    cancellation.assignmentStatus !== "report_approved"
  ) {
    return {
      success: false,
      message: "Factuurannulering heeft geen geldige eindstatus opgeleverd.",
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/assignments");
  return { success: true };
}

export async function emailInvoice(invoiceId: string): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const tenantId = await requireCurrentTenantId();

  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { success: false, message: "Factuur niet gevonden." };

  if (invoice.status !== "sent") {
    return {
      success: false,
      message: "E-mail kan alleen voor verzonden facturen worden verstuurd.",
    };
  }
  if (!invoice.customerEmail) {
    return {
      success: false,
      message: "Klant heeft geen e-mailadres geregistreerd.",
    };
  }

  const paymentUrl = await getOpenPaymentCheckoutUrlForCurrentTenant(invoiceId);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdf(invoice);
  } catch {
    return { success: false, message: "PDF genereren mislukt." };
  }

  const portalUrl = klantPortalUrl();
  const dueDateFormatted = new Date(
    invoice.dueDate + "T00:00:00",
  ).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const { subject, html } = buildInvoiceEmail({
    customerName: invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    dueDate: dueDateFormatted,
    paymentUrl,
    portalUrl,
  });

  const result = await sendEmailWithResult({
    to: invoice.customerEmail,
    subject,
    html,
    attachments: [
      { filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer },
    ],
    tenantId,
    purpose: "invoice_available",
  });

  if (!result.success) {
    return {
      success: false,
      message: result.error ?? "E-mail verzenden mislukt.",
    };
  }

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "email_invoice",
    resource: "invoices",
    resourceId: invoiceId,
    metadata: {
      to: invoice.customerEmail,
      invoiceNumber: invoice.invoiceNumber,
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function getInvoiceForAssignment(
  assignmentId: string,
): Promise<InvoiceRow | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const tenantId = await requireCurrentTenantId();
  const [row] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      assignmentId: invoicesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      amount: invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      dueDate: invoicesTable.dueDate,
      paidDate: invoicesTable.paidDate,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(invoicesTable.assignmentId, assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(invoicesTable.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    invoiceNumber: displayInvoiceNumber(row.invoiceNumber),
    customerId: row.customerId,
    customerName: row.customerName ?? "",
    assignmentId: row.assignmentId,
    assignmentCode: row.assignmentCode,
    amount: row.amount ?? "0",
    vatPercentage: row.vatPercentage ?? "21",
    vatAmount: row.vatAmount ?? "0",
    totalAmount: row.totalAmount ?? "0",
    status: row.status as InvoiceStatus,
    dueDate: row.dueDate,
    paidDate: row.paidDate ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Customer-scoped query ─────────────────────────────────────────────────────

export async function listInvoicesForCustomer(
  customerId: string,
  limit = 25,
): Promise<InvoiceRow[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const tenantId = await requireCurrentTenantId();
  const rows = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      assignmentId: invoicesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      amount: invoicesTable.amount,
      vatPercentage: invoicesTable.vatPercentage,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      dueDate: invoicesTable.dueDate,
      paidDate: invoicesTable.paidDate,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .innerJoin(
      assignmentsTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(invoicesTable.customerId, customerId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(invoicesTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: displayInvoiceNumber(r.invoiceNumber),
    customerId: r.customerId,
    customerName: r.customerName ?? "",
    assignmentId: r.assignmentId,
    assignmentCode: r.assignmentCode,
    amount: r.amount ?? "0",
    vatPercentage: r.vatPercentage ?? "21",
    vatAmount: r.vatAmount ?? "0",
    totalAmount: r.totalAmount ?? "0",
    status: r.status as InvoiceStatus,
    dueDate: r.dueDate,
    paidDate: r.paidDate ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
