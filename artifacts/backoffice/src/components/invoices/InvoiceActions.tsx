"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  Copy,
  Check,
  Mail,
  FileCheck2,
} from "lucide-react";
import {
  finalizeInvoiceDraft,
  markInvoiceSent,
  markInvoicePaid,
  cancelInvoice,
  emailInvoice,
} from "@/app/actions/invoices";
import {
  createMolliePayment,
  type PaymentRecord,
} from "@/app/actions/payments";
import type { InvoiceStatus } from "@/app/actions/invoices";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  invoiceId: string;
  status: InvoiceStatus;
  finalizedAt?: string | null;
  invoiceNumber?: string | null;
  paymentHistory: PaymentRecord[];
  customerEmail: string | null;
}

export function InvoiceActions({
  invoiceId,
  status,
  finalizedAt,
  invoiceNumber,
  paymentHistory,
  customerEmail,
}: Props) {
  const router = useRouter();
  const [, startT] = useTransition();

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function handleAction(action: "finalize" | "sent" | "paid") {
    setError(null);
    setLoading(action);

    const result =
      action === "finalize"
        ? await finalizeInvoiceDraft(invoiceId)
        : action === "sent"
          ? await markInvoiceSent(invoiceId)
          : await markInvoicePaid(invoiceId);

    setLoading(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    startT(() => router.refresh());
  }

  async function handleCancelInvoice() {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setError("Geef een duidelijke annuleringsreden op.");
      return;
    }
    setError(null);
    setLoading("cancel");
    const result = await cancelInvoice(invoiceId, reason);
    setLoading(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setCancelOpen(false);
    setCancelReason("");
    // Cancellation changes both the invoice and its assignment atomically.
    // Reload the server-rendered detail after success so the user cannot remain
    // on a stale sent-invoice view when an App Router refresh stalls.
    window.location.reload();
  }

  async function handleCreatePaymentLink() {
    setError(null);
    setLoading("payment");
    const result = await createMolliePayment(invoiceId);
    setLoading(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    const url = (result as { success: true; data: { checkoutUrl: string } })
      .data?.checkoutUrl;
    if (url) setCheckoutUrl(url);
    startT(() => router.refresh());
  }

  async function handleEmailInvoice() {
    setError(null);
    setEmailOpen(false);
    setLoading("email");
    const result = await emailInvoice(invoiceId);
    setLoading(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setEmailSent(true);
    startT(() => router.refresh());
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopiëren naar klembord mislukt. Kopieer de URL handmatig.");
    }
  }

  const hasPaidPayment = paymentHistory.some((p) => p.status === "paid");
  const hasOpenPayment = paymentHistory.some((p) => p.status === "open");
  const latestCheckoutUrl =
    checkoutUrl ?? paymentHistory.find((p) => p.status === "open")?.checkoutUrl;
  const isFinalized = Boolean(finalizedAt || invoiceNumber?.trim());

  if (status === "paid" || status === "cancelled") {
    // Only show payment history (no action buttons)
    if (paymentHistory.length === 0) return null;
    return <PaymentHistoryCard paymentHistory={paymentHistory} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Action buttons ── */}
      <div className="veele-card flex flex-col gap-3">
        <h3
          className="font-heading text-sm font-semibold"
          style={{ color: "var(--color-foreground)" }}
        >
          Acties
        </h3>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2"
            style={{ background: "#FEE2E2", color: "#991B1B" }}
          >
            {error}
          </p>
        )}

        {emailSent && (
          <p
            className="text-xs rounded-lg px-3 py-2 flex items-center gap-1.5"
            style={{ background: "#D1FAE5", color: "#065F46" }}
          >
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            E-mail verstuurd naar {customerEmail}
          </p>
        )}

        {status === "draft" && (
          <>
            {!isFinalized && (
              <button
                disabled={loading !== null}
                onClick={() => handleAction("finalize")}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ backgroundColor: "var(--color-foreground)", color: "#FFFFFF" }}
              >
                {loading === "finalize" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck2 className="h-4 w-4" />
                )}
                Finaliseren
              </button>
            )}
            <button
              disabled={loading !== null}
              onClick={() => handleAction("sent")}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)", color: "#FFFFFF" }}
            >
              {loading === "sent" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isFinalized ? "Verzenden" : "Finaliseren en verzenden"}
            </button>
          </>
        )}

        {status === "sent" && !hasPaidPayment && (
          <>
            {/* Mollie betaallink */}
            <button
              disabled={loading !== null}
              onClick={handleCreatePaymentLink}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary)", color: "#FFFFFF" }}
            >
              {loading === "payment" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LinkIcon className="h-4 w-4" />
              )}
              {hasOpenPayment
                ? "Nieuwe betaallink aanmaken"
                : "Betaallink aanmaken"}
            </button>

            {/* Show checkout URL */}
            {latestCheckoutUrl && (
              <div
                className="rounded-lg p-3 flex flex-col gap-2"
                style={{ background: "#F0FDFA", border: "1px solid #99F6E4" }}
              >
                <p
                  className="text-xs font-semibold"
                  style={{ color: "#0F766E" }}
                >
                  Betaallink gereed
                </p>
                <p
                  className="text-xs break-all font-mono"
                  style={{ color: "#374151" }}
                >
                  {latestCheckoutUrl}
                </p>
                <button
                  onClick={() => handleCopy(latestCheckoutUrl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold self-start transition-colors"
                  style={{
                    background: copied ? "#D1FAE5" : "#E0F2F1",
                    color: copied ? "#065F46" : "#0F766E",
                  }}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Gekopieerd!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Link kopiëren
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Manual paid button */}
            <button
              disabled={loading !== null}
              onClick={() => handleAction("paid")}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
              style={{
                borderColor: "#10B981",
                color: "#065F46",
                backgroundColor: "transparent",
              }}
            >
              {loading === "paid" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Betaald markeren
            </button>
          </>
        )}

        {/* Verstuur per e-mail — only for sent invoices with a known customer email */}
        {status === "sent" && customerEmail && (
          <button
            disabled={loading !== null}
            onClick={() => setEmailOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
            style={{
              borderColor: "#CBD5E1",
              color: "#374151",
              backgroundColor: "transparent",
            }}
          >
            {loading === "email" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Verstuur per e-mail
          </button>
        )}

        {(status === "draft" || status === "sent") && (
          <button
            disabled={loading !== null}
            onClick={() => setCancelOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-60"
            style={{
              borderColor: "#E2E8F0",
              color: "#64748B",
              backgroundColor: "transparent",
            }}
          >
            {loading === "cancel" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Annuleren
          </button>
        )}
      </div>

      {/* ── Payment history ── */}
      {paymentHistory.length > 0 && (
        <PaymentHistoryCard paymentHistory={paymentHistory} />
      )}

      {/* ── E-mail bevestigingsdialoog ── */}
      <AlertDialog open={emailOpen} onOpenChange={setEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factuur per e-mail versturen</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3">
                <p>De factuur wordt als PDF-bijlage verstuurd naar:</p>
                <p
                  className="font-mono text-sm rounded-lg px-3 py-2"
                  style={{
                    background: "#F8FAFC",
                    color: "var(--color-foreground)",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  {customerEmail}
                </p>
                <p className="text-sm" style={{ color: "#64748B" }}>
                  Als er een actieve betaallink bestaat, wordt deze meegestuurd
                  in de e-mail.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmailInvoice}
              style={{ backgroundColor: "var(--color-foreground)", color: "#fff" }}
            >
              Versturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factuur annuleren</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3">
                <p>
                  De factuur wordt geannuleerd en de opdracht wordt opnieuw
                  beschikbaar voor een gecorrigeerde factuur.
                </p>
                <label
                  htmlFor="invoice-cancellation-reason"
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-foreground)" }}
                >
                  Reden
                </label>
                <textarea
                  id="invoice-cancellation-reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Beschrijf waarom deze factuur wordt geannuleerd"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "#CBD5E1", color: "var(--color-foreground)" }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Terug</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading !== null || cancelReason.trim().length < 3}
              onClick={(event) => {
                event.preventDefault();
                void handleCancelInvoice();
              }}
              style={{ backgroundColor: "#991B1B", color: "#fff" }}
            >
              Factuur annuleren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PaymentHistoryCard({
  paymentHistory,
}: {
  paymentHistory: PaymentRecord[];
}) {
  return (
    <div className="veele-card">
      <h3
        className="font-heading text-sm font-semibold mb-3"
        style={{ color: "var(--color-foreground)" }}
      >
        Betalingshistorie
      </h3>
      <div className="flex flex-col gap-2">
        {paymentHistory.map((p) => (
          <div
            key={p.id}
            className="rounded-lg p-3 flex flex-col gap-1"
            style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-foreground)" }}
              >
                {formatEur(p.amountCents)}
              </span>
              <ProcessStatusBadge kind="payment" status={p.status} size="xs" />
            </div>
            <p className="text-xs font-mono" style={{ color: "#94A3B8" }}>
              {p.molliePaymentId}
            </p>
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              {p.paidAt
                ? `Betaald op ${formatDate(p.paidAt)}`
                : `Aangemaakt op ${formatDate(p.createdAt)}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
