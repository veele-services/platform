import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@workspace/db";
import {
  reportsTable,
  assignmentsTable,
  customersTable,
  objectsTable,
  personnelTable,
  assignmentPersonnelTable,
} from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";
import { eq, and } from "drizzle-orm";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

const submitterPersonnel = alias(personnelTable, "submitter_personnel");
const reviewerPersonnel  = alias(personnelTable, "reviewer_personnel");

function fmtDate(val: string | Date | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtDateTime(val: string | Date | null | undefined): string {
  if (!val) return "—";
  const d = typeof val === "string" ? new Date(val) : val;
  return d.toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth + permission ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const canRead = await hasPermission("reports", "read");
  if (!canRead) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Fetch report data ────────────────────────────────────────────────────────
  const [row] = await db
    .select({
      id:              reportsTable.id,
      status:          reportsTable.status,
      content:         reportsTable.content,
      hoursWorked:     reportsTable.hoursWorked,
      submitterNotes:  reportsTable.submitterNotes,
      notes:           reportsTable.notes,
      submittedBy:     reportsTable.submittedBy,
      submittedAt:     reportsTable.submittedAt,
      reviewedBy:      reportsTable.reviewedBy,
      reviewedAt:      reportsTable.reviewedAt,
      assignmentId:    assignmentsTable.id,
      assignmentCode:  assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate:   assignmentsTable.scheduledDate,
      customerName:    customersTable.name,
      objectName:      objectsTable.name,
      objectAddress:   objectsTable.address,
      submitterFirst:  submitterPersonnel.firstName,
      submitterLast:   submitterPersonnel.lastName,
      reviewerFirst:   reviewerPersonnel.firstName,
      reviewerLast:    reviewerPersonnel.lastName,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable,  eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable,    eq(assignmentsTable.objectId,   objectsTable.id))
    .leftJoin(submitterPersonnel, eq(submitterPersonnel.userId, reportsTable.submittedBy))
    .leftJoin(reviewerPersonnel,  eq(reviewerPersonnel.userId,  reportsTable.reviewedBy!))
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Non-management users may only download their own reports
  const canWrite = await hasPermission("reports", "write");
  if (!canWrite && row.submittedBy !== user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Only approved reports can be downloaded
  if (row.status !== "approved") {
    return new NextResponse("Rapport is nog niet goedgekeurd.", { status: 403 });
  }

  // ── Fetch assigned personnel ─────────────────────────────────────────────────
  const personnel = await db
    .select({
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(personnelTable, eq(personnelTable.id, assignmentPersonnelTable.personnelId))
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, row.assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    );

  // ── Build PDF ────────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    const PRIMARY   = "#081D3A";
    const SECONDARY = "#64748B";
    const MUTED     = "#CBD5E1";
    const ACCENT    = "#00B7B3";
    const SUCCESS   = "#065F46";

    const L = 55;   // left margin
    const R = 540;  // right edge
    const W = R - L;

    // ── Logo / company name ──────────────────────────────────────────────────
    doc
      .fontSize(22)
      .fillColor(ACCENT)
      .font("Helvetica-Bold")
      .text("Veele", L, 55);

    doc
      .fontSize(9)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text("Serviceplatform", L, 82);

    // ── "RAPPORT" heading (right side) ───────────────────────────────────────
    doc
      .fontSize(20)
      .fillColor(PRIMARY)
      .font("Helvetica-Bold")
      .text("RAPPORT", 350, 55, { width: 190, align: "right" });

    // ── Status badge ─────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .fillColor(SUCCESS)
      .font("Helvetica-Bold")
      .text("✓ Goedgekeurd", 350, 84, { width: 190, align: "right" });

    // ── Divider ──────────────────────────────────────────────────────────────
    const dividerY = 108;
    doc.moveTo(L, dividerY).lineTo(R, dividerY).strokeColor(MUTED).lineWidth(1).stroke();

    // ── Assignment block (left) ──────────────────────────────────────────────
    let leftY = dividerY + 14;

    doc.fontSize(8).fillColor(SECONDARY).font("Helvetica").text("OPDRACHT", L, leftY);
    leftY += 12;

    doc.fontSize(11).fillColor(PRIMARY).font("Helvetica-Bold")
       .text(row.assignmentTitle, L, leftY, { width: 260 });
    leftY += 16;

    doc.fontSize(9).fillColor(SECONDARY).font("Helvetica")
       .text(`Code: ${row.assignmentCode}`, L, leftY);
    leftY += 13;

    if (row.customerName) {
      doc.text(`Klant: ${row.customerName}`, L, leftY);
      leftY += 13;
    }
    if (row.objectName) {
      const loc = row.objectAddress
        ? `${row.objectName} — ${row.objectAddress}`
        : row.objectName;
      doc.text(`Object: ${loc}`, L, leftY, { width: 260 });
      leftY += 13;
    }

    // ── Meta block (right) ───────────────────────────────────────────────────
    const metaX     = 330;
    const metaValX  = 430;
    let   metaY     = dividerY + 14;

    const submitterName = (row.submitterFirst && row.submitterLast)
      ? `${row.submitterFirst} ${row.submitterLast}`.trim()
      : "—";

    const reviewerName = (row.reviewerFirst && row.reviewerLast)
      ? `${row.reviewerFirst} ${row.reviewerLast}`.trim()
      : "—";

    const metaRows: [string, string][] = [
      ["Datum uitvoering", row.scheduledDate ? fmtDate(row.scheduledDate) : "—"],
      ["Ingediend door",   submitterName],
      ["Ingediend op",     fmtDateTime(row.submittedAt)],
      ["Goedgekeurd op",   fmtDateTime(row.reviewedAt)],
      ["Goedgekeurd door", reviewerName],
    ];

    if (row.hoursWorked) {
      metaRows.splice(1, 0, ["Gewerkte uren", `${row.hoursWorked} uur`]);
    }

    for (const [label, value] of metaRows) {
      doc.fontSize(8).fillColor(SECONDARY).font("Helvetica").text(label, metaX, metaY, { width: 95 });
      doc.fontSize(8).fillColor(PRIMARY).font("Helvetica").text(value, metaValX, metaY, { width: 110 });
      metaY += 14;
    }

    // ── Personnel list ───────────────────────────────────────────────────────
    if (personnel.length > 0) {
      const names = personnel.map(p => `${p.firstName} ${p.lastName}`.trim()).join(", ");
      doc.fontSize(8).fillColor(SECONDARY).font("Helvetica").text("Uitvoerende medewerker(s)", metaX, metaY, { width: 95 });
      doc.fontSize(8).fillColor(PRIMARY).text(names, metaValX, metaY, { width: 110 });
      metaY += 14;
    }

    // ── Divider before body ──────────────────────────────────────────────────
    const bodyDivY = Math.max(leftY, metaY) + 14;
    doc.moveTo(L, bodyDivY).lineTo(R, bodyDivY).strokeColor(MUTED).lineWidth(0.5).stroke();

    // ── Rapportinhoud ────────────────────────────────────────────────────────
    let bodyY = bodyDivY + 16;

    doc.fontSize(9).fillColor(SECONDARY).font("Helvetica-Bold")
       .text("RAPPORTINHOUD", L, bodyY);
    bodyY += 14;

    doc.fontSize(10).fillColor(PRIMARY).font("Helvetica")
       .text(row.content, L, bodyY, { width: W, lineGap: 2 });
    bodyY = doc.y + 16;

    // ── Opmerkingen medewerker ───────────────────────────────────────────────
    if (row.submitterNotes) {
      doc.fontSize(9).fillColor(SECONDARY).font("Helvetica-Bold")
         .text("OPMERKINGEN MEDEWERKER", L, bodyY);
      bodyY += 14;

      doc.fontSize(10).fillColor(PRIMARY).font("Helvetica")
         .text(row.submitterNotes, L, bodyY, { width: W, lineGap: 2 });
      bodyY = doc.y + 16;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const totalPages = (doc.bufferedPageRange().count) || 1;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(SECONDARY).font("Helvetica")
         .text(
           `Veele Serviceplatform  ·  Rapport ${row.assignmentCode}  ·  Gegenereerd ${fmtDateTime(new Date())}`,
           L, 760, { width: W, align: "center" },
         );
    }

    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename  = `rapport-${row.assignmentCode.replace(/[^a-zA-Z0-9-_]/g, "-")}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
