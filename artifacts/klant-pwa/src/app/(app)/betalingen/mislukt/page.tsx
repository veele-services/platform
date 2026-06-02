export const dynamic = "force-dynamic";

import Link from "next/link";
import { XCircle, RefreshCw, Receipt } from "lucide-react";
import { getMyInvoice } from "@/actions/invoices";

interface Props {
  searchParams: Promise<{ invoice?: string }>;
}

export default async function BetaalingMisluktPage({ searchParams }: Props) {
  const { invoice: invoiceId } = await searchParams;

  const invoice = invoiceId ? await getMyInvoice(invoiceId) : null;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        <div
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: "#FEE2E2" }}
        >
          <XCircle size={40} style={{ color: "#DC2626" }} />
        </div>

        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
            Betaling niet geslaagd
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-secondary)" }}>
            De betaling is niet afgerond. U kunt het opnieuw proberen via onderstaande knop.
          </p>
          {invoice && (
            <p className="mt-1 text-xs font-mono" style={{ color: "var(--color-secondary)" }}>
              Factuur {invoice.invoiceNumber}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {invoice?.checkoutUrl ? (
            <Link
              href={invoice.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <RefreshCw size={16} />
              Probeer opnieuw
            </Link>
          ) : null}

          <Link
            href="/klant/facturen"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{
              borderColor:     "var(--color-border)",
              color:           "var(--color-primary)",
              backgroundColor: "white",
            }}
          >
            <Receipt size={16} />
            Naar mijn facturen
          </Link>
        </div>
      </div>
    </div>
  );
}
