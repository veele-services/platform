import { NextResponse } from "next/server";
import { db, invoicesTable, paymentsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getMyCustomerIdentity } from "@/actions/customer";
import { isCustomerPortalFeatureEnabled } from "@/lib/portal-features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getMyCustomerIdentity();
  if (!identity) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await isCustomerPortalFeatureEnabled("finance", identity.tenantId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const [payment] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(paymentsTable.invoiceId, id),
        eq(paymentsTable.tenantId, identity.tenantId),
        eq(paymentsTable.status, "open"),
        eq(invoicesTable.customerId, identity.customerId),
        eq(invoicesTable.tenantId, identity.tenantId),
        inArray(invoicesTable.status, ["sent", "paid"]),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  if (!payment?.checkoutUrl)
    return new NextResponse("Payment link not found", { status: 404 });

  return NextResponse.redirect(payment.checkoutUrl, 302);
}
