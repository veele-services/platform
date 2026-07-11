"use server";

import { db } from "@workspace/db";
import {
  auditLogTable,
  invoiceNumberingSettingsTable,
  invoiceNumberSequencesTable,
  invoicePaymentSettingsTable,
  invoiceTemplateSettingsTable,
  tenantCompanySettingsTable,
} from "@workspace/db";
import {
  getInvoiceNumberPeriodKey,
  previewInvoiceNumber,
  validateInvoiceNumberingConfig,
  type InvoiceNumberResetPeriod,
} from "@workspace/db/invoice-number-formatting";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import type { ActionResult } from "./customers";

type HexColor = `#${string}`;

export type InvoiceCompanySettingsForm = {
  legalName: string;
  tradeName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country: string;
  kvkNumber?: string | null;
  vatNumber?: string | null;
  iban?: string | null;
  bic?: string | null;
  administrationEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultPaymentTermDays: number;
};

export type InvoiceNumberingSettingsForm = {
  prefix: string;
  format: string;
  separator: string;
  numberPadding: number;
  resetPeriod: InvoiceNumberResetPeriod;
  defaultStartNumber: number;
};

export type InvoiceTemplateSettingsForm = {
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  introText?: string | null;
  footerText?: string | null;
  paymentInstruction: string;
  showLogo: boolean;
  showCompanyFooter: boolean;
  showKvkFooter: boolean;
  showVatFooter: boolean;
  showIbanFooter: boolean;
};

export type InvoicePaymentSettingsForm = {
  paymentProvider: "none" | "mollie";
  mollieEnabled: boolean;
  showPaymentLinkOnInvoice: boolean;
  showPaymentQrOnInvoice: boolean;
  paymentBlockTitle: string;
  paymentBlockText: string;
  paymentLinkLabel: string;
};

export type InvoiceSettingsBundle = {
  company: InvoiceCompanySettingsForm;
  numbering: InvoiceNumberingSettingsForm;
  template: InvoiceTemplateSettingsForm;
  payment: InvoicePaymentSettingsForm;
  preview: {
    invoiceNumber: string;
    periodKey: string;
    sequenceValue: number;
    dueDateDays: number;
    testPdfUrl: string;
    warnings: string[];
  };
};

const DEFAULT_COMPANY: InvoiceCompanySettingsForm = {
  legalName: "",
  tradeName: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "Nederland",
  kvkNumber: "",
  vatNumber: "",
  iban: "",
  bic: "",
  administrationEmail: "",
  phone: "",
  website: "",
  logoUrl: "",
  primaryColor: "#081D3A",
  secondaryColor: "#00B7B3",
  defaultPaymentTermDays: 30,
};

const DEFAULT_NUMBERING: InvoiceNumberingSettingsForm = {
  prefix: "FAK",
  format: "{PREFIX}-{YYYY}-{NUMBER}",
  separator: "-",
  numberPadding: 4,
  resetPeriod: "yearly",
  defaultStartNumber: 1,
};

const DEFAULT_TEMPLATE: InvoiceTemplateSettingsForm = {
  logoUrl: "",
  primaryColor: "#081D3A",
  secondaryColor: "#00B7B3",
  introText: "",
  footerText: "",
  paymentInstruction:
    "Gelieve het bedrag binnen {{payment_term_days}} dagen te voldoen onder vermelding van factuurnummer {{invoice_number}}.",
  showLogo: true,
  showCompanyFooter: true,
  showKvkFooter: true,
  showVatFooter: true,
  showIbanFooter: true,
};

const DEFAULT_PAYMENT: InvoicePaymentSettingsForm = {
  paymentProvider: "none",
  mollieEnabled: false,
  showPaymentLinkOnInvoice: false,
  showPaymentQrOnInvoice: false,
  paymentBlockTitle: "Betalen",
  paymentBlockText: "Betaal deze factuur eenvoudig via onderstaande betaallink of scan de QR-code.",
  paymentLinkLabel: "Betaal online",
};

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizedColor(value: string, fallback: HexColor): HexColor {
  const trimmed = value.trim();
  return /^#[0-9A-Fa-f]{6}$/u.test(trimmed) ? (trimmed.toUpperCase() as HexColor) : fallback;
}

function normalizeNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function invoiceSettingsWarnings(input: {
  company: InvoiceCompanySettingsForm;
  template: InvoiceTemplateSettingsForm;
  payment: InvoicePaymentSettingsForm;
}): string[] {
  const warnings: string[] = [];
  const { company, template, payment } = input;

  if (!company.legalName.trim()) warnings.push("Bedrijfsnaam ontbreekt.");
  if (!company.addressLine1?.trim() || !company.postalCode?.trim() || !company.city?.trim()) {
    warnings.push("Adresgegevens zijn niet volledig.");
  }
  if (!company.kvkNumber?.trim()) warnings.push("KVK-nummer ontbreekt.");
  if (!company.vatNumber?.trim()) warnings.push("BTW-nummer ontbreekt.");
  if (!company.iban?.trim()) warnings.push("IBAN ontbreekt.");
  if (!company.administrationEmail?.trim()) warnings.push("Administratie e-mail ontbreekt.");
  if (template.showLogo && !(template.logoUrl?.trim() || company.logoUrl?.trim())) {
    warnings.push("Logo staat aan, maar er is nog geen logo-URL ingesteld.");
  }
  if (payment.paymentProvider === "mollie" && !payment.mollieEnabled) {
    warnings.push("Mollie is gekozen als provider, maar nog niet actief.");
  }

  return warnings;
}

async function requireActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet geauthenticeerd.");
  return user;
}

async function writeAudit(input: {
  tenantId: string;
  userId: string;
  action: string;
  resourceId: string;
  fields: string[];
}) {
  await db.insert(auditLogTable).values({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    resource: "invoice_settings",
    resourceId: input.resourceId,
    metadata: { fields: input.fields },
  });
}

