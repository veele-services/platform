"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Layers3, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createCollectiveInvoicePayment } from "@/app/actions/invoices";
import type { CollectiveInvoiceBatchRow, CollectiveInvoiceCandidate } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TenantWorkbenchPanel } from "@/components/tenant-ui";
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
  const [open, setOpen] = useState(false);
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

    const data = result.data;
    if (!data) {
      toast.error("Verzamelfactuur aanmaken mislukt.");
      return;
    }
    toast.success("Verzamelfactuur aangemaakt");
    setSelectedIds([]);
    setNotes("");
    setOpen(false);
    startTransition(() => router.refresh());
    if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <TenantWorkbenchPanel
      title="Verzamelfacturen"
      description="Bundel meerdere verzonden facturen van dezelfde klant in een gecontroleerde batchflow."
      actions={
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button disabled={!canWrite || candidates.length < 2}>
              <Layers3 className="h-4 w-4" />
              Batch wizard
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-3xl">
            <SheetHeader>
              <SheetTitle>Verzamelfactuur wizard</SheetTitle>
              <SheetDescription>
                Selecteer minimaal twee verzonden facturen van dezelfde klant. Open of betaalde batches blokkeren dubbele facturatie.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 py-5">
              <div className="grid gap-3 md:grid-cols-5">
                <label className="grid gap-1 text-sm font-medium">
                  Vanaf
                  <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Tot
                  <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Object
                  <select value={objectId} onChange={(event) => setObjectId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Alle objecten</option>
                    {objectOptions.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Korting
                  <input type="number" step="0.01" min="0" value={discountEuros} onChange={(event) => setDiscountEuros(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Toeslag
                  <input type="number" step="0.01" min="0" value={surchargeEuros} onChange={(event) => setSurchargeEuros(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
                </label>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
                  {selectableCandidates.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Geen bundelbare open facturen gevonden.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 border-b border-border bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Selectie</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Factuur</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">Klant/object</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Totaal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectableCandidates.map((invoice) => (
                          <tr key={invoice.id} className="border-b border-border/60">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(invoice.id)}
                                onChange={() => toggle(invoice.id)}
                                disabled={Boolean(selectedCustomerId && invoice.customerId !== selectedCustomerId)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-mono text-xs font-semibold text-primary">{invoice.invoiceNumber}</div>
                              <div className="text-xs text-muted-foreground">{invoice.assignmentCode} - {invoice.scheduledDate ?? "geen datum"}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-foreground">{invoice.customerName}</div>
                              <div className="text-xs text-muted-foreground">{invoice.objectName ?? "Geen object"}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-foreground">{formatEur(invoice.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="flex justify-between"><span>Geselecteerd</span><span>{selected.length}</span></div>
                    <div className="mt-2 flex justify-between"><span>Subtotaal</span><span>{formatEurCents(subtotal)}</span></div>
                    <div className="flex justify-between"><span>Btw</span><span>{formatEurCents(vat)}</span></div>
                    <div className="flex justify-between"><span>Korting</span><span>- {formatEurCents(discount)}</span></div>
                    <div className="flex justify-between"><span>Toeslag</span><span>{formatEurCents(surcharge)}</span></div>
                    <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-foreground">
                      <span>Te betalen</span><span>{formatEurCents(total)}</span>
                    </div>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={4}
                    placeholder="Administratieve notitie, korting/toeslag toelichting..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                  {customerMismatch && <p className="text-xs text-red-600">Selecteer alleen facturen van dezelfde klant.</p>}
                </div>
              </div>
            </div>

            <SheetFooter className="gap-2 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Sluiten</Button>
              <Button type="button" onClick={submit} disabled={!canSubmit}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
                Verzamelfactuur aanmaken
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      }
    >
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <Metric label="Bundelbaar" value={candidates.length} helper="verzonden facturen" />
        <Metric label="Open batches" value={batches.filter((batch) => batch.status === "open").length} helper="wachten op betaling" />
        <Metric label="Geselecteerd" value={selected.length} helper={formatEurCents(total)} />
      </div>

      {batches.length > 0 && (
        <div className="border-t border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recente verzamelbetalingen</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {batches.slice(0, 6).map((batch) => (
              <div key={batch.id} className="rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{batch.customerName}</span>
                  <ProcessStatusBadge kind="payment" status={batch.status} size="xs" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {batch.invoiceCount} facturen - {formatEurCents(batch.amountCents)}
                  {batch.objectName ? ` - ${batch.objectName}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a href={`/backoffice-api/invoices/batches/${batch.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                    PDF controleren <Download className="h-3 w-3" />
                  </a>
                  {batch.checkoutUrl && batch.status === "open" && (
                    <a href={batch.checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      Betaallink openen <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </TenantWorkbenchPanel>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
