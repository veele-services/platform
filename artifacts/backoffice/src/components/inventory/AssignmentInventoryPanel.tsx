"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  PackageSearch,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  approveAssignmentInventoryUsage,
  attachInventoryToAssignment,
  removeAssignmentInventoryLink,
  type AssignmentInventoryApprovalInput,
  type AssignmentInventoryLinkRow,
  type AssignmentInventoryOption,
  type AssignmentInventoryUsageType,
} from "@/app/actions/assignment-inventory";

type Props = {
  assignmentId: string;
  rows: AssignmentInventoryLinkRow[];
  attachableItems?: AssignmentInventoryOption[];
  canManage?: boolean;
  canApprove?: boolean;
  readOnly?: boolean;
};

type AttachFormState = {
  inventoryItemId: string;
  usageType: AssignmentInventoryUsageType;
  registeredQuantity: string;
  registeredPeriodLabel: string;
  notes: string;
};

type ApprovalFormState = {
  approvedQuantity: string;
  approvedUnitPrice: string;
  approvedVatRate: string;
  invoiceable: boolean;
  customerVisible: boolean;
  reason: string;
};

const USAGE_LABELS: Record<AssignmentInventoryUsageType, string> = {
  used: "Gebruikt",
  rented: "Verhuurd",
  issued: "Uitgegeven",
  returned: "Retour",
  defect_found: "Defect geconstateerd",
};

function formatEur(value: string | null | undefined): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number.parseFloat(value ?? "0") || 0);
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

function usageLabel(value: string): string {
  return USAGE_LABELS[value as AssignmentInventoryUsageType] ?? value;
}

function defaultApprovalForm(
  row: AssignmentInventoryLinkRow,
): ApprovalFormState {
  const defaultInvoiceable =
    row.approvalStatus === "approved"
      ? row.invoiceable
      : row.usageType === "rented";

  return {
    approvedQuantity: row.approvedQuantity ?? row.registeredQuantity ?? "1",
    approvedUnitPrice: Number.parseFloat(row.approvedUnitPrice ?? "0").toFixed(
      2,
    ),
    approvedVatRate: Number.parseFloat(row.approvedVatRate ?? "21").toFixed(2),
    invoiceable: defaultInvoiceable,
    customerVisible: row.customerVisible,
    reason: row.approvalReason ?? "",
  };
}

function rowTotal(form: ApprovalFormState): string {
  const quantity = Number.parseFloat(form.approvedQuantity.replace(",", "."));
  const unitPrice = Number.parseFloat(form.approvedUnitPrice.replace(",", "."));
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return "0.00";
  return (quantity * unitPrice).toFixed(2);
}

function createAttachForm(items: AssignmentInventoryOption[]): AttachFormState {
  return {
    inventoryItemId: items[0]?.id ?? "",
    usageType: "used",
    registeredQuantity: "1",
    registeredPeriodLabel: "",
    notes: "",
  };
}

