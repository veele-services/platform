"use client";

import { useState, useTransition } from "react";
import { updateMyPhone } from "@/actions/personnel";
import { Pencil, X, Check } from "lucide-react";

export function PhoneEditForm({ currentPhone }: { currentPhone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone]     = useState(currentPhone ?? "");
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [isPending, start]    = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateMyPhone(phone);
      if (result.success) {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(result.error ?? "Opslaan mislukt");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: "var(--color-muted-fg)" }}>Telefoon</p>
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            {saved ? (
              <span style={{ color: "#16A34A" }}>✓ Opgeslagen</span>
            ) : (
              phone || <span style={{ color: "var(--color-muted-fg)", fontStyle: "italic" }}>Niet ingesteld</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(true); setSaved(false); }}
          className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
          title="Telefoonnummer bewerken"
        >
          <Pencil size={14} style={{ color: "var(--color-muted-fg)" }} />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-medium" style={{ color: "var(--color-muted-fg)" }}>Telefoon</p>
      <div className="flex items-center gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+31 6 12345678"
          disabled={isPending}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
            backgroundColor: "white",
          }}
          autoFocus
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center rounded-lg p-2 text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)" }}
          title="Opslaan"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setPhone(currentPhone ?? ""); setError(null); }}
          disabled={isPending}
          className="flex items-center justify-center rounded-lg border p-2 transition-colors hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--color-border)" }}
          title="Annuleren"
        >
          <X size={14} style={{ color: "var(--color-muted-fg)" }} />
        </button>
      </div>
      {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
    </form>
  );
}
