"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Check, Loader2, Phone, Smartphone, User } from "lucide-react";
import { updateMyContactInfo, type UpdateContactResult } from "@/actions/customer";
import { CustomerSettingsFeedback } from "./SettingsShell";

const initialState: UpdateContactResult = { success: false, error: "" } as unknown as UpdateContactResult;

type Props = {
  contactName:  string | null;
  contactPhone: string | null;
  mobile:       string | null;
};

export function ContactInfoForm({ contactName, contactPhone, mobile }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(
    updateMyContactInfo,
    { success: false, error: undefined } as unknown as UpdateContactResult,
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="font-bold text-base" style={{ color: "var(--color-primary)" }}>
            Mijn contactgegevens
          </h2>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
            style={{ color: "var(--color-accent)", backgroundColor: "var(--color-accent-muted)" }}
          >
            <Pencil size={13} />
            Bewerken
          </button>
        </div>
        <dl className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <User size={16} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: "#94A3B8" }}>Contactnaam</p>
              <p className="text-sm font-medium" style={{ color: "#475569" }}>
                {contactName ?? <span className="italic opacity-50">Niet ingesteld</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Phone size={16} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: "#94A3B8" }}>Telefoonnummer</p>
              <p className="text-sm font-medium" style={{ color: "#475569" }}>
                {contactPhone ?? <span className="italic opacity-50">Niet ingesteld</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Smartphone size={16} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: "#94A3B8" }}>Mobiel</p>
              <p className="text-sm font-medium" style={{ color: "#475569" }}>
                {mobile ?? <span className="italic opacity-50">Niet ingesteld</span>}
              </p>
            </div>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h2 className="font-bold text-base" style={{ color: "var(--color-primary)" }}>
          Contactgegevens bewerken
        </h2>
        <button
          onClick={() => setEditing(false)}
          disabled={pending}
          className="rounded-lg p-1.5 transition-colors"
          style={{ color: "#94A3B8" }}
          aria-label="Annuleren"
        >
          <X size={18} />
        </button>
      </div>

      <form action={formAction} className="px-4 py-4 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="contactName"
            className="block text-xs font-semibold"
            style={{ color: "#475569" }}
          >
            Contactnaam <span style={{ color: "#E02D3C" }}>*</span>
          </label>
          <input
            ref={nameRef}
            id="contactName"
            name="contactName"
            type="text"
            defaultValue={contactName ?? ""}
            maxLength={200}
            required
            disabled={pending}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              borderColor:     "var(--color-border)",
              color:           "var(--color-primary)",
              backgroundColor: "#FAFAFA",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="contactPhone"
            className="block text-xs font-semibold"
            style={{ color: "#475569" }}
          >
            Telefoonnummer
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            defaultValue={contactPhone ?? ""}
            maxLength={50}
            disabled={pending}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              borderColor:     "var(--color-border)",
              color:           "var(--color-primary)",
              backgroundColor: "#FAFAFA",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="mobile"
            className="block text-xs font-semibold"
            style={{ color: "#475569" }}
          >
            Mobiel
          </label>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            defaultValue={mobile ?? ""}
            maxLength={50}
            disabled={pending}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              borderColor:     "var(--color-border)",
              color:           "var(--color-primary)",
              backgroundColor: "#FAFAFA",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>

        {state && !state.success && "error" in state && state.error && (
          <CustomerSettingsFeedback type="error">{state.error}</CustomerSettingsFeedback>
        )}

        <div
          className="sticky bottom-[calc(4.9rem+var(--safe-bottom))] -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur md:bottom-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Opslaan...
              </>
            ) : (
              <>
                <Check size={16} />
                Opslaan
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
