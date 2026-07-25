"use client";

import { useRef, useState, useTransition } from "react";
import { Building2, CalendarCheck, Clock, Upload } from "lucide-react";
import {
  updateOrganizationSettings,
  uploadOrgLogo,
} from "@/app/actions/settings";
import type { OrgSettings } from "@/app/actions/settings";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";

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
      betaaltermijnDagen: parseInt(fd.get("betaaltermijnDagen") as string, 10) || 30,
      availabilityAdvanceDays: parseInt(fd.get("availabilityAdvanceDays") as string, 10) || 60,
      planningWorkdayStart: (fd.get("planningWorkdayStart") as string) || "08:00",
      planningTimeSlotMinutes: parseInt(fd.get("planningTimeSlotMinutes") as string, 10) || 90,
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
        setLogoError((result as { message?: string }).message ?? "Upload mislukt.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="veele-card">
        <p className="mb-3 text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          Logo
        </p>
        <div className="flex items-center gap-4">
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-lg border"
            style={{
              width: "80px",
              height: "80px",
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full rounded-lg object-contain p-1" />
            ) : (
              <Building2 className="h-8 w-8" style={{ color: "#CBD5E1" }} strokeWidth={1.5} />
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
                PNG, JPG, WebP of SVG - max. 2 MB
              </p>
              {logoError && <p className="mt-1 text-xs text-destructive">{logoError}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
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
            placeholder="Uw organisatie B.V."
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
            placeholder={"Straat 1\n1234 AB Stad"}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <div className="veele-card space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: "#ECFDFD", color: "#00A6A2" }}>
            <CalendarCheck className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
              Personeelsinstellingen
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
              Bepaal hoe ver vooruit personeel beschikbaarheid mag invullen in de PWA.
            </p>
          </div>
        </div>
        <Field label="Beschikbaarheid vooruit invullen (dagen)" htmlFor="availabilityAdvanceDays">
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
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Code algemene personeelsapp
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-foreground">
            {s?.personnelLoginCode ?? "------"}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Medewerkers van algemene Fieldgrid-klanten vullen deze unieke code
            in voordat zij hun e-mailadres en wachtwoord zien. Enterprise-apps
            met een eigen organisatiehost slaan deze stap over.
          </p>
        </div>
      </div>

      <div className="veele-card space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}>
            <Clock className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>Planning tijdvakken</p>
            <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
              Bepaal welke tijdvakken zichtbaar zijn op het planbord; werkbonnen blijven per 5 minuten planbaar.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start werkdag" htmlFor="planningWorkdayStart">
            <input id="planningWorkdayStart" name="planningWorkdayStart" type="time" defaultValue={s?.planningWorkdayStart ?? "08:00"} disabled={!canWrite || isPending} className="veele-input w-32" />
          </Field>
          <Field label="Zichtbaar tijdvak (minuten)" htmlFor="planningTimeSlotMinutes">
            <input id="planningTimeSlotMinutes" name="planningTimeSlotMinutes" type="number" min={15} max={240} step={15} defaultValue={s?.planningTimeSlotMinutes ?? 90} disabled={!canWrite || isPending} className="veele-input w-32" />
          </Field>
        </div>
      </div>

      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
          Factuurinstellingen
        </p>
        <Field label="Standaard betalingstermijn (dagen)" htmlFor="betaaltermijnDagen">
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
            placeholder="noreply@fieldgrid.nl"
          />
        </Field>
      </div>

      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={isPending}
        saved={saved}
        error={error}
      />
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
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium" style={{ color: "#374151" }}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
