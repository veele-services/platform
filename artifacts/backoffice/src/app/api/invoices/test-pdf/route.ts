import { NextResponse } from "next/server";
import { getInvoiceSettings } from "@/app/actions/invoice-settings";
import type { InvoiceDetail } from "@/app/actions/invoices";
import { hasPermission } from "@/lib/auth/permissions";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addDaysAsIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sampleInvoice(settings: Awaited<ReturnType<typeof getInvoiceSettings>>): InvoiceDetail {
  const amount = "100.00";
  const vatPercentage = "21.00";
  const vatAmount = "21.00";
  const totalAmount = "121.00";
  const companyName = settings.company.tradeName || settings.company.legalName || "Uw organisatie";

  return {
    id: "test-invoice-preview",
    brandName: companyName,
    invoiceNumber: `TEST-${settings.preview.invoiceNumber}`,
    officialInvoiceNumber: null,
    finalizedAt: null,
    customerId: "test-customer",
    customerName: "Voorbeeldklant B.V.",
    customerAddress: "Voorbeeldstraat 12",
    customerCity: "Amsterdam",
    customerPostalCode: "1000 AA",
    customerEmail: "administratie@voorbeeld.nl",
    assignmentId: "test-assignment",
    assignmentCode: "TEST-OPDRACHT",
    assignmentTitle: "Voorbeeldopdracht",
    scheduledDate: new Date().toISOString().slice(0, 10),
    objectName: "Voorbeeldobject",
    amount,
    vatPercentage,
    vatAmount,
    totalAmount,
    status: "draft",
    dueDate: addDaysAsIsoDate(settings.company.defaultPaymentTermDays),
    paidDate: null,
    notes: "Testfactuur uit factuurinstellingen. Deze PDF claimt geen officieel factuurnummer.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentUrl: settings.payment.showPaymentLinkOnInvoice ? "https://example.com/betaal/testfactuur" : null,
    paymentSettings: settings.payment,
    companySnapshot: {
      legalName: settings.company.legalName,
      tradeName: settings.company.tradeName || null,
      addressLine1: settings.company.addressLine1 || null,
      addressLine2: settings.company.addressLine2 || null,
      postalCode: settings.company.postalCode || null,
      city: settings.company.city || null,
      country: settings.company.country || "Nederland",
      kvkNumber: settings.company.kvkNumber || null,
      vatNumber: settings.company.vatNumber || null,
      iban: settings.company.iban || null,
      bic: settings.company.bic || null,
      administrationEmail: settings.company.administrationEmail || null,
      phone: settings.company.phone || null,
      website: settings.company.website || null,
      logoUrl: settings.company.logoUrl || null,
      primaryColor: settings.company.primaryColor,
      secondaryColor: settings.company.secondaryColor,
      defaultPaymentTermDays: settings.company.defaultPaymentTermDays,
    },
    templateSettings: {
      logoUrl: settings.template.logoUrl || null,
      primaryColor: settings.template.primaryColor,
      secondaryColor: settings.template.secondaryColor,
      introText: settings.template.introText || "Dit is een testfactuur om uw PDF-opmaak te controleren.",
      footerText: settings.template.footerText || null,
      paymentInstruction: settings.template.paymentInstruction,
      showLogo: settings.template.showLogo,
      showCompanyFooter: settings.template.showCompanyFooter,
      showKvkFooter: settings.template.showKvkFooter,
      showVatFooter: settings.template.showVatFooter,
      showIbanFooter: settings.template.showIbanFooter,
    },
    lineItems: [
      {
        category: "task",
        taskCodeCode: "TEST",
        taskCodeName: "Voorbeeldregel",
        description: "Voorbeeldregel definitieve factuur",
        quantity: "1.00",
        unitPrice: amount,
        price: amount,
        invoiceable: true,
      },
    ],
  };
}

export async function GET() {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const settings = await getInvoiceSettings();
  const pdfBuffer = await generateInvoicePdf(sampleInvoice(settings));

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"testfactuur-preview.pdf\"",
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
