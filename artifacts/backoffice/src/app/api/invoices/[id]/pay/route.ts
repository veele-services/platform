import { NextResponse } from "next/server";
import { db, invoicesTable, paymentsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [payment] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(paymentsTable.invoiceId, id),
        eq(paymentsTable.tenantId, invoicesTable.tenantId),
        eq(paymentsTable.status, "open"),
        eq(invoicesTable.status, "sent"),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  if (!payment?.checkoutUrl) {
    return new NextResponse("Payment link not found", { status: 404 });
  }

  return NextResponse.redirect(payment.checkoutUrl, 302);
}
