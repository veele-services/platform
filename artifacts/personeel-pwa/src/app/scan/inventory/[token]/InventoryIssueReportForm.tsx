"use client";

import { SelectAdapter } from "@workspace/shared-ui";
import { FormEvent, useState, useTransition } from "react";
import { AlertTriangle, Camera } from "lucide-react";
import { reportInventoryIssue } from "@/actions/inventory-issues";

export function InventoryIssueReportForm({
  inventoryItemId,
  assignmentId,
}: {
  inventoryItemId: string;
  assignmentId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await reportInventoryIssue({
        inventoryItemId,
        assignmentId,
        severity: String(formData.get("severity") ?? "normal"),
        description: String(formData.get("description") ?? ""),
        evidenceNote: String(formData.get("evidenceNote") ?? ""),
      });
      setMessage(
        result.success
          ? "Storing gemeld. Management ziet deze melding in de backoffice."
          : (result.error ?? "Storing melden mislukt."),
      );
      if (result.success) event.currentTarget.reset();
    });
  }

  return (
    <section
      className="rounded-[22px] bg-white p-5 shadow-sm"
      style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}
    >
      <h2
        className="mb-3 flex items-center gap-2 text-base font-black"
        style={{ color: "var(--color-primary)" }}
      >
        <AlertTriangle size={18} />
        Storing melden
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label
          className="block text-sm font-black"
          style={{ color: "var(--color-primary)" }}
        >
          Prioriteit
          <SelectAdapter
            name="severity"
            defaultValue="normal"
            className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-semibold"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            <option value="low">Laag</option>
            <option value="normal">Normaal</option>
            <option value="high">Hoog</option>
            <option value="urgent">Urgent</option>
          </SelectAdapter>
        </label>
        <label
          className="block text-sm font-black"
          style={{ color: "var(--color-primary)" }}
        >
          Omschrijving
          <textarea
            name="description"
            rows={4}
            required
            minLength={8}
            placeholder="Wat is er aan de hand?"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm leading-6"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          />
        </label>
        <label
          className="block text-sm font-black"
          style={{ color: "var(--color-primary)" }}
        >
          Bewijs / foto-video notitie
          <div className="relative mt-2">
            <textarea
              name="evidenceNote"
              rows={3}
              placeholder="Bijv. foto gemaakt, label ontbreekt, video volgt via dossierupload"
              className="w-full rounded-xl border px-3 py-2 pr-10 text-sm leading-6"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-primary)",
              }}
            />
            <Camera
              className="absolute right-3 top-3 h-5 w-5"
              style={{ color: "var(--color-muted-fg)" }}
            />
          </div>
        </label>
        {message ? (
          <p
            className="rounded-xl bg-[#F4F6FA] px-3 py-2 text-sm font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-xl px-4 text-base font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {pending ? "Melden..." : "Storing melden"}
        </button>
      </form>
    </section>
  );
}
