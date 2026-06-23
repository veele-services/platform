import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getInvoice } from "@/app/actions/invoices";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const pdfBuffer = await generateInvoicePdf(invoice);
  const filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
