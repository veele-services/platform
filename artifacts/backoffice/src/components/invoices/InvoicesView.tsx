"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Link as LinkIcon,
  Loader2,
  Mail,
  Search,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { createMolliePayment } from "@/app/actions/payments";
import { exportInvoices, sendPaymentReminders } from "@/app/actions/invoices";
import type {
  CollectiveInvoiceBatchRow,
  CollectiveInvoiceCandidate,
  InvoiceRow,
  InvoiceSummary,
} from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  TenantActionMenu,
  TenantActiveFilters,
  TenantCommandBar,
  TenantConflictStrip,
  TenantPageHeader,
  TenantPageShell,
  TenantToolbarSearch,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import { processStatusLabel } from "@/lib/process-status";
import { CollectiveInvoicePanel } from "./CollectiveInvoicePanel";

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "draft", label: processStatusLabel("invoice", "draft") },
  { value: "sent", label: processStatusLabel("invoice", "sent") },
  { value: "paid", label: processStatusLabel("invoice", "paid") },
  { value: "cancelled", label: processStatusLabel("invoice", "cancelled") },
];

const PAGE_SIZE = 25;

function formatEur(value: string): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number.parseFloat(value) || 0);
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface Props {
  rows: InvoiceRow[];
  total: number;
  page: number;
  search: string;
  statusFilter: string;
  canWrite: boolean;
  summary: InvoiceSummary;
  overdueCount: number;
  collectiveCandidates: CollectiveInvoiceCandidate[];
  collectiveBatches: CollectiveInvoiceBatchRow[];
}

