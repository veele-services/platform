import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Save,
  Send,
} from "lucide-react";
import {
  completeTenantFirstRunStep,
  finishTenantFirstRunWizard,
  getTenantFirstRunWizard,
  saveTenantFirstRunWizardDraft,
  skipTenantFirstRun,
  type TenantFirstRunWizardStep,
} from "@/app/actions/tenant-first-run";

export const metadata = {
  title: "Tenant onboarding",
};

async function saveTenantFirstRunWizardDraftFormAction(formData: FormData): Promise<void> {
  "use server";

  await saveTenantFirstRunWizardDraft(formData);
}

async function finishTenantFirstRunWizardFormAction(formData: FormData): Promise<void> {
  "use server";

  await finishTenantFirstRunWizard(formData);
}

async function completeTenantFirstRunStepFormAction(formData: FormData): Promise<void> {
  "use server";

  await completeTenantFirstRunStep(formData);
}

async function skipTenantFirstRunFormAction(_formData: FormData): Promise<void> {
  "use server";

  await skipTenantFirstRun();
}

function StepRow({ step }: { step: TenantFirstRunWizardStep }) {
  return (
    <div className="flex min-h-24 flex-col gap-3 rounded border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        {step.done ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        ) : (
          <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-300" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-950">{step.title}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-normal text-slate-500">
            {step.done ? "Afgerond" : step.required ? "Open" : "Optioneel"}
          </p>
          {step.warning && !step.autoDone && (
            <p className="mt-2 text-sm text-amber-700">{step.warning}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={step.href}
          className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Openen
          <ExternalLink aria-hidden="true" className="size-4" />
        </Link>
        {!step.done && (
          <form action={completeTenantFirstRunStepFormAction}>
            <input type="hidden" name="step" value={step.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white"
            >
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Markeer gereed
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export default async function FirstRunPage() {
  const wizard = await getTenantFirstRunWizard();
  const allRequiredDone = wizard.requiredDone === wizard.requiredTotal;
  const statusLabel =
    wizard.status === "completed"
      ? "Afgerond"
      : wizard.status === "skipped"
        ? "Overgeslagen"
        : `${wizard.requiredDone}/${wizard.requiredTotal} verplichte stappen klaar`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 text-slate-950">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-slate-500">Tenant onboarding</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Tenant first-run wizard</h1>
            <p className="mt-2 text-sm text-slate-500">
              {wizard.tenantName || "Deze tenant"} staat op {wizard.readinessScore}% readiness. {statusLabel}.
            </p>
          </div>
          <div className="min-w-56">
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded bg-emerald-600" style={{ width: `${wizard.readinessScore}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium uppercase tracking-normal text-slate-500">
              Readiness {wizard.readinessScore}%
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sectoren" value={wizard.counts.sectors} />
        <Stat label="Regio's" value={wizard.counts.regions} />
        <Stat label="Gebruikers" value={wizard.counts.users} />
        <Stat label="Modules" value={wizard.counts.modules} />
      </section>

      {wizard.readinessWarnings.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-4" aria-label="Readiness warnings">
          <div className="flex gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Readiness warnings</h2>
              <ul className="mt-2 grid gap-1 text-sm text-amber-800">
                {wizard.readinessWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <form action={saveTenantFirstRunWizardDraftFormAction} className="grid gap-6">
        <section className="grid gap-4 rounded border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Bedrijfsgegevens</h2>
            <p className="mt-1 text-sm text-slate-500">Basisgegevens voor backoffice, e-mail en documenten.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="companyName">Bedrijfsnaam</FieldLabel>
              <input id="companyName" name="companyName" defaultValue={wizard.settings.companyName} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="emailSender">Afzender e-mail</FieldLabel>
              <input id="emailSender" name="emailSender" defaultValue={wizard.settings.emailSender} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="kvkNumber">KvK-nummer</FieldLabel>
              <input id="kvkNumber" name="kvkNumber" defaultValue={wizard.settings.kvkNumber} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="btwNumber">Btw-nummer</FieldLabel>
              <input id="btwNumber" name="btwNumber" defaultValue={wizard.settings.btwNumber} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <FieldLabel htmlFor="companyAddress">Adres</FieldLabel>
              <textarea
                id="companyAddress"
                name="companyAddress"
                defaultValue={wizard.settings.companyAddress}
                rows={3}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Branding</h2>
            <p className="mt-1 text-sm text-slate-500">Kleuren en afzendertekst voor tenantcommunicatie.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="brandColor">Primaire kleur</FieldLabel>
              <div className="mt-1 flex items-center gap-3">
                <input
                  id="brandColor"
                  name="brandColor"
                  type="color"
                  defaultValue={wizard.settings.brandColor}
                  className="h-10 w-14 rounded border border-slate-300 bg-white p-1"
                />
                <span className="text-sm text-slate-500">{wizard.settings.brandColor}</span>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="accentColor">Accentkleur</FieldLabel>
              <div className="mt-1 flex items-center gap-3">
                <input
                  id="accentColor"
                  name="accentColor"
                  type="color"
                  defaultValue={wizard.settings.accentColor}
                  className="h-10 w-14 rounded border border-slate-300 bg-white p-1"
                />
                <span className="text-sm text-slate-500">{wizard.settings.accentColor}</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <FieldLabel htmlFor="logoUrl">Logo URL</FieldLabel>
              <input id="logoUrl" name="logoUrl" defaultValue={wizard.settings.logoUrl} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="emailSignature">E-mailhandtekening</FieldLabel>
              <textarea
                id="emailSignature"
                name="emailSignature"
                defaultValue={wizard.settings.emailSignature}
                rows={4}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="emailFooterText">E-mailfooter</FieldLabel>
              <textarea
                id="emailFooterText"
                name="emailFooterText"
                defaultValue={wizard.settings.emailFooterText}
                rows={4}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Sectoren, regio's en modules</h2>
            <p className="mt-1 text-sm text-slate-500">Tenantbereik voor planning, objecten en moduletoegang.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">Sectoren</p>
              <p className="mt-2 text-2xl font-semibold">{wizard.counts.sectors}</p>
              <Link href="/instellingen/sectoren" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                Openen
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="rounded border border-slate-200 p-4">
              <FieldLabel htmlFor="regionNames">Regio's</FieldLabel>
              <textarea
                id="regionNames"
                name="regionNames"
                defaultValue={wizard.regionNames.join("\n")}
                rows={5}
                className={inputClass}
              />
            </div>
            <div className="rounded border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">Modules</p>
              <p className="mt-2 text-2xl font-semibold">{wizard.counts.modules}</p>
              <p className="mt-2 text-sm text-slate-500">
                {wizard.moduleNames.slice(0, 3).join(", ") || "Geen actieve modules"}
              </p>
              <Link href="/platform" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                Openen
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Gebruikers, basisinstellingen en eerste data</h2>
            <p className="mt-1 text-sm text-slate-500">Laatste checks voordat de tenant zelfstandig kan starten.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">Gebruikers</p>
              <p className="mt-2 text-2xl font-semibold">{wizard.counts.users}</p>
              <Link href="/instellingen/gebruikers" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                Openen
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <div className="grid gap-4 rounded border border-slate-200 p-4">
              <div>
                <FieldLabel htmlFor="paymentTermDays">Betaaltermijn dagen</FieldLabel>
                <input
                  id="paymentTermDays"
                  name="paymentTermDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={wizard.settings.paymentTermDays}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="availabilityAdvanceDays">Beschikbaarheid vooruit</FieldLabel>
                <input
                  id="availabilityAdvanceDays"
                  name="availabilityAdvanceDays"
                  type="number"
                  min={7}
                  max={365}
                  defaultValue={wizard.settings.availabilityAdvanceDays}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="rounded border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">Eerste klant/object/opdracht</p>
              <p className="mt-2 text-sm text-slate-500">
                {wizard.counts.customers} klanten · {wizard.counts.objects} objecten · {wizard.counts.assignments} opdrachten
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/customers" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
                  Klant
                </Link>
                <Link href="/objects" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
                  Object
                </Link>
                <Link href="/assignments" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
                  Opdracht
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Concept opslaan houdt de wizardstatus meetbaar en hervatbaar.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <Save aria-hidden="true" className="size-4" />
              Concept opslaan
            </button>
            <button
              type="submit"
              formAction={finishTenantFirstRunWizardFormAction}
              disabled={!allRequiredDone}
              className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send aria-hidden="true" className="size-4" />
              Afronden
            </button>
          </div>
        </div>
      </form>

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Wizardstatus</h2>
          <p className="mt-1 text-sm text-slate-500">Checklist wordt bijgewerkt door opgeslagen tenantdata en handmatige bevestiging.</p>
        </div>
        {wizard.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </section>

      {wizard.status !== "completed" && wizard.status !== "skipped" && (
        <form action={skipTenantFirstRunFormAction} className="flex justify-end">
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Overslaan
          </button>
        </form>
      )}
    </main>
  );
}
