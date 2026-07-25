"use client";

import { SelectAdapter } from "@/components/ui/select-adapter";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  updateTicketStatus,
  type BackofficeTicketStatus,
  type TicketKind,
} from "@/app/actions/tickets";
import { processStatusLabel } from "@/lib/process-status";

const STATUS_OPTIONS: Array<{
  value: BackofficeTicketStatus;
  label: string;
}> = [
  { value: "open", label: processStatusLabel("ticket", "open") },
  {
    value: "waiting_backoffice",
    label: processStatusLabel("ticket", "waiting_backoffice"),
  },
  {
    value: "waiting_customer",
    label: processStatusLabel("ticket", "waiting_customer"),
  },
  {
    value: "waiting_personnel",
    label: processStatusLabel("ticket", "waiting_personnel"),
  },
  { value: "closed", label: processStatusLabel("ticket", "closed") },
];

export function StatusActions({
  kind,
  ticketId,
  currentStatus,
}: {
  kind: TicketKind;
  ticketId: string;
  currentStatus: BackofficeTicketStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<BackofficeTicketStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = STATUS_OPTIONS.filter((option) => {
    if (kind === "customer") return option.value !== "waiting_personnel";
    return option.value !== "waiting_customer";
  });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateTicketStatus(kind, ticketId, status);
      if (!result.success) {
        setError(result.error ?? "Status wijzigen mislukt.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className="rounded-lg border bg-white p-4 shadow-sm"
      style={{ borderColor: "#E2E8F0" }}
    >
      <h2 className="text-sm font-black" style={{ color: "#081D3A" }}>
        Ticketstatus
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Wijzig de administratieve status van dit ticket.
      </p>
      <div className="mt-3 flex gap-2">
        <SelectAdapter
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as BackofficeTicketStatus)
          }
          className="h-10 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm font-semibold outline-none focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
          style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-10 rounded-md bg-[#081D3A] px-4 text-sm font-black text-white disabled:opacity-60"
        >
          Opslaan
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
