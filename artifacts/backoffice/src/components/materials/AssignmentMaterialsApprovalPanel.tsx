"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, PackageCheck, XCircle } from "lucide-react";
import {
  approveAssignmentMaterialUsage,
  type AssignmentMaterialApprovalInput,
  type AssignmentMaterialApprovalRow,
} from "@/app/actions/assignment-material-approvals";

type Props = {
  assignmentId: string;
  rows: AssignmentMaterialApprovalRow[];
  readOnly?: boolean;
};

type RowFormState = {
  approvedName: string;
  approvedQuantity: string;
  approvedUnitLabel: string;
  approvedUnitPrice: string;
  approvedVatRate: string;
  invoiceable: boolean;
  customerVisible: boolean;
  reason: string;
};

function formatEur(value: string | null | undefined): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number.parseFloat(value ?? "0") || 0);
}

function defaultForm(row: AssignmentMaterialApprovalRow): RowFormState {
  const unitPrice = row.approvedUnitPrice ?? row.suggestedUnitPrice ?? "0";
  const vatRate = row.approvedVatRate ?? row.suggestedVatRate ?? "21";

  return {
    approvedName: row.approvedName ?? row.registeredName,
    approvedQuantity: row.approvedQuantity ?? row.registeredQuantity,
    approvedUnitLabel:
      row.approvedUnitLabel ?? row.registeredUnitLabel ?? "stuk",
    approvedUnitPrice: Number.parseFloat(unitPrice || "0").toFixed(2),
    approvedVatRate: Number.parseFloat(vatRate || "21").toFixed(2),
    invoiceable:
      row.approvalStatus === "approved"
        ? row.invoiceable
        : row.suggestedInvoiceable,
    customerVisible: row.customerVisible,
    reason: row.approvalReason ?? "",
  };
}

function statusLabel(status: string): {
  label: string;
  bg: string;
  color: string;
} {
  if (status === "approved")
    return { label: "Goedgekeurd", bg: "#ECFDF5", color: "#047857" };
  if (status === "rejected")
    return { label: "Afgewezen", bg: "#FEF2F2", color: "#B91C1C" };
  return { label: "Wacht op controle", bg: "#FFFBEB", color: "#B45309" };
}

function rowTotal(form: RowFormState): string {
  const quantity = Number.parseFloat(form.approvedQuantity.replace(",", "."));
  const unitPrice = Number.parseFloat(form.approvedUnitPrice.replace(",", "."));
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return "0.00";
  return (quantity * unitPrice).toFixed(2);
}