export async function getInvoiceSettings(): Promise<InvoiceSettingsBundle> {
  await requirePermission("settings", "read");
  const tenantId = await requireCurrentTenantId();

  const [companyRows, numberingRows, templateRows, paymentRows] = await Promise.all([
    db.select().from(tenantCompanySettingsTable).where(eq(tenantCompanySettingsTable.tenantId, tenantId)).limit(1),
    db
      .select()
      .from(invoiceNumberingSettingsTable)
      .where(and(
        eq(invoiceNumberingSettingsTable.tenantId, tenantId),
        eq(invoiceNumberingSettingsTable.documentType, "invoice"),
        eq(invoiceNumberingSettingsTable.isActive, true),
      ))
      .limit(1),
    db.select().from(invoiceTemplateSettingsTable).where(eq(invoiceTemplateSettingsTable.tenantId, tenantId)).limit(1),
    db.select().from(invoicePaymentSettingsTable).where(eq(invoicePaymentSettingsTable.tenantId, tenantId)).limit(1),
  ]);

  const company = companyRows[0];
  const numbering = numberingRows[0];
  const template = templateRows[0];
  const payment = paymentRows[0];
  const numberingSettings: InvoiceNumberingSettingsForm = {
    prefix: numbering?.prefix ?? DEFAULT_NUMBERING.prefix,
    format: numbering?.format ?? DEFAULT_NUMBERING.format,
    separator: numbering?.separator ?? DEFAULT_NUMBERING.separator,
    numberPadding: numbering?.numberPadding ?? DEFAULT_NUMBERING.numberPadding,
    resetPeriod: numbering?.resetPeriod ?? DEFAULT_NUMBERING.resetPeriod,
    defaultStartNumber: numbering?.defaultStartNumber ?? DEFAULT_NUMBERING.defaultStartNumber,
  };
  const companySettings: InvoiceCompanySettingsForm = {
    legalName: company?.legalName ?? DEFAULT_COMPANY.legalName,
    tradeName: company?.tradeName ?? DEFAULT_COMPANY.tradeName,
    addressLine1: company?.addressLine1 ?? DEFAULT_COMPANY.addressLine1,
    addressLine2: company?.addressLine2 ?? DEFAULT_COMPANY.addressLine2,
    postalCode: company?.postalCode ?? DEFAULT_COMPANY.postalCode,
    city: company?.city ?? DEFAULT_COMPANY.city,
    country: company?.country ?? DEFAULT_COMPANY.country,
    kvkNumber: company?.kvkNumber ?? DEFAULT_COMPANY.kvkNumber,
    vatNumber: company?.vatNumber ?? DEFAULT_COMPANY.vatNumber,
    iban: company?.iban ?? DEFAULT_COMPANY.iban,
    bic: company?.bic ?? DEFAULT_COMPANY.bic,
    administrationEmail: company?.administrationEmail ?? DEFAULT_COMPANY.administrationEmail,
    phone: company?.phone ?? DEFAULT_COMPANY.phone,
    website: company?.website ?? DEFAULT_COMPANY.website,
    logoUrl: company?.logoUrl ?? DEFAULT_COMPANY.logoUrl,
    primaryColor: company?.primaryColor ?? DEFAULT_COMPANY.primaryColor,
    secondaryColor: company?.secondaryColor ?? DEFAULT_COMPANY.secondaryColor,
    defaultPaymentTermDays: company?.defaultPaymentTermDays ?? DEFAULT_COMPANY.defaultPaymentTermDays,
  };
  const templateSettings: InvoiceTemplateSettingsForm = {
    logoUrl: template?.logoUrl ?? DEFAULT_TEMPLATE.logoUrl,
    primaryColor: template?.primaryColor ?? DEFAULT_TEMPLATE.primaryColor,
    secondaryColor: template?.secondaryColor ?? DEFAULT_TEMPLATE.secondaryColor,
    introText: template?.introText ?? DEFAULT_TEMPLATE.introText,
    footerText: template?.footerText ?? DEFAULT_TEMPLATE.footerText,
    paymentInstruction: template?.paymentInstruction ?? DEFAULT_TEMPLATE.paymentInstruction,
    showLogo: template?.showLogo ?? DEFAULT_TEMPLATE.showLogo,
    showCompanyFooter: template?.showCompanyFooter ?? DEFAULT_TEMPLATE.showCompanyFooter,
    showKvkFooter: template?.showKvkFooter ?? DEFAULT_TEMPLATE.showKvkFooter,
    showVatFooter: template?.showVatFooter ?? DEFAULT_TEMPLATE.showVatFooter,
    showIbanFooter: template?.showIbanFooter ?? DEFAULT_TEMPLATE.showIbanFooter,
  };
  const paymentSettings: InvoicePaymentSettingsForm = {
    paymentProvider: payment?.paymentProvider ?? DEFAULT_PAYMENT.paymentProvider,
    mollieEnabled: payment?.mollieEnabled ?? DEFAULT_PAYMENT.mollieEnabled,
    showPaymentLinkOnInvoice: payment?.showPaymentLinkOnInvoice ?? DEFAULT_PAYMENT.showPaymentLinkOnInvoice,
    showPaymentQrOnInvoice: payment?.showPaymentQrOnInvoice ?? DEFAULT_PAYMENT.showPaymentQrOnInvoice,
    paymentBlockTitle: payment?.paymentBlockTitle ?? DEFAULT_PAYMENT.paymentBlockTitle,
    paymentBlockText: payment?.paymentBlockText ?? DEFAULT_PAYMENT.paymentBlockText,
    paymentLinkLabel: payment?.paymentLinkLabel ?? DEFAULT_PAYMENT.paymentLinkLabel,
  };
  const today = new Date();
  const periodKey = getInvoiceNumberPeriodKey(numberingSettings.resetPeriod, today);
  const [sequence] = numbering
    ? await db
        .select({ nextNumber: invoiceNumberSequencesTable.nextNumber })
        .from(invoiceNumberSequencesTable)
        .where(
          and(
            eq(invoiceNumberSequencesTable.tenantId, tenantId),
            eq(invoiceNumberSequencesTable.numberingSettingsId, numbering.id),
            eq(invoiceNumberSequencesTable.documentType, "invoice"),
            eq(invoiceNumberSequencesTable.periodKey, periodKey),
          ),
        )
        .limit(1)
    : [];
  const previewNumber = previewInvoiceNumber(numberingSettings, sequence?.nextNumber ?? numberingSettings.defaultStartNumber, today);
  const preview = {
    invoiceNumber: previewNumber.invoiceNumber,
    periodKey: previewNumber.periodKey,
    sequenceValue: previewNumber.sequenceValue,
    dueDateDays: companySettings.defaultPaymentTermDays,
    testPdfUrl: "/backoffice-api/invoices/test-pdf",
    warnings: invoiceSettingsWarnings({
      company: companySettings,
      template: templateSettings,
      payment: paymentSettings,
    }),
  };

  return {
    company: companySettings,
    numbering: numberingSettings,
    template: templateSettings,
    payment: paymentSettings,
    preview,
  };
}

export async function updateInvoiceCompanySettings(data: InvoiceCompanySettingsForm): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const user = await requireActor();
  const legalName = data.legalName.trim();
  if (!legalName) return { success: false, message: "Bedrijfsnaam is verplicht." };

  const payload = {
    tenantId,
    legalName,
    tradeName: nullable(data.tradeName),
    addressLine1: nullable(data.addressLine1),
    addressLine2: nullable(data.addressLine2),
    postalCode: nullable(data.postalCode),
    city: nullable(data.city),
    country: data.country.trim() || "Nederland",
    kvkNumber: nullable(data.kvkNumber),
    vatNumber: nullable(data.vatNumber),
    iban: nullable(data.iban),
    bic: nullable(data.bic),
    administrationEmail: nullable(data.administrationEmail),
    phone: nullable(data.phone),
    website: nullable(data.website),
    logoUrl: nullable(data.logoUrl),
    primaryColor: normalizedColor(data.primaryColor, "#081D3A"),
    secondaryColor: normalizedColor(data.secondaryColor, "#00B7B3"),
    defaultPaymentTermDays: normalizeNumber(data.defaultPaymentTermDays, 30, 1, 365),
    updatedAt: new Date(),
  };

  await db
    .insert(tenantCompanySettingsTable)
    .values(payload)
    .onConflictDoUpdate({ target: tenantCompanySettingsTable.tenantId, set: payload });

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "update_invoice_company_settings",
    resourceId: "company",
    fields: Object.keys(data),
  });
  revalidatePath("/instellingen/facturen");
  return { success: true };
}

