export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import {
  getTenantBranding,
  assignmentExtraWorkTable,
  assignmentMaterialUsageTable,
  assignmentTasksTable,
  assignmentsTable,
  auditLogTable,
  customersTable,
  invoiceLineItemSnapshotsTable,
  invoicePaymentSettingsTable,
  invoiceTemplateSettingsTable,
  invoicesTable,
  objectsTable,
  paymentsTable,
  taskCodesTable,
  tenantCompanySettingsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getMyCustomerIdentity } from "@/actions/customer";
import {
  generateCustomerInvoicePdf,
  type CustomerInvoicePdfCompanySnapshot,
  type CustomerInvoicePdfLineItem,
  type CustomerInvoicePdfPaymentSettings,
  type CustomerInvoicePdfTemplateSettings,
} from "@/lib/invoice-pdf";
import { sanitizePdfFilename } from "@/lib/pdf-style";

export const runtime = "nodejs";

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayInvoiceNumber(value: string | null | undefined, fallback = "Factuur"): string {
  return value?.trim() || fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/u.test(value.trim()) ? value.trim() : fallback;
}

function paymentTerm(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(365, Math.max(1, Math.round(parsed))) : 30;
}

function normalizeCompany(value: Record<string, unknown> | null | undefined): CustomerInvoicePdfCompanySnapshot {
  return {
    legalName: nullableString(value?.legalName) ?? "",
    tradeName: nullableString(value?.tradeName),
    addressLine1: nullableString(value?.addressLine1),
    addressLine2: nullableString(value?.addressLine2),
    postalCode: nullableString(value?.postalCode),
    city: nullableString(value?.city),
    country: nullableString(value?.country) ?? "Nederland",
    kvkNumber: nullableString(value?.kvkNumber),
    vatNumber: nullableString(value?.vatNumber),
    iban: nullableString(value?.iban),
    bic: nullableString(value?.bic),
    administrationEmail: nullableString(value?.administrationEmail),
    phone: nullableString(value?.phone),
    website: nullableString(value?.website),
    logoUrl: nullableString(value?.logoUrl),
    primaryColor: safeHexColor(value?.primaryColor, "#081D3A"),
    secondaryColor: safeHexColor(value?.secondaryColor, "#00B7B3"),
    defaultPaymentTermDays: paymentTerm(value?.defaultPaymentTermDays),
  };
}

function normalizeTemplate(value: Record<string, unknown> | null | undefined): CustomerInvoicePdfTemplateSettings {
  return {
    logoUrl: nullableString(value?.logoUrl),
    primaryColor: safeHexColor(value?.primaryColor, "#081D3A"),
    secondaryColor: safeHexColor(value?.secondaryColor, "#00B7B3"),
    introText: nullableString(value?.introText),
    footerText: nullableString(value?.footerText),
    paymentInstruction: nullableString(value?.paymentInstruction)
      ?? "Gelieve het bedrag binnen {{payment_term_days}} dagen te voldoen onder vermelding van factuurnummer {{invoice_number}}.",
    showLogo: value?.showLogo !== false,
    showCompanyFooter: value?.showCompanyFooter !== false,
    showKvkFooter: value?.showKvkFooter !== false,
    showVatFooter: value?.showVatFooter !== false,
    showIbanFooter: value?.showIbanFooter !== false,
  };
}