export function AssignmentInventoryPanel({
  assignmentId,
  rows,
  attachableItems = [],
  canManage = false,
  canApprove = false,
  readOnly = false,
}: Props) {
  const [items, setItems] = useState(rows);
  const [attachForm, setAttachForm] = useState<AttachFormState>(() =>
    createAttachForm(attachableItems),
  );
  const [forms, setForms] = useState<Record<string, ApprovalFormState>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, defaultApprovalForm(row)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const availableItems = useMemo(
    () =>
      attachableItems.filter(
        (option) => !items.some((row) => row.inventoryItemId === option.id),
      ),
    [attachableItems, items],
  );

  const totals = useMemo(() => {
    const pending = items.filter(
      (row) => row.approvalStatus === "pending",
    ).length;
    const approved = items.filter(
      (row) => row.approvalStatus === "approved",
    ).length;
    const invoiceable = items.filter(
      (row) => row.approvalStatus === "approved" && row.invoiceable,
    ).length;
    const rented = items.filter((row) => row.usageType === "rented").length;
    return { pending, approved, invoiceable, rented };
  }, [items]);

  function updateApprovalForm(id: string, patch: Partial<ApprovalFormState>) {
    setForms((current) => ({
      ...current,
      [id]: {
        ...(current[id] ??
          defaultApprovalForm(items.find((row) => row.id === id)!)),
        ...patch,
      },
    }));
  }

  function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attachForm.inventoryItemId) {
      setError("Kies een inventarisitem.");
      return;
    }

    setError(null);
    setPendingAction("attach");
    startTransition(async () => {
      try {
        const result = await attachInventoryToAssignment(
          assignmentId,
          attachForm,
        );
        if (!result.success) {
          setError(result.message);
          return;
        }
        window.location.reload();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function submit(
    row: AssignmentInventoryLinkRow,
    approvalStatus: AssignmentInventoryApprovalInput["approvalStatus"],
  ) {
    const form = forms[row.id] ?? defaultApprovalForm(row);
    if (!form.reason.trim()) {
      setErrorById((current) => ({
        ...current,
        [row.id]: "Reden is verplicht bij inventarisgoedkeuring.",
      }));
      return;
    }

    setPendingAction(row.id);
    setErrorById((current) => ({ ...current, [row.id]: null }));
    startTransition(async () => {
      try {
        const result = await approveAssignmentInventoryUsage(
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
          return;
        }
        window.location.reload();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function remove(row: AssignmentInventoryLinkRow) {
    setPendingAction(`remove-${row.id}`);
    setErrorById((current) => ({ ...current, [row.id]: null }));
    startTransition(async () => {
      try {
        const result = await removeAssignmentInventoryLink(
          assignmentId,
          row.id,
        );
        if (!result.success) {
          setErrorById((current) => ({ ...current, [row.id]: result.message }));
          return;
        }
        setItems((current) => current.filter((item) => item.id !== row.id));
      } finally {
        setPendingAction(null);
      }
    });
  }

  const canAttach = canManage && !readOnly;
  const canReview = canApprove && !readOnly;

  return (
    <section className="veele-card">
      <div
        className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between"
        style={{ borderColor: "#E2E8F0" }}
      >
        <div>
          <h2
            className="font-heading text-base font-semibold flex items-center gap-2"
            style={{ color: "#081D3A" }}
          >
            <PackageSearch className="h-4 w-4" style={{ color: "#00B7B3" }} />
            Inventaris op werkbon
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Koppel inventaris aan de opdracht. Inventaris is standaard niet
            factureerbaar; verhuur kan door management worden doorbelast.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            {totals.pending} open
          </span>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">
            {totals.rented} verhuur
          </span>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">
            {totals.invoiceable} factureerbaar
          </span>
        </div>
      </div>

      {canAttach ? (
        <form
          onSubmit={attach}
          className="mt-4 rounded-2xl border p-4"
          style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_160px_120px_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: "#374151" }}
              >
                Inventarisitem
              </span>
              <select
                value={attachForm.inventoryItemId}
                onChange={(event) =>
                  setAttachForm((current) => ({
                    ...current,
                    inventoryItemId: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
              >
                {availableItems.length === 0 ? (
                  <option value="">Geen inventaris beschikbaar</option>
                ) : null}
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.name}
                    {item.currentLocationName
                      ? ` (${item.currentLocationName})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: "#374151" }}
              >
                Gebruikstype
              </span>
              <select
                value={attachForm.usageType}
                onChange={(event) =>
                  setAttachForm((current) => ({
                    ...current,
                    usageType: event.target
                      .value as AssignmentInventoryUsageType,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
              >
                {Object.entries(USAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
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
                value={attachForm.registeredQuantity}
                onChange={(event) =>
                  setAttachForm((current) => ({
                    ...current,
                    registeredQuantity: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-xs font-medium"
                style={{ color: "#374151" }}
              >
                Periode / context
              </span>
              <input
                value={attachForm.registeredPeriodLabel}
                onChange={(event) =>
                  setAttachForm((current) => ({
                    ...current,
                    registeredPeriodLabel: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
                placeholder="bijv. daghuur"
              />
            </label>
            <button
              type="submit"
              disabled={
                pendingAction === "attach" || !attachForm.inventoryItemId
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 lg:self-end"
              style={{ backgroundColor: "#00B7B3", color: "#FFFFFF" }}
            >
              {pendingAction === "attach" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Koppelen
            </button>
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "#374151" }}>
              Opmerking
            </span>
            <textarea
              value={attachForm.notes}
              onChange={(event) =>
                setAttachForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              rows={2}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            />
          </label>
          {error ? (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-xs"
              style={{ background: "#FEE2E2", color: "#991B1B" }}
            >
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-4 space-y-4">
        {items.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-6 text-sm"
            style={{ borderColor: "#CBD5E1", color: "#64748B" }}
          >
            Er is nog geen inventaris aan deze werkbon gekoppeld.
          </div>
        ) : (
          items.map((row) => {
            const form = forms[row.id] ?? defaultApprovalForm(row);
            const status = statusLabel(row.approvalStatus);
            const disabled = pendingAction !== null;
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
                      <span className="rounded bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700">
                        {row.inventoryCode}
                      </span>
                      <span className="rounded bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                        {usageLabel(row.usageType)}
                      </span>
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
                      style={{ color: "#081D3A" }}
                    >
                      {row.inventoryName}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                      Geregistreerd: {row.registeredQuantity} item
                      {row.registeredQuantity === "1" ? "" : "s"}
                      {row.registeredPeriodLabel
                        ? ` - ${row.registeredPeriodLabel}`
                        : ""}
                      {row.currentLocationName
                        ? ` - locatie ${row.currentLocationName}`
                        : ""}
                    </p>
                    {row.notes ? (
                      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                        {row.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-left md:text-right">
                    <p
                      className="text-xs uppercase tracking-wide"
                      style={{ color: "#94A3B8" }}
                    >
                      Regeltotaal
                    </p>
                    <p
                      className="text-sm font-bold"
                      style={{ color: "#081D3A" }}
                    >
                      {formatEur(lineTotal)}
                    </p>
                    <p className="text-[11px]" style={{ color: "#64748B" }}>
                      EUR 0,00 is toegestaan
                    </p>
                  </div>
                </div>

                {canReview ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                          updateApprovalForm(row.id, {
                            approvedQuantity: event.target.value,
                          })
                        }
                        className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                        style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "#374151" }}
                      >
                        Prijs per stuk/periode
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.approvedUnitPrice}
                        disabled={disabled}
                        onChange={(event) =>
                          updateApprovalForm(row.id, {
                            approvedUnitPrice: event.target.value,
                          })
                        }
                        className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                        style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
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
                          updateApprovalForm(row.id, {
                            approvedVatRate: event.target.value,
                          })
                        }
                        className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                        style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
                      />
                    </label>
                    <label
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 xl:self-end"
                      style={{ borderColor: "#E2E8F0" }}
                    >
                      <CheckboxAdapter
                        type="checkbox"
                        checked={form.invoiceable}
                        disabled={disabled}
                        onChange={(event) =>
                          updateApprovalForm(row.id, {
                            invoiceable: event.target.checked,
                          })
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
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 xl:self-end"
                      style={{ borderColor: "#E2E8F0" }}
                    >
                      <CheckboxAdapter
                        type="checkbox"
                        checked={form.customerVisible}
                        disabled={disabled}
                        onChange={(event) =>
                          updateApprovalForm(row.id, {
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
                ) : null}

                {canReview ? (
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
                        updateApprovalForm(row.id, {
                          reason: event.target.value,
                        })
                      }
                      rows={2}
                      className="rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                      style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
                      placeholder="Bijv. verhuur doorbelast, intern gebruik op EUR 0,00, of klantzichtbaar volgens afspraak."
                    />
                  </label>
                ) : null}

                {errorById[row.id] ? (
                  <p
                    className="mt-3 rounded-lg px-3 py-2 text-xs"
                    style={{ background: "#FEE2E2", color: "#991B1B" }}
                  >
                    {errorById[row.id]}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {canManage && !readOnly ? (
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={disabled}
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                      style={{ backgroundColor: "#F8FAFC", color: "#B91C1C" }}
                    >
                      {pendingAction === `remove-${row.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Ontkoppelen
                    </button>
                  ) : null}
                  {canReview ? (
                    <>
                      <button
                        type="button"
                        onClick={() => submit(row, "rejected")}
                        disabled={disabled}
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                      >
                        {pendingAction === row.id ? (
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
                        {pendingAction === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Goedkeuren
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
