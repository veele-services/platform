import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getInvoice } from "@/app/actions/invoices";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { sanitizePdfFilename } from "@/lib/pdf-style";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const tenantId = await requireCurrentTenantId();
  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_invoices",
    accessLevel: "export",
    resourceType: "invoices",
    resourceId: id,
    exportDownload: true,
    metadata: { format: "pdf" },
  });
  const invoice = await getInvoice(id);
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const pdfBuffer = await generateInvoicePdf(invoice);
  const filename = `${sanitizePdfFilename(invoice.invoiceNumber, `factuur-${invoice.id.slice(0, 8)}`)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