export async function updateInvoiceNumberingSettings(data: InvoiceNumberingSettingsForm): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const user = await requireActor();
  const settings: InvoiceNumberingSettingsForm = {
    prefix: data.prefix.trim().toUpperCase(),
    format: data.format.trim(),
    separator: data.separator.trim() || "-",
    numberPadding: normalizeNumber(data.numberPadding, 4, 3, 8),
    resetPeriod: data.resetPeriod,
    defaultStartNumber: normalizeNumber(data.defaultStartNumber, 1, 1, 99999999),
  };
  const validation = validateInvoiceNumberingConfig(settings);
  if (!validation.valid) return { success: false, message: validation.errors.join(" ") };

  const [active] = await db
    .select({ id: invoiceNumberingSettingsTable.id })
    .from(invoiceNumberingSettingsTable)
    .where(and(
      eq(invoiceNumberingSettingsTable.tenantId, tenantId),
      eq(invoiceNumberingSettingsTable.documentType, "invoice"),
      eq(invoiceNumberingSettingsTable.isActive, true),
    ))
    .limit(1);

  if (active) {
    await db
      .update(invoiceNumberingSettingsTable)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(invoiceNumberingSettingsTable.id, active.id));
  } else {
    await db.insert(invoiceNumberingSettingsTable).values({ tenantId, documentType: "invoice", ...settings, isActive: true });
  }

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "update_invoice_numbering_settings",
    resourceId: "numbering",
    fields: Object.keys(data),
  });
  revalidatePath("/instellingen/facturen");
  return { success: true };
}

export async function updateInvoiceTemplateSettings(data: InvoiceTemplateSettingsForm): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const user = await requireActor();
  const paymentInstruction = data.paymentInstruction.trim();
  if (!paymentInstruction) return { success: false, message: "Betaalinstructie is verplicht." };

  const payload = {
    tenantId,
    logoUrl: nullable(data.logoUrl),
    primaryColor: normalizedColor(data.primaryColor, "#081D3A"),
    secondaryColor: normalizedColor(data.secondaryColor, "#00B7B3"),
    introText: nullable(data.introText),
    footerText: nullable(data.footerText),
    paymentInstruction,
    showLogo: data.showLogo,
    showCompanyFooter: data.showCompanyFooter,
    showKvkFooter: data.showKvkFooter,
    showVatFooter: data.showVatFooter,
    showIbanFooter: data.showIbanFooter,
    updatedAt: new Date(),
  };

  await db
    .insert(invoiceTemplateSettingsTable)
    .values(payload)
    .onConflictDoUpdate({ target: invoiceTemplateSettingsTable.tenantId, set: payload });

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "update_invoice_template_settings",
    resourceId: "template",
    fields: Object.keys(data),
  });
  revalidatePath("/instellingen/facturen");
  return { success: true };
}

export async function updateInvoicePaymentSettings(data: InvoicePaymentSettingsForm): Promise<ActionResult> {
  await requirePermission("settings", "write");
  const tenantId = await requireCurrentTenantId();
  const user = await requireActor();
  if (!["none", "mollie"].includes(data.paymentProvider)) {
    return { success: false, message: "Ongeldige betaalprovider." };
  }

  const payload = {
    tenantId,
    paymentProvider: data.paymentProvider,
    mollieEnabled: data.paymentProvider === "mollie" && data.mollieEnabled,
    showPaymentLinkOnInvoice: data.showPaymentLinkOnInvoice,
    showPaymentQrOnInvoice: data.showPaymentQrOnInvoice,
    paymentBlockTitle: data.paymentBlockTitle.trim() || "Betalen",
    paymentBlockText: data.paymentBlockText.trim() || DEFAULT_PAYMENT.paymentBlockText,
    paymentLinkLabel: data.paymentLinkLabel.trim() || "Betaal online",
    updatedAt: new Date(),
  };

  await db
    .insert(invoicePaymentSettingsTable)
    .values(payload)
    .onConflictDoUpdate({ target: invoicePaymentSettingsTable.tenantId, set: payload });

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "update_invoice_payment_settings",
    resourceId: "payment",
    fields: Object.keys(data),
  });
  revalidatePath("/instellingen/facturen");
  return { success: true };
}