function normalizePayment(value: Record<string, unknown> | null | undefined): CustomerInvoicePdfPaymentSettings {
  return {
    paymentProvider: value?.paymentProvider === "mollie" ? "mollie" : "none",
    mollieEnabled: value?.mollieEnabled === true,
    showPaymentLinkOnInvoice: value?.showPaymentLinkOnInvoice === true,
    showPaymentQrOnInvoice: value?.showPaymentQrOnInvoice === true,
    paymentBlockTitle: nullableString(value?.paymentBlockTitle) ?? "Online betalen",
    paymentBlockText: nullableString(value?.paymentBlockText) ?? "Betaal deze factuur veilig via de betaallink.",
    paymentLinkLabel: nullableString(value?.paymentLinkLabel) ?? "Betaal factuur",
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getMyCustomerIdentity();
  if (!identity) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const [invoice] = await db
    .select({
      id:                 invoicesTable.id,
      invoiceNumber:      invoicesTable.invoiceNumber,
      assignmentId:       invoicesTable.assignmentId,
      amount:             invoicesTable.amount,
      vatPercentage:      invoicesTable.vatPercentage,
      vatAmount:          invoicesTable.vatAmount,
      totalAmount:        invoicesTable.totalAmount,
      status:             invoicesTable.status,
      dueDate:            invoicesTable.dueDate,
      createdAt:          invoicesTable.createdAt,
      customerName:       customersTable.name,
      customerAddress:    customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity:       customersTable.city,
      assignmentCode:     assignmentsTable.code,
      objectName:         objectsTable.name,
      companySnapshotJson: invoicesTable.companySnapshotJson,
      paymentSettingsSnapshotJson: invoicesTable.paymentSettingsSnapshotJson,
      templateSnapshotJson: invoicesTable.templateSnapshotJson,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, invoicesTable.assignmentId))
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(
      and(
        eq(invoicesTable.id, id),
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        inArray(invoicesTable.status, ["sent", "paid", "cancelled"]),
      ),
    )
    .limit(1);

  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const [snapshotRows, taskRows, extraRows, materialRows, companyRows, templateRows, paymentRows, openPaymentRows] = await Promise.all([
    db
      .select({
        category: invoiceLineItemSnapshotsTable.category,
        code: invoiceLineItemSnapshotsTable.taskCodeCode,
        description: invoiceLineItemSnapshotsTable.description,
        quantity: invoiceLineItemSnapshotsTable.quantity,
        unitPrice: invoiceLineItemSnapshotsTable.unitPrice,
        totalPrice: invoiceLineItemSnapshotsTable.totalPrice,
        invoiceable: invoiceLineItemSnapshotsTable.invoiceable,
      })
      .from(invoiceLineItemSnapshotsTable)
      .where(and(eq(invoiceLineItemSnapshotsTable.invoiceId, invoice.id), eq(invoiceLineItemSnapshotsTable.tenantId, identity.tenantId)))
      .orderBy(asc(invoiceLineItemSnapshotsTable.sortOrder)),

    db
      .select({
        code:        taskCodesTable.code,
        name:        taskCodesTable.name,
        price:       taskCodesTable.price,
        invoiceable: taskCodesTable.invoiceable,
      })
      .from(assignmentTasksTable)
      .leftJoin(taskCodesTable, eq(taskCodesTable.id, assignmentTasksTable.taskCodeId))
      .where(eq(assignmentTasksTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentTasksTable.sortOrder)),

    db
      .select({
        code: taskCodesTable.code,
        name: assignmentExtraWorkTable.taskCodeName,
        description: assignmentExtraWorkTable.description,
        hours: assignmentExtraWorkTable.hours,
        price: assignmentExtraWorkTable.price,
      })
      .from(assignmentExtraWorkTable)
      .leftJoin(taskCodesTable, eq(taskCodesTable.id, assignmentExtraWorkTable.taskCodeId))
      .where(eq(assignmentExtraWorkTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentExtraWorkTable.createdAt)),

    db
      .select({
        name: assignmentMaterialUsageTable.name,
        quantity: assignmentMaterialUsageTable.quantity,
        unitPrice: assignmentMaterialUsageTable.unitPrice,
        unitLabel: assignmentMaterialUsageTable.unitLabel,
      })
      .from(assignmentMaterialUsageTable)
      .where(eq(assignmentMaterialUsageTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentMaterialUsageTable.createdAt)),

    db.select().from(tenantCompanySettingsTable).where(eq(tenantCompanySettingsTable.tenantId, identity.tenantId)).limit(1),
    db.select().from(invoiceTemplateSettingsTable).where(eq(invoiceTemplateSettingsTable.tenantId, identity.tenantId)).limit(1),
    db.select().from(invoicePaymentSettingsTable).where(eq(invoicePaymentSettingsTable.tenantId, identity.tenantId)).limit(1),
    db
      .select({ checkoutUrl: paymentsTable.checkoutUrl })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.invoiceId, invoice.id), eq(paymentsTable.tenantId, identity.tenantId), eq(paymentsTable.status, "open")))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1),
  ]);

  const liveLineItems: CustomerInvoicePdfLineItem[] = [
    ...taskRows.map((row) => ({
      category: "task" as const,
      code: row.code ?? null,
      description: row.name ?? "Werkzaamheid",
      quantity: "1",
      unitPrice: row.invoiceable ? money(parseMoney(row.price)) : null,
      price: row.invoiceable ? money(parseMoney(row.price)) : null,
      invoiceable: Boolean(row.invoiceable),
    })),
    ...extraRows.map((row) => ({
      category: "extra_work" as const,
      code: row.code ?? null,
      description: row.description,
      quantity: row.hours ?? "1",
      unitPrice: row.hours ? money(parseMoney(row.price) / Math.max(parseMoney(row.hours), 1)) : money(parseMoney(row.price)),
      price: money(parseMoney(row.price)),
      invoiceable: parseMoney(row.price) > 0,
    })),
    ...materialRows.map((row) => {
      const quantity = parseMoney(row.quantity);
      const unitPrice = parseMoney(row.unitPrice);
      return {
        category: "material" as const,
        code: null,
        description: row.unitLabel ? `${row.name} (${row.unitLabel})` : row.name,
        quantity: row.quantity ?? "1",
        unitPrice: money(unitPrice),
        price: money(quantity * unitPrice),
        invoiceable: quantity > 0 && unitPrice > 0,
      };
    }),
  ];
  const lineItems: CustomerInvoicePdfLineItem[] = snapshotRows.length > 0
    ? snapshotRows.map((row) => ({
        category: row.category === "extra_work" || row.category === "material" ? row.category : "task",
        code: row.code ?? null,
        description: row.description,
        quantity: row.quantity ?? "1",
        unitPrice: row.unitPrice ?? "0",
        price: row.totalPrice ?? "0",
        invoiceable: row.invoiceable,
      }))
    : liveLineItems;
  const branding = await getTenantBranding(identity.tenantId);
  const invoiceNumber = displayInvoiceNumber(invoice.invoiceNumber, invoice.id.slice(0, 8));
  const companySnapshot = invoice.companySnapshotJson
    ? normalizeCompany(invoice.companySnapshotJson)
    : normalizeCompany(companyRows[0] ?? null);
  const templateSettings = invoice.templateSnapshotJson
    ? normalizeTemplate(invoice.templateSnapshotJson)
    : normalizeTemplate(templateRows[0] ?? null);
  const paymentSettings = invoice.paymentSettingsSnapshotJson
    ? normalizePayment(invoice.paymentSettingsSnapshotJson)
    : normalizePayment(paymentRows[0] ?? null);
  const paymentUrl = openPaymentRows[0]?.checkoutUrl ?? null;
  const paymentQrUrl = paymentUrl
    ? new URL(`/api/factuur/${invoice.id}/pay`, _request.url).toString()
    : null;

  const pdfBuffer = await generateCustomerInvoicePdf({
    brandName: companySnapshot.tradeName || companySnapshot.legalName || branding.displayName,
    invoiceNumber,
    customerName: invoice.customerName ?? identity.customerName,
    customerAddress: invoice.customerAddress ?? null,
    customerPostalCode: invoice.customerPostalCode ?? null,
    customerCity: invoice.customerCity ?? null,
    assignmentCode: invoice.assignmentCode,
    objectName: invoice.objectName ?? null,
    amount: invoice.amount ?? "0",
    vatPercentage: invoice.vatPercentage ?? "21",
    vatAmount: invoice.vatAmount ?? "0",
    totalAmount: invoice.totalAmount ?? "0",
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt.toISOString(),
    paymentUrl,
    paymentSettings,
    companySnapshot,
    templateSettings,
    lineItems,
  }, { paymentQrUrl });

  await db.insert(auditLogTable).values({
    userId:     identity.userId,
    action:     "customer_download_invoice_pdf",
    resource:   "invoices",
    resourceId: invoice.id,
    metadata: {
      invoiceNumber,
      assignmentId:  invoice.assignmentId,
      customerId:    identity.customerId,
      tenantId:      identity.tenantId,
    },
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizePdfFilename(invoiceNumber, `factuur-${invoice.id.slice(0, 8)}`)}.pdf"`,
      "Content-Length":      String(pdfBuffer.byteLength),
      "Cache-Control":       "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
