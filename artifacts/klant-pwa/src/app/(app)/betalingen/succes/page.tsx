export const dynamic = "force-dynamic";

import Link from "next/link";
import { CheckCircle2, Receipt } from "lucide-react";
import { getMyInvoice } from "@/actions/invoices";
import { requireCustomerPortalFeature } from "@/lib/portal-features";

interface Props {
  searchParams: Promise<{ invoice?: string }>;
}

export default async function BetaalingSuccesPage({ searchParams }: Props) {
  await requireCustomerPortalFeature("finance");
  const { invoice: invoiceId } = await searchParams;

  const invoice = invoiceId ? await getMyInvoice(invoiceId) : null;
  const isPaid = invoice?.status === "paid";

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "#DCFCE7" }}
        >
          <CheckCircle2 size={40} style={{ color: "#16A34A" }} />
        </div>

        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            Betaling ontvangen
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-secondary)" }}
          >
            {isPaid
              ? "Uw betaling is bevestigd. Dank u wel!"
              : "Uw betaling wordt verwerkt. Dit kan even duren — u ontvangt een bevestiging zodra de betaling is afgerond."}
          </p>
          {invoice && (
            <p
              className="mt-1 text-xs font-mono"
              style={{ color: "var(--color-secondary)" }}
            >
              Factuur {invoice.invoiceNumber}
            </p>
          )}
        </div>

        <Link
          href="/facturen?paid=1"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <Receipt size={16} />
          Naar mijn facturen
        </Link>
      </div>
    </div>
  );
}
