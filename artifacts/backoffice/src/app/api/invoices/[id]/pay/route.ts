import { NextResponse } from "next/server";
import { db, invoicesTable, paymentsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { hasPermissionFromRequest } from "@/lib/auth/permissions";
import { requireCurrentTenantIdFromRequest } from "@/lib/auth/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await hasPermissionFromRequest(request, "invoices", "read"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const tenantId = await requireCurrentTenantIdFromRequest(request);
  const { id } = await params;
  const [payment] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(paymentsTable.invoiceId, id),
        eq(invoicesTable.tenantId, tenantId),
        eq(paymentsTable.tenantId, tenantId),
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