export function AssignmentMaterialsApprovalPanel({
  assignmentId,
  rows,
  readOnly = false,
}: Props) {
  const [forms, setForms] = useState<Record<string, RowFormState>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, defaultForm(row)])),
  );
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const totals = useMemo(() => {
    const pending = rows.filter(
      (row) => row.approvalStatus === "pending",
    ).length;
    const approved = rows.filter(
      (row) => row.approvalStatus === "approved",
    ).length;
    const invoiceable = rows.filter(
      (row) => row.approvalStatus === "approved" && row.invoiceable,
    ).length;
    return { pending, approved, invoiceable };
  }, [rows]);

  function updateForm(id: string, patch: Partial<RowFormState>) {
    setForms((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function submit(
    row: AssignmentMaterialApprovalRow,
    approvalStatus: AssignmentMaterialApprovalInput["approvalStatus"],
  ) {
    const form = forms[row.id];
    if (!form) return;
    if (!form.reason.trim()) {
      setErrorById((current) => ({
        ...current,
        [row.id]: "Reden is verplicht bij materiaalgoedkeuring.",
      }));
      return;
    }

    setPendingId(row.id);
    setErrorById((current) => ({ ...current, [row.id]: null }));
    startTransition(async () => {
      try {
        const result = await approveAssignmentMaterialUsage(
          assignmentId,
          row.id,
          {
            ...form,
            approvalStatus,
            invoiceable:
              approvalStatus === "approved" ? form.invoiceable : false,
            customerVisible:
              approvalStatus === "approved" ? form.customerVisible : false,
          },
        );

        if (!result.success) {
          setErrorById((current) => ({ ...current, [row.id]: result.message }));
        }
      } finally {
        setPendingId(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <section className="veele-card">
        <h2
          className="font-heading text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--color-foreground)" }}
        >
          <PackageCheck className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
          Materiaal en inventaris
        </h2>
        <p className="mt-2 text-sm" style={{ color: "#64748B" }}>
          Er zijn geen materiaalregels geregistreerd voor deze bon.
        </p>
      </section>
    );
  }

  return (
    <section className="veele-card">
      <div
        className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between"
        style={{ borderColor: "#E2E8F0" }}
      >
        <div>
          <h2
            className="font-heading text-base font-semibold flex items-center gap-2"
            style={{ color: "var(--color-foreground)" }}
          >
            <PackageCheck className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            Materiaal en inventaris
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Controleer materiaalregels voordat het rapport wordt goedgekeurd en
            het factuurvoorstel wordt gemaakt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            {totals.pending} open
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            {totals.approved} goedgekeurd
          </span>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
            {totals.invoiceable} factureerbaar
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {rows.map((row) => {
          const form = forms[row.id] ?? defaultForm(row);
          const status = statusLabel(row.approvalStatus);
          const disabled = readOnly || pendingId !== null;
          const lineTotal = rowTotal(form);

          return (
            <article
              key={row.id}
              className="rounded-2xl border p-4"
              style={{ borderColor: "#E2E8F0", background: "#FFFFFF" }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.materialCode ? (
                      <span className="rounded bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700">
                        {row.materialCode}
                      </span>
                    ) : null}
                    {row.isOther ? (
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        Overig
                      </span>
                    ) : null}
                    {row.usesStock ? (
                      <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
                        Uit voorraad
                      </span>
                    ) : null}
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: status.bg,
                        color: status.color,
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p
                    className="mt-2 text-sm font-semibold"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {row.registeredName}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                    Geregistreerd: {row.registeredQuantity}{" "}
                    {row.registeredUnitLabel ?? "stuk"}
                    {row.stockLocationName
                      ? ` uit ${row.stockLocationName}`
                      : ""}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p
                    className="text-xs uppercase tracking-wide"
                    style={{ color: "#94A3B8" }}
                  >
                    Regeltotaal
                  </p>
                  <p className="text-sm font-bold" style={{ color: "var(--color-foreground)" }}>
                    {formatEur(lineTotal)}
                  </p>
                  <p className="text-[11px]" style={{ color: "#64748B" }}>
                    EUR 0,00 is toegestaan
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#374151" }}
                  >
                    Omschrijving
                  </span>
                  <input
                    value={form.approvedName}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, { approvedName: event.target.value })
                    }
                    className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                    style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#374151" }}
                  >
                    Aantal
                  </span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={form.approvedQuantity}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, {
                        approvedQuantity: event.target.value,
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                    style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#374151" }}
                  >
                    Eenheid
                  </span>
                  <input
                    value={form.approvedUnitLabel}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, {
                        approvedUnitLabel: event.target.value,
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                    style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#374151" }}
                  >
                    Prijs per stuk
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.approvedUnitPrice}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, {
                        approvedUnitPrice: event.target.value,
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                    style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "#374151" }}
                  >
                    BTW (%)
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.approvedVatRate}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, {
                        approvedVatRate: event.target.value,
                      })
                    }
                    className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                    style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  />
                </label>
                <label
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: "#E2E8F0" }}
                >
                  <CheckboxAdapter
                    type="checkbox"
                    checked={form.invoiceable}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, { invoiceable: event.target.checked })
                    }
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "#374151" }}
                  >
                    Factureerbaar
                  </span>
                </label>
                <label
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: "#E2E8F0" }}
                >
                  <CheckboxAdapter
                    type="checkbox"
                    checked={form.customerVisible}
                    disabled={disabled}
                    onChange={(event) =>
                      updateForm(row.id, {
                        customerVisible: event.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "#374151" }}
                  >
                    Klantzichtbaar
                  </span>
                </label>
              </div>

              <label className="mt-3 flex flex-col gap-1">
                <span
                  className="text-xs font-medium"
                  style={{ color: "#374151" }}
                >
                  Reden voor goedkeuring of wijziging
                </span>
                <textarea
                  value={form.reason}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(row.id, { reason: event.target.value })
                  }
                  rows={2}
                  className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                  style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
                  placeholder="Bijv. prijs op EUR 0,00 gezet voor service, of doorbelasten volgens afspraak."
                />
              </label>

              {errorById[row.id] ? (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-xs"
                  style={{ background: "#FEE2E2", color: "#991B1B" }}
                >
                  {errorById[row.id]}
                </p>
              ) : null}

              {!readOnly ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => submit(row, "rejected")}
                    disabled={disabled}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                  >
                    {pendingId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Afwijzen
                  </button>
                  <button
                    type="button"
                    onClick={() => submit(row, "approved")}
                    disabled={disabled}
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}
                  >
                    {pendingId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Goedkeuren
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
