import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getQuote } from "@/app/actions/quotes";
import { generateQuotePdf } from "@/lib/quote-pdf";
import { sanitizePdfFilename } from "@/lib/pdf-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return new NextResponse("Not found", { status: 404 });

  const pdfBuffer = await generateQuotePdf(quote);
  const filename = `${sanitizePdfFilename(quote.quoteNumber, `offerte-${quote.id.slice(0, 8)}`)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
    },
  });
}
