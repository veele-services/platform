"use client";

import { useState, useTransition, useRef } from "react";
import {
  Building2,
  Upload,
  CheckCircle2,
  AlertCircle,
  CalendarCheck,
} from "lucide-react";
import {
  updateOrganizationSettings,
  uploadOrgLogo,
} from "@/app/actions/settings";
import type { OrgSettings } from "@/app/actions/settings";

interface Props {
  settings: OrgSettings | null;
  canWrite: boolean;
}

export function OrganisatieForm({ settings, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl ?? null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const s = settings;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const data = {
      naam: (fd.get("naam") as string).trim(),
      adres: (fd.get("adres") as string).trim() || null,
      kvkNummer: (fd.get("kvkNummer") as string).trim() || null,
      btwNummer: (fd.get("btwNummer") as string).trim() || null,
      betaaltermijnDagen:
        parseInt(fd.get("betaaltermijnDagen") as string, 10) || 30,
      availabilityAdvanceDays:
        parseInt(fd.get("availabilityAdvanceDays") as string, 10) || 60,
      emailAfzender: (fd.get("emailAfzender") as string).trim() || null,
    };

    startTransition(async () => {
      const result = await updateOrganizationSettings(data);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    const fd = new FormData();
    fd.append("logo", file);

    startTransition(async () => {
      const result = await uploadOrgLogo(fd);
      if (result.success && result.data) {
        setLogoUrl(result.data.url);
      } else {
        setLogoError(
          (result as { message?: string }).message ?? "Upload mislukt.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo */}
      <div className="veele-card">
        <p className="text-sm font-semibold mb-3" style={{ color: "#081D3A" }}>
          Logo
        </p>
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center rounded-lg border flex-shrink-0"
            style={{
              width: "80px",
              height: "80px",
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="object-contain w-full h-full rounded-lg p-1"
              />
            ) : (
              <Building2
                className="h-8 w-8"
                style={{ color: "#CBD5E1" }}
                strokeWidth={1.5}
              />
            )}
          </div>
          {canWrite && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
                style={{ borderColor: "#E2E8F0", color: "#475569" }}
              >
                <Upload className="h-3.5 w-3.5" />
                Logo uploaden
              </button>
              <p className="mt-1 text-xs" style={{ color: "#94A3B8" }}>
                PNG, JPG, WebP of SVG — max. 2 MB
              </p>
              {logoError && (
                <p className="mt-1 text-xs" style={{ color: "#DC2626" }}>
                  {logoError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Basisgegevens */}
      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
          Basisgegevens
        </p>

        <Field label="Organisatienaam" htmlFor="naam" required>
          <input
            id="naam"
            name="naam"
            type="text"
            defaultValue={s?.naam ?? ""}
            disabled={!canWrite || isPending}
            className="veele-input w-full"
            placeholder="Veele Services B.V."
          />
        </Field>

        <Field label="Adres" htmlFor="adres">
          <textarea
            id="adres"
            name="adres"
            defaultValue={s?.adres ?? ""}
            disabled={!canWrite || isPending}
            rows={3}
            className="veele-input w-full resize-none"
            placeholder="Straat 1&#10;1234 AB Stad"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="KVK-nummer" htmlFor="kvkNummer">
            <input
              id="kvkNummer"
              name="kvkNummer"
              type="text"
              defaultValue={s?.kvkNummer ?? ""}
              disabled={!canWrite || isPending}
              className="veele-input w-full"
              placeholder="12345678"
            />
          </Field>
          <Field label="BTW-nummer" htmlFor="btwNummer">
            <input
              id="btwNummer"
              name="btwNummer"
              type="text"
              defaultValue={s?.btwNummer ?? ""}
              disabled={!canWrite || isPending}
              className="veele-input w-full"
              placeholder="NL123456789B01"
            />
          </Field>
        </div>
      </div>

      {/* Personeelsinstellingen */}
      <div className="veele-card space-y-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#ECFDFD", color: "#00A6A2" }}
          >
            <CalendarCheck className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
              Personeelsinstellingen
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
              Bepaal hoe ver vooruit personeel beschikbaarheid mag invullen in
              de PWA.
            </p>
          </div>
        </div>

        <Field
          label="Beschikbaarheid vooruit invullen (dagen)"
          htmlFor="availabilityAdvanceDays"
        >
          <input
            id="availabilityAdvanceDays"
            name="availabilityAdvanceDays"
            type="number"
            min={7}
            max={365}
            defaultValue={s?.availabilityAdvanceDays ?? 60}
            disabled={!canWrite || isPending}
            className="veele-input w-32"
          />
        </Field>
      </div>

      {/* Factuurinstellingen */}
      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
          Factuurinstellingen
        </p>

        <Field
          label="Standaard betalingstermijn (dagen)"
          htmlFor="betaaltermijnDagen"
        >
          <input
            id="betaaltermijnDagen"
            name="betaaltermijnDagen"
            type="number"
            min={1}
            max={365}
            defaultValue={s?.betaaltermijnDagen ?? 30}
            disabled={!canWrite || isPending}
            className="veele-input w-32"
          />
        </Field>

        <Field label="E-mailafzender" htmlFor="emailAfzender">
          <input
            id="emailAfzender"
            name="emailAfzender"
            type="email"
            defaultValue={s?.emailAfzender ?? ""}
            disabled={!canWrite || isPending}
            className="veele-input w-full"
            placeholder="noreply@veeleservices.nl"
          />
        </Field>
      </div>

      {canWrite && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#081D3A" }}
          >
            {isPending ? "Opslaan…" : "Wijzigingen opslaan"}
          </button>

          {saved && (
            <span
              className="inline-flex items-center gap-1.5 text-sm"
              style={{ color: "#059669" }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Opgeslagen
            </span>
          )}
          {error && (
            <span
              className="inline-flex items-center gap-1.5 text-sm"
              style={{ color: "#DC2626" }}
            >
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium mb-1"
        style={{ color: "#374151" }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: "#DC2626" }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
