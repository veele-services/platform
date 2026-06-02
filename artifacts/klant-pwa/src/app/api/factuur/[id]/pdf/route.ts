export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import {
  invoicesTable,
  customersTable,
  assignmentTasksTable,
  taskCodesTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEur(val: string | null | undefined): string {
  if (!val) return "€ 0,00";
  return parseFloat(val).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // ── Fetch invoice + customer ─────────────────────────────────────────────────
  const [row] = await db
    .select({
      id:              invoicesTable.id,
      invoiceNumber:   invoicesTable.invoiceNumber,
      assignmentId:    invoicesTable.assignmentId,
      amount:          invoicesTable.amount,
      vatPercentage:   invoicesTable.vatPercentage,
      vatAmount:       invoicesTable.vatAmount,
      totalAmount:     invoicesTable.totalAmount,
      status:          invoicesTable.status,
      dueDate:         invoicesTable.dueDate,
      paidDate:        invoicesTable.paidDate,
      createdAt:       invoicesTable.createdAt,
      customerEmail:   customersTable.contactEmail,
      customerName:    customersTable.name,
      customerAddress: customersTable.address,
      customerCity:    customersTable.city,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, id))
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  // ── Ownership check ──────────────────────────────────────────────────────────
  if ((row.customerEmail ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Draft invoices are not available for download
  if (row.status === "draft") {
    return new NextResponse("Not available", { status: 403 });
  }

  // ── Fetch line items ─────────────────────────────────────────────────────────
  const lineItems = await db
    .select({
      code:  taskCodesTable.code,
      name:  taskCodesTable.name,
      price: taskCodesTable.price,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, row.assignmentId))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  // ── Build PDF ────────────────────────────────────────────────────────────────
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    const PRIMARY   = "#081D3A";
    const SECONDARY = "#64748B";
    const MUTED     = "#CBD5E1";
    const ACCENT    = "#1A6BFA";

    const L = 55;   // left margin
    const R = 540;  // right edge

    // ── Logo / company name ──
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

    // ── Invoice heading (right side) ──
    doc
      .fontSize(20)
      .fillColor(PRIMARY)
      .font("Helvetica-Bold")
      .text("FACTUUR", 350, 55, { width: 190, align: "right" });

    // ── Invoice meta ────────────────────────────────────────────────────────
    let y = 105;
    const labelX = 350;
    const valX   = 450;

    const meta: [string, string][] = [
      ["Factuurnummer", row.invoiceNumber],
      ["Factuurdatum",  fmtDate(row.createdAt.toISOString().slice(0, 10))],
      ["Vervaldatum",   fmtDate(row.dueDate)],
    ];

    for (const [label, value] of meta) {
      doc.fontSize(9).fillColor(SECONDARY).font("Helvetica").text(label, labelX, y, { width: 90 });
      doc.fontSize(9).fillColor(PRIMARY).font("Helvetica").text(value, valX, y, { width: 95 });
      y += 15;
    }

    // ── Customer block ───────────────────────────────────────────────────────
    doc
      .fontSize(9)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text("Aan:", L, 105);

    doc
      .fontSize(10)
      .fillColor(PRIMARY)
      .font("Helvetica-Bold")
      .text(row.customerName ?? "", L, 120, { width: 250 });

    let custY = 136;
    doc.fontSize(9).font("Helvetica").fillColor(SECONDARY);
    if (row.customerAddress) { doc.text(row.customerAddress, L, custY, { width: 250 }); custY += 13; }
    if (row.customerCity)    { doc.text(row.customerCity,    L, custY, { width: 250 }); }

    // ── Divider ──────────────────────────────────────────────────────────────
    const tableTopY = 190;
    doc.moveTo(L, tableTopY).lineTo(R, tableTopY).strokeColor(MUTED).lineWidth(1).stroke();

    // ── Table header ─────────────────────────────────────────────────────────
    const colCode  = L;
    const colName  = L + 60;
    const colQty   = R - 200;
    const colUnit  = R - 140;
    const colTotal = R - 75;

    const hdrY = tableTopY + 8;
    doc.fontSize(8).fillColor(SECONDARY).font("Helvetica-Bold");
    doc.text("Code",        colCode,  hdrY, { width: 55 });
    doc.text("Omschrijving",colName,  hdrY, { width: 130 });
    doc.text("Aantal",      colQty,   hdrY, { width: 55, align: "right" });
    doc.text("Prijs/st.",   colUnit,  hdrY, { width: 60, align: "right" });
    doc.text("Totaal",      colTotal, hdrY, { width: 75, align: "right" });

    const hdrLineY = hdrY + 14;
    doc.moveTo(L, hdrLineY).lineTo(R, hdrLineY).strokeColor(MUTED).lineWidth(0.5).stroke();

    // ── Line items ───────────────────────────────────────────────────────────
    let rowY = hdrLineY + 8;
    doc.fontSize(9).font("Helvetica");

    for (const item of lineItems) {
      if (rowY > 680) break;
      const qty       = 1;
      const unitPrice = parseFloat(item.price ?? "0");
      const lineTotal = qty * unitPrice;
      doc.fillColor(SECONDARY).text(item.code ?? "—",  colCode,  rowY, { width: 55 });
      doc.fillColor(PRIMARY).text(item.name ?? "—",    colName,  rowY, { width: 130 });
      doc.fillColor(SECONDARY).text(String(qty),       colQty,   rowY, { width: 55, align: "right" });
      doc.fillColor(PRIMARY).text(fmtEur(item.price),  colUnit,  rowY, { width: 60, align: "right" });
      doc.fillColor(PRIMARY).text(fmtEur(item.price ? String(lineTotal) : null), colTotal, rowY, { width: 75, align: "right" });
      rowY += 18;
    }

    // ── Divider above totals ─────────────────────────────────────────────────
    const divY = rowY + 8;
    doc.moveTo(L, divY).lineTo(R, divY).strokeColor(MUTED).lineWidth(0.5).stroke();

    // ── Totals ───────────────────────────────────────────────────────────────
    const totLabelX = 360;
    const totValX   = R - 80;
    let   totY      = divY + 12;

    doc.fontSize(9).fillColor(SECONDARY).font("Helvetica");
    doc.text(`Subtotaal (excl. btw)`,               totLabelX, totY, { width: 100 });
    doc.fillColor(PRIMARY).text(fmtEur(row.amount),  totValX,   totY, { width: 80, align: "right" });
    totY += 16;

    doc.fillColor(SECONDARY).text(`Btw ${row.vatPercentage ?? "21"}%`, totLabelX, totY, { width: 100 });
    doc.fillColor(PRIMARY).text(fmtEur(row.vatAmount),                  totValX,   totY, { width: 80, align: "right" });
    totY += 14;

    doc.moveTo(totLabelX, totY).lineTo(R, totY).strokeColor(MUTED).lineWidth(0.5).stroke();
    totY += 10;

    doc.fontSize(11).font("Helvetica-Bold").fillColor(PRIMARY);
    doc.text("Totaal",                   totLabelX, totY, { width: 100 });
    doc.text(fmtEur(row.totalAmount),    totValX,   totY, { width: 80, align: "right" });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text(
        "Veele Serviceplatform  ·  Bedankt voor uw opdracht.",
        L,
        760,
        { width: R - L, align: "center" },
      );

    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${row.invoiceNumber}.pdf"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
