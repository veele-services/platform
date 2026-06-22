"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers3, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createCollectiveInvoicePayment } from "@/app/actions/invoices";
import type { CollectiveInvoiceBatchRow, CollectiveInvoiceCandidate } from "@/app/actions/invoices";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";

type Props = {
  candidates: CollectiveInvoiceCandidate[];
  batches: CollectiveInvoiceBatchRow[];
  canWrite: boolean;
};

function formatEurCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatEur(value: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number.parseFloat(value) || 0);
}

function cents(value: string): number {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function CollectiveInvoicePanel({ candidates, batches, canWrite }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [objectId, setObjectId] = useState("");
  const [discountEuros, setDiscountEuros] = useState("0");
  const [surchargeEuros, setSurchargeEuros] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => candidates.filter((candidate) => selectedIds.includes(candidate.id)),
    [candidates, selectedIds],
  );

  const selectedCustomerId = selected[0]?.customerId ?? "";
  const selectableCandidates = candidates.filter((candidate) => {
    if (selectedCustomerId && candidate.customerId !== selectedCustomerId) return false;
    if (objectId && candidate.objectId !== objectId) return false;
    if (periodStart && candidate.scheduledDate && candidate.scheduledDate < periodStart) return false;
    if (periodEnd && candidate.scheduledDate && candidate.scheduledDate > periodEnd) return false;
    return true;
  });

  const objectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const candidate of candidates) {
      if (candidate.objectId && candidate.objectName) map.set(candidate.objectId, candidate.objectName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [candidates]);

  const subtotal = selected.reduce((sum, invoice) => sum + cents(invoice.amount), 0);
  const vat = selected.reduce((sum, invoice) => sum + cents(invoice.vatAmount), 0);
  const invoiceTotal = selected.reduce((sum, invoice) => sum + cents(invoice.totalAmount), 0);
  const discount = Math.max(0, Math.round((Number.parseFloat(discountEuros || "0") || 0) * 100));
  const surcharge = Math.max(0, Math.round((Number.parseFloat(surchargeEuros || "0") || 0) * 100));
  const total = invoiceTotal - discount + surcharge;
  const customerMismatch = selected.length > 1 && selected.some((invoice) => invoice.customerId !== selectedCustomerId);
  const canSubmit = canWrite && selected.length >= 2 && !customerMismatch && total > 0 && !loading;

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    const result = await createCollectiveInvoicePayment({
      invoiceIds: selectedIds,
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      objectId: objectId || undefined,
      discountCents: discount,
      surchargeCents: surcharge,
      notes,
    });
    setLoading(false);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    const data = (result as { success: true; data: { id: string; checkoutUrl: string } }).data;
    toast.success("Verzamelfactuur aangemaakt");
    setSelectedIds([]);
    setNotes("");
    startTransition(() => router.refresh());
    if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="veele-card mb-6">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold flex items-center gap-2" style={{ color: "#081D3A" }}>
            <Layers3 className="h-4 w-4" style={{ color: "#00B7B3" }} />
            Verzamelfacturen
          </h2>
          <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
            Bundel meerdere verzonden facturen van dezelfde klant. Open of betaalde batches blokkeren dubbele facturatie.
          </p>
        </div>
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#F8FAFC", color: "#475569", border: "1px solid #E2E8F0" }}>
          {selected.length} geselecteerd · totaal {formatEurCents(total)}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
        <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }} />
        <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }} />
        <select value={objectId} onChange={(event) => setObjectId(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }}>
          <option value="">Alle objecten</option>
          {objectOptions.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
        </select>
        <input type="number" step="0.01" min="0" value={discountEuros} onChange={(event) => setDiscountEuros(event.target.value)} placeholder="Korting" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }} />
        <input type="number" step="0.01" min="0" value={surchargeEuros} onChange={(event) => setSurchargeEuros(event.target.value)} placeholder="Toeslag" className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="max-h-80 overflow-auto rounded-xl border" style={{ borderColor: "#E2E8F0" }}>
          {selectableCandidates.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: "#64748B" }}>Geen bundelbare open facturen gevonden.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>Selectie</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>Factuur</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>Klant/object</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase" style={{ color: "#94A3B8" }}>Totaal</th>
                </tr>
              </thead>
              <tbody>
                {selectableCandidates.map((invoice) => (
                  <tr key={invoice.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selectedIds.includes(invoice.id)} onChange={() => toggle(invoice.id)} disabled={Boolean(selectedCustomerId && invoice.customerId !== selectedCustomerId)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold" style={{ color: "#00B7B3" }}>{invoice.invoiceNumber}</div>
                      <div className="text-xs" style={{ color: "#64748B" }}>{invoice.assignmentCode} · {invoice.scheduledDate ?? "geen datum"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div style={{ color: "#081D3A" }}>{invoice.customerName}</div>
                      <div className="text-xs" style={{ color: "#64748B" }}>{invoice.objectName ?? "Geen object"}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: "#081D3A" }}>{formatEur(invoice.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
            <div className="flex justify-between"><span>Subtotaal</span><span>{formatEurCents(subtotal)}</span></div>
            <div className="flex justify-between"><span>Btw</span><span>{formatEurCents(vat)}</span></div>
            <div className="flex justify-between"><span>Korting</span><span>- {formatEurCents(discount)}</span></div>
            <div className="flex justify-between"><span>Toeslag</span><span>{formatEurCents(surcharge)}</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold" style={{ borderColor: "#E2E8F0", color: "#081D3A" }}>
              <span>Te betalen</span><span>{formatEurCents(total)}</span>
            </div>
          </div>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Administratieve notitie, korting/toeslag toelichting..." className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#E2E8F0" }} />
          <button onClick={submit} disabled={!canSubmit} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "#081D3A", color: "#fff" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
            Verzamelfactuur aanmaken
          </button>
          {customerMismatch && <p className="text-xs" style={{ color: "#DC2626" }}>Selecteer alleen facturen van dezelfde klant.</p>}
        </div>
      </div>

      {batches.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Recente verzamelbetalingen</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {batches.slice(0, 6).map((batch) => (
              <div key={batch.id} className="rounded-xl border p-3" style={{ borderColor: "#E2E8F0" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: "#081D3A" }}>{batch.customerName}</span>
                  <ProcessStatusBadge kind="payment" status={batch.status} size="xs" />
                </div>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  {batch.invoiceCount} facturen · {formatEurCents(batch.amountCents)}
                  {batch.objectName ? ` · ${batch.objectName}` : ""}
                </p>
                {batch.checkoutUrl && batch.status === "open" && (
                  <a href={batch.checkoutUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#00B7B3" }}>
                    Betaallink openen <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