export function InvoicesView({
  rows,
  total,
  page,
  search,
  statusFilter,
  canWrite,
  summary,
  overdueCount,
  collectiveCandidates,
  collectiveBatches,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchDraft, setSearchDraft] = useState(search);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = [search, statusFilter].filter(Boolean).length;

  function push(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const nextSearch = params.search ?? search;
    const nextStatus = params.status ?? statusFilter;
    const nextPage = params.page ?? String(page);

    if (nextSearch) sp.set("search", nextSearch);
    if (nextStatus) sp.set("status", nextStatus);
    if (nextPage && nextPage !== "1") sp.set("page", nextPage);

    const query = sp.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  async function handleSendReminders() {
    setReminderLoading(true);
    const result = await sendPaymentReminders();
    setReminderLoading(false);
    if (result.success && "data" in result && result.data) {
      const { sent, skippedNoEmail, failedSend } = result.data;
      const parts = [`${sent} herinnering${sent !== 1 ? "en" : ""} verstuurd`];
      if (skippedNoEmail > 0) parts.push(`${skippedNoEmail} overgeslagen zonder e-mailadres`);
      if (failedSend > 0) parts.push(`${failedSend} mislukt`);
      if (failedSend > 0) toast.warning(parts.join(", "));
      else toast.success(parts.join(", "));
    } else {
      toast.error("message" in result ? result.message : "Verzenden mislukt");
    }
  }

  async function handleExportCsv() {
    setExportLoading(true);
    try {
      const result = await exportInvoices({ search, status: statusFilter });
      if (result.success && "data" in result && result.data) {
        downloadCsv(result.data.csv, result.data.filename);
        toast.success("Facturen CSV gedownload");
      } else {
        toast.error("message" in result ? result.message : "CSV exporteren mislukt");
      }
    } catch {
      toast.error("CSV exporteren mislukt. Probeer het opnieuw.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleCreatePaymentLink(invoiceId: string) {
    if (!canWrite) return;
    setPaymentLoading(invoiceId);
    const result = await createMolliePayment(invoiceId);
    setPaymentLoading(null);

    if (result.success && "data" in result && result.data?.checkoutUrl) {
      try {
        await navigator.clipboard.writeText(result.data.checkoutUrl);
        setCopiedId(invoiceId);
        setTimeout(() => setCopiedId((current) => (current === invoiceId ? null : current)), 3000);
        toast.success("Betaallink gekopieerd");
      } catch {
        window.open(result.data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    toast.error("message" in result ? result.message : "Betaallink aanmaken mislukt");
  }

  return (
    <TenantPageShell size="wide">
      <TenantPageHeader
        title="Facturen"
        description="Finance workbench voor voorstellen, verzonden facturen, betalingen en verzamelfacturen."
        eyebrow="Tenant finance"
        badges={overdueCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {overdueCount} achterstallig
          </span>
        ) : null}
        actions={canWrite && overdueCount > 0 ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100">
                <Mail className="h-4 w-4" />
                Stuur herinneringen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Betalingsherinneringen versturen</AlertDialogTitle>
                <AlertDialogDescription>
                  Er {overdueCount === 1 ? "is" : "zijn"} {overdueCount} achterstallige factuur{overdueCount !== 1 ? "en" : ""}.
                  Klanten met een e-mailadres ontvangen een betalingsherinnering.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction disabled={reminderLoading} onClick={handleSendReminders}>
                  {reminderLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verstuur herinneringen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      />

      <TenantConflictStrip
        items={[
          {
            label: "Concepten",
            value: formatEur(summary.draftAmount),
            description: `${summary.draftCount} nog niet verzonden`,
            tone: summary.draftCount > 0 ? "warning" : "neutral",
            href: "/invoices?status=draft",
          },
          {
            label: "Verzonden",
            value: formatEur(summary.sentAmount),
            description: `${summary.sentCount} open facturen`,
            tone: summary.sentCount > 0 ? "info" : "neutral",
            href: "/invoices?status=sent",
          },
          {
            label: "Betaald totaal",
            value: formatEur(summary.paidTotal),
            description: "incl. vorige maanden",
            tone: "success",
            href: "/invoices?status=paid",
          },
          {
            label: "Betaald deze maand",
            value: formatEur(summary.paidThisMonth),
            description: `${summary.totalCount} facturen totaal`,
            tone: "success",
          },
        ]}
      />

      {canWrite && (
        <CollectiveInvoicePanel
          candidates={collectiveCandidates}
          batches={collectiveBatches}
          canWrite={canWrite}
        />
      )}

      <TenantCommandBar
        title="Factuurregister"
        description="Zoek op factuurnummer, klant of opdrachtcode. Betaallinks, PDF's en reminders lopen via action menus en panelen."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={handleExportCsv} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV downloaden
          </Button>
        }
        search={
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              push({ search: searchDraft.trim(), page: "1" });
            }}
          >
            <TenantToolbarSearch
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Zoek factuur, klant of opdracht"
              wrapperClassName="sm:max-w-lg"
            />
            <Button type="submit" variant="outline" size="sm" className="h-10">
              <Search className="h-4 w-4" />
              Zoeken
            </Button>
          </form>
        }
        filters={
          <select
            value={statusFilter}
            onChange={(event) => push({ status: event.target.value, page: "1" })}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        }
        activeFilters={
          <TenantActiveFilters
            filters={[
              ...(search ? [{ id: "search", label: "Zoek", value: search, href: statusFilter ? `/invoices?status=${statusFilter}` : "/invoices" }] : []),
              ...(statusFilter ? [{ id: "status", label: "Status", value: statusLabel(statusFilter), href: search ? `/invoices?search=${encodeURIComponent(search)}` : "/invoices" }] : []),
            ]}
            clearAll={activeFilterCount > 0 ? <Link href="/invoices">Filters wissen</Link> : undefined}
          />
        }
      />

      <TenantWorkbenchPanel
        title="Facturen"
        description={`${total} factuur${total !== 1 ? "en" : ""} in deze selectie`}
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-muted-foreground">Geen facturen gevonden</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-3 md:hidden">
              {rows.map((row) => (
                <InvoiceMobileCard
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  isPaymentLoading={paymentLoading === row.id}
                  isCopied={copiedId === row.id}
                  onCreatePaymentLink={handleCreatePaymentLink}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    {["Factuur", "Klant", "Opdracht", "Bedrag", "Status", "Vervaldatum", ""].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOverdue = row.status === "sent" && new Date(row.dueDate) < new Date();
                    return (
                      <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link href={`/invoices/${row.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                            {row.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-foreground">{row.customerName}</td>
                        <td className="px-4 py-3">
                          <Link href={`/assignments/${row.assignmentId}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:underline">
                            {row.assignmentCode}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{formatEur(row.totalAmount)}</td>
                        <td className="px-4 py-3"><ProcessStatusBadge kind="invoice" status={row.status} /></td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className={isOverdue ? "font-semibold text-red-600" : ""}>{formatDate(row.dueDate)}</span>
                          {isOverdue && <span className="ml-1 text-xs text-red-600">(te laat)</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <InvoiceRowActions
                            row={row}
                            canWrite={canWrite}
                            isPaymentLoading={paymentLoading === row.id}
                            isCopied={copiedId === row.id}
                            onCreatePaymentLink={handleCreatePaymentLink}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </TenantWorkbenchPanel>

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {total} factuur{total !== 1 ? "en" : ""} - pagina {page} van {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => push({ page: String(page - 1) })}>
              <ChevronLeft className="h-4 w-4" />
              Vorige
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => push({ page: String(page + 1) })}>
              Volgende
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </TenantPageShell>
  );
}

function InvoiceRowActions({
  row,
  canWrite,
  isPaymentLoading,
  isCopied,
  onCreatePaymentLink,
}: {
  row: InvoiceRow;
  canWrite: boolean;
  isPaymentLoading: boolean;
  isCopied: boolean;
  onCreatePaymentLink: (invoiceId: string) => Promise<void>;
}) {
  const canCreatePayment = canWrite && row.status === "sent";

  return (
    <TenantActionMenu
      actions={[
        { id: "open", label: "Open details", href: `/invoices/${row.id}`, icon: <FileText className="h-4 w-4" /> },
        { id: "assignment", label: "Open opdracht", href: `/assignments/${row.assignmentId}`, icon: <TrendingUp className="h-4 w-4" /> },
        { id: "pdf", label: "Download PDF", href: `/backoffice-api/invoices/${row.id}/pdf`, icon: <Download className="h-4 w-4" /> },
        ...(canCreatePayment
          ? [{
              id: "payment",
              label: isCopied ? "Betaallink gekopieerd" : "Betaallink maken",
              icon: isPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCopied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />,
              disabled: isPaymentLoading,
              separatorBefore: true,
              onSelect: (event: Event) => {
                event.preventDefault();
                void onCreatePaymentLink(row.id);
              },
            }]
          : []),
      ]}
    />
  );
}

function InvoiceMobileCard({
  row,
  canWrite,
  isPaymentLoading,
  isCopied,
  onCreatePaymentLink,
}: {
  row: InvoiceRow;
  canWrite: boolean;
  isPaymentLoading: boolean;
  isCopied: boolean;
  onCreatePaymentLink: (invoiceId: string) => Promise<void>;
}) {
  const isOverdue = row.status === "sent" && new Date(row.dueDate) < new Date();

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/invoices/${row.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
            {row.invoiceNumber}
          </Link>
          <h2 className="mt-1 truncate text-sm font-semibold text-foreground">{row.customerName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{row.assignmentCode}</p>
        </div>
        <InvoiceRowActions
          row={row}
          canWrite={canWrite}
          isPaymentLoading={isPaymentLoading}
          isCopied={isCopied}
          onCreatePaymentLink={onCreatePaymentLink}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProcessStatusBadge kind="invoice" status={row.status} />
        <span className="text-sm font-semibold text-foreground">{formatEur(row.totalAmount)}</span>
        <span className={isOverdue ? "text-xs font-semibold text-red-600" : "text-xs text-muted-foreground"}>
          Vervalt {formatDate(row.dueDate)}
        </span>
      </div>
    </article>
  );
}
