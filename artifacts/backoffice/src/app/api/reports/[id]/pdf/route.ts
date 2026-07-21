import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { and, asc, eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
import { db } from "@workspace/db";
import {
  getTenantBoundAssignmentMediaStoragePath,
  getTenantBranding,
  assignmentPhotosTable,
  assignmentsTable,
  customersTable,
  objectsTable,
  reportsTable,
} from "@workspace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "assignment-photos";
const BRAND = {
  navy:   "#081D3A",
  teal:   "#00B7B3",
  slate:  "#64748B",
  border: "#E2E8F0",
  soft:   "#F8FAFC",
  ink:    "#111827",
  green:  "#065F46",
};

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return "-";
  const d = typeof val === "string" ? new Date(val) : val;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtDateTime(val: string | Date | null | undefined): string {
  if (!val) return "-";
  const d = typeof val === "string" ? new Date(val) : val;
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchImageBuffer(signedUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(signedUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, reference: string, brandName: string) {
  const rawBrandTitle = brandName.trim().toUpperCase() || "FIELDGRID";
  const brandTitle = rawBrandTitle.length > 14 ? `${rawBrandTitle.slice(0, 13)}.` : rawBrandTitle;
  const titleFontSize = brandTitle.length > 10 ? 12 : brandTitle.length > 8 ? 15 : 22;

  doc.rect(0, 0, 595.28, 122).fill(BRAND.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(titleFontSize).text(brandTitle, 55, 38, {
    width: 120,
    height: 20,
    ellipsis: true,
  });
  doc.fillColor("#7DF3EF").font("Helvetica").fontSize(8).text("FIELDGRID", 57, 64, { characterSpacing: 2 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text(title, 330, 38, { width: 210, align: "right" });
  doc.fillColor("#C7D2FE").font("Helvetica").fontSize(9).text(reference, 330, 66, { width: 210, align: "right" });
}

function ensurePage(doc: PDFKit.PDFDocument, y: number, needed = 80): number {
  if (y + needed <= 770) return y;
  doc.addPage();
  return 55;
}

function drawFooter(doc: PDFKit.PDFDocument, assignmentCode: string, brandName: string) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(BRAND.slate)
      .text(`${brandName} - Rapport ${assignmentCode} - Gegenereerd ${fmtDateTime(new Date())}`, 55, 800, {
        width: 485,
        align: "center",
      });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const canRead = await hasPermission("reports", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });
  const tenantId = await requireCurrentTenantId();
  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "reports",
    accessLevel: "export",
    resourceType: "reports",
    resourceId: id,
    exportDownload: true,
    metadata: { format: "pdf" },
  });
  const branding = await getTenantBranding(tenantId);
  const brandName = branding.displayName || "Fieldgrid";

  const [row] = await db
    .select({
      id:              reportsTable.id,
      status:          reportsTable.status,
      content:         reportsTable.content,
      hoursWorked:     reportsTable.hoursWorked,
      submitterNotes:  reportsTable.submitterNotes,
      submittedBy:     reportsTable.submittedBy,
      submittedAt:     reportsTable.submittedAt,
      reviewedAt:      reportsTable.reviewedAt,
      assignmentId:    assignmentsTable.id,
      assignmentCode:  assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate:   assignmentsTable.scheduledDate,
      customerName:    customersTable.name,
      objectName:      objectsTable.name,
      objectAddress:   objectsTable.address,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(and(eq(reportsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) return new NextResponse("Not found", { status: 404 });

  const canWrite = await hasPermission("reports", "write");
  if (!canWrite && row.submittedBy !== user.id) return new NextResponse("Forbidden", { status: 403 });
  if (row.status !== "approved") return new NextResponse("Rapport is nog niet goedgekeurd.", { status: 403 });

  const rawPhotos = await db
    .select({ id: assignmentPhotosTable.id, storagePath: assignmentPhotosTable.storagePath })
    .from(assignmentPhotosTable)
    .where(and(eq(assignmentPhotosTable.assignmentId, row.assignmentId), eq(assignmentPhotosTable.isApproved, true)))
    .orderBy(asc(assignmentPhotosTable.createdAt));

  const admin = createAdminClient();
  const signed = await Promise.all(
    rawPhotos.map(async (photo) => {
      const safeStoragePath = getTenantBoundAssignmentMediaStoragePath(
        photo.storagePath,
        tenantId,
        row.assignmentId,
        { allowLegacyAssignmentRoot: true, allowLegacyPluralTenantRoot: true, allowLegacyTenantRoot: true },
      );
      if (!safeStoragePath) return null;
      const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(safeStoragePath, 300);
      return data?.signedUrl ?? null;
    }),
  );
  const photoBuffers = (await Promise.all(signed.map((url) => (url ? fetchImageBuffer(url) : null))))
    .filter((buffer): buffer is Buffer => Boolean(buffer));

  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawHeader(doc, "RAPPORTAGE", row.assignmentCode, brandName);

    const L = 55;
    const R = 540;
    const W = R - L;
    let y = 148;

    doc.roundedRect(L, y, W, 132, 12).fill(BRAND.soft).strokeColor(BRAND.border).stroke();
    doc.fillColor(BRAND.slate).font("Helvetica-Bold").fontSize(8).text("OPDRACHT", L + 18, y + 16);
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(13).text(row.assignmentTitle, L + 18, y + 34, { width: 245 });
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9).text(`Klant: ${row.customerName ?? "-"}`, L + 18, y + 58, { width: 245 });
    const objectLine = row.objectAddress ? `${row.objectName ?? "-"} - ${row.objectAddress}` : (row.objectName ?? "-");
    doc.text(`Object: ${objectLine}`, L + 18, y + 74, { width: 245 });

    const metaX = 340;
    const metaRows: [string, string][] = [
      ["Datum uitvoering", fmtDate(row.scheduledDate)],
      ["Gewerkte uren", row.hoursWorked ? `${row.hoursWorked} uur` : "-"],
      ["Ingediend door", brandName],
      ["Ingediend op", fmtDateTime(row.submittedAt)],
      ["Goedgekeurd door", brandName],
      ["Goedgekeurd op", fmtDateTime(row.reviewedAt)],
    ];
    let metaY = y + 18;
    for (const [label, value] of metaRows) {
      doc.fillColor(BRAND.slate).font("Helvetica").fontSize(8).text(label, metaX, metaY, { width: 92 });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(8).text(value, metaX + 98, metaY, { width: 92 });
      metaY += 16;
    }

    y += 162;
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(13).text("Rapportage", L, y);
    y += 22;
    doc.roundedRect(L, y, W, Math.max(72, doc.heightOfString(row.content, { width: W - 28 }) + 28), 12)
      .fill("#FFFFFF")
      .strokeColor(BRAND.border)
      .stroke();
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(10).text(row.content, L + 14, y + 14, { width: W - 28, lineGap: 2 });
    y = doc.y + 28;

    if (row.submitterNotes) {
      y = ensurePage(doc, y, 82);
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(12).text("Aanvullende notitie", L, y);
      y += 20;
      doc.roundedRect(L, y, W, Math.max(58, doc.heightOfString(row.submitterNotes, { width: W - 28 }) + 26), 12)
        .fill("#FFFFFF")
        .strokeColor(BRAND.border)
        .stroke();
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9).text(row.submitterNotes, L + 14, y + 13, { width: W - 28, lineGap: 2 });
      y = doc.y + 28;
    }

    if (photoBuffers.length > 0) {
      doc.addPage();
      drawHeader(doc, "BIJLAGEN", row.assignmentCode, brandName);
      y = 148;
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(13).text("Goedgekeurde foto's", L, y);
      y += 26;

      const thumbW = 220;
      const thumbH = 156;
      const gap = 22;
      for (let i = 0; i < photoBuffers.length; i++) {
        const col = i % 2;
        if (col === 0) y = ensurePage(doc, y, thumbH + 34);
        const x = col === 0 ? L : L + thumbW + gap;
        doc.roundedRect(x, y, thumbW, thumbH + 22, 10).fill("#FFFFFF").strokeColor(BRAND.border).stroke();
        doc.image(photoBuffers[i]!, x + 8, y + 8, { fit: [thumbW - 16, thumbH - 16], align: "center", valign: "center" });
        doc.fillColor(BRAND.slate).font("Helvetica").fontSize(8).text(`Foto ${i + 1}`, x + 8, y + thumbH + 4, { width: thumbW - 16 });
        if (col === 1) y += thumbH + 34;
      }
    }

    drawFooter(doc, row.assignmentCode, brandName);
    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `rapport-${row.assignmentCode.replace(/[^a-zA-Z0-9-_]/g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
      "Cache-Control":       "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
