"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Building2,
  Calculator,
  CreditCard,
  Download,
  Eye,
  FileText,
  Palette,
  WalletCards,
} from "lucide-react";
import {
  updateInvoiceCompanySettings,
  updateInvoiceNumberingSettings,
  updateInvoicePaymentSettings,
  updateInvoiceTemplateSettings,
  type InvoiceSettingsBundle,
} from "@/app/actions/invoice-settings";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";
import { cn } from "@/lib/utils";

type TabKey =
  | "company"
  | "numbering"
  | "template"
  | "payment"
  | "mollie"
  | "preview";

type Props = {
  settings: InvoiceSettingsBundle;
  canWrite: boolean;
};

const TABS: Array<{ key: TabKey; label: string; icon: typeof Building2 }> = [
  { key: "company", label: "Bedrijfsgegevens", icon: Building2 },
  { key: "numbering", label: "Factuurnummering", icon: Calculator },
  { key: "template", label: "Opmaak", icon: Palette },
  { key: "payment", label: "Betaling", icon: CreditCard },
  { key: "mollie", label: "Mollie", icon: WalletCards },
  { key: "preview", label: "Preview", icon: Eye },
];

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function number(fd: FormData, key: string, fallback: number): number {
  const parsed = Number(text(fd, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

export function InvoiceSettingsView({ settings, canWrite }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("company");

  return (
    <div className="space-y-6">
      <div className="grid gap-2 rounded-lg border bg-white p-1 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
              activeTab === key
                ? "bg-[#E0FAFB] text-[#075E5D]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "company" && (
        <CompanyCard settings={settings} canWrite={canWrite} />
      )}
      {activeTab === "numbering" && (
        <NumberingCard settings={settings} canWrite={canWrite} />
      )}
      {activeTab === "template" && (
        <TemplateCard settings={settings} canWrite={canWrite} />
      )}
      {activeTab === "payment" && (
        <PaymentCard settings={settings} canWrite={canWrite} />
      )}
      {activeTab === "mollie" && (
        <MollieCard settings={settings} canWrite={canWrite} />
      )}
      {activeTab === "preview" && <InvoicePreviewCard settings={settings} />}
    </div>
  );
}

function CompanyCard({ settings, canWrite }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const company = settings.company;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateInvoiceCompanySettings({
        legalName: text(fd, "legalName"),
        tradeName: text(fd, "tradeName"),
        addressLine1: text(fd, "addressLine1"),
        addressLine2: text(fd, "addressLine2"),
        postalCode: text(fd, "postalCode"),
        city: text(fd, "city"),
        country: text(fd, "country") || "Nederland",
        kvkNumber: text(fd, "kvkNumber"),
        vatNumber: text(fd, "vatNumber"),
        iban: text(fd, "iban"),
        bic: text(fd, "bic"),
        administrationEmail: text(fd, "administrationEmail"),
        phone: text(fd, "phone"),
        website: text(fd, "website"),
        logoUrl: text(fd, "logoUrl"),
        primaryColor: text(fd, "primaryColor") || "#081D3A",
        secondaryColor: text(fd, "secondaryColor") || "#00B7B3",
        defaultPaymentTermDays: number(fd, "defaultPaymentTermDays", 30),
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SectionCard
        icon={<Building2 className="h-5 w-5" />}
        title="Bedrijfsgegevens op facturen"
        description="Deze gegevens worden vastgelegd in de snapshot zodra een factuur definitief wordt."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Juridische naam" required>
            <input
              name="legalName"
              defaultValue={company.legalName}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Handelsnaam">
            <input
              name="tradeName"
              defaultValue={company.tradeName ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Adresregel 1">
            <input
              name="addressLine1"
              defaultValue={company.addressLine1 ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Adresregel 2">
            <input
              name="addressLine2"
              defaultValue={company.addressLine2 ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Postcode">
            <input
              name="postalCode"
              defaultValue={company.postalCode ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Plaats">
            <input
              name="city"
              defaultValue={company.city ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Land">
            <input
              name="country"
              defaultValue={company.country}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Administratie e-mail">
            <input
              name="administrationEmail"
              type="email"
              defaultValue={company.administrationEmail ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="KVK-nummer">
            <input
              name="kvkNumber"
              defaultValue={company.kvkNumber ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="BTW-nummer">
            <input
              name="vatNumber"
              defaultValue={company.vatNumber ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="IBAN">
            <input
              name="iban"
              defaultValue={company.iban ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="BIC">
            <input
              name="bic"
              defaultValue={company.bic ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Telefoon">
            <input
              name="phone"
              defaultValue={company.phone ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Website">
            <input
              name="website"
              defaultValue={company.website ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Logo URL">
            <input
              name="logoUrl"
              defaultValue={company.logoUrl ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Betaaltermijn in dagen">
            <input
              name="defaultPaymentTermDays"
              type="number"
              min={1}
              max={365}
              defaultValue={company.defaultPaymentTermDays}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Primaire kleur">
            <input
              name="primaryColor"
              defaultValue={company.primaryColor}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Secundaire kleur">
            <input
              name="secondaryColor"
              defaultValue={company.secondaryColor}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
        </div>
      </SectionCard>
      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={pending}
        saved={saved}
        error={error}
        submitLabel="Bedrijfsgegevens opslaan"
      />
    </form>
  );
}

function NumberingCard({ settings, canWrite }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numbering = settings.numbering;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateInvoiceNumberingSettings({
        prefix: text(fd, "prefix"),
        format: text(fd, "format"),
        separator: text(fd, "separator") || "-",
        numberPadding: number(fd, "numberPadding", 4),
        resetPeriod: text(fd, "resetPeriod") as "never" | "yearly" | "monthly",
        defaultStartNumber: number(fd, "defaultStartNumber", 1),
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SectionCard
        icon={<Calculator className="h-5 w-5" />}
        title="Factuurnummering"
        description="Officiele nummers worden pas bij finaliseren geclaimd. Conceptfacturen blijven nummerloos."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="Prefix"
            hint="Exact 3 hoofdletters, bijvoorbeeld FAK."
            required
          >
            <input
              name="prefix"
              maxLength={3}
              defaultValue={numbering.prefix}
              disabled={!canWrite || pending}
              className="veele-input w-full uppercase"
            />
          </Field>
          <Field
            label="Format"
            hint="Toegestaan: {PREFIX}, {YYYY}, {YY}, {MM}, {NUMBER}."
            required
          >
            <input
              name="format"
              defaultValue={numbering.format}
              disabled={!canWrite || pending}
              className="veele-input w-full font-mono"
            />
          </Field>
          <Field label="Scheidingsteken">
            <input
              name="separator"
              defaultValue={numbering.separator}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Padding">
            <input
              name="numberPadding"
              type="number"
              min={3}
              max={8}
              defaultValue={numbering.numberPadding}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Startnummer">
            <input
              name="defaultStartNumber"
              type="number"
              min={1}
              defaultValue={numbering.defaultStartNumber}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Reset">
            <SelectAdapter
              name="resetPeriod"
              defaultValue={numbering.resetPeriod}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            >
              <option value="never">Nooit</option>
              <option value="yearly">Jaarlijks</option>
              <option value="monthly">Maandelijks</option>
            </SelectAdapter>
          </Field>
        </div>
      </SectionCard>
      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={pending}
        saved={saved}
        error={error}
        submitLabel="Nummering opslaan"
      />
    </form>
  );
}

function TemplateCard({ settings, canWrite }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = settings.template;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateInvoiceTemplateSettings({
        logoUrl: text(fd, "logoUrl"),
        primaryColor: text(fd, "primaryColor") || "#081D3A",
        secondaryColor: text(fd, "secondaryColor") || "#00B7B3",
        introText: text(fd, "introText"),
        footerText: text(fd, "footerText"),
        paymentInstruction: text(fd, "paymentInstruction"),
        showLogo: checked(fd, "showLogo"),
        showCompanyFooter: checked(fd, "showCompanyFooter"),
        showKvkFooter: checked(fd, "showKvkFooter"),
        showVatFooter: checked(fd, "showVatFooter"),
        showIbanFooter: checked(fd, "showIbanFooter"),
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SectionCard
        icon={<Palette className="h-5 w-5" />}
        title="PDF-opmaak"
        description="Deze template-instellingen worden opgeslagen in de factuursnapshot."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Logo URL">
            <input
              name="logoUrl"
              defaultValue={template.logoUrl ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Primaire kleur">
            <input
              name="primaryColor"
              defaultValue={template.primaryColor}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Secundaire kleur">
            <input
              name="secondaryColor"
              defaultValue={template.secondaryColor}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Intro">
            <textarea
              name="introText"
              rows={3}
              defaultValue={template.introText ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full resize-none"
            />
          </Field>
          <Field label="Footer">
            <textarea
              name="footerText"
              rows={3}
              defaultValue={template.footerText ?? ""}
              disabled={!canWrite || pending}
              className="veele-input w-full resize-none"
            />
          </Field>
          <Field label="Betaalinstructie" required>
            <textarea
              name="paymentInstruction"
              rows={3}
              defaultValue={template.paymentInstruction}
              disabled={!canWrite || pending}
              className="veele-input w-full resize-none"
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Checkbox
            name="showLogo"
            label="Logo tonen"
            defaultChecked={template.showLogo}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showCompanyFooter"
            label="Footer tonen"
            defaultChecked={template.showCompanyFooter}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showKvkFooter"
            label="KVK tonen"
            defaultChecked={template.showKvkFooter}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showVatFooter"
            label="BTW tonen"
            defaultChecked={template.showVatFooter}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showIbanFooter"
            label="IBAN tonen"
            defaultChecked={template.showIbanFooter}
            disabled={!canWrite || pending}
          />
        </div>
      </SectionCard>
      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={pending}
        saved={saved}
        error={error}
        submitLabel="Opmaak opslaan"
      />
    </form>
  );
}

function PaymentCard({ settings, canWrite }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payment = settings.payment;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const paymentProvider = text(fd, "paymentProvider") as "none" | "mollie";
    startTransition(async () => {
      const result = await updateInvoicePaymentSettings({
        paymentProvider,
        mollieEnabled:
          paymentProvider === "mollie" && checked(fd, "mollieEnabled"),
        showPaymentLinkOnInvoice: checked(fd, "showPaymentLinkOnInvoice"),
        showPaymentQrOnInvoice: checked(fd, "showPaymentQrOnInvoice"),
        paymentBlockTitle: text(fd, "paymentBlockTitle"),
        paymentBlockText: text(fd, "paymentBlockText"),
        paymentLinkLabel: text(fd, "paymentLinkLabel"),
      });
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <SectionCard
        icon={<CreditCard className="h-5 w-5" />}
        title="Betaling op facturen"
        description="Bepaal hoe betaalinformatie en online betaalacties op facturen worden getoond."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Betaalprovider">
            <SelectAdapter
              name="paymentProvider"
              defaultValue={payment.paymentProvider}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            >
              <option value="none">Geen online provider</option>
              <option value="mollie">Mollie</option>
            </SelectAdapter>
          </Field>
          <Field label="Betaalknoplabel">
            <input
              name="paymentLinkLabel"
              defaultValue={payment.paymentLinkLabel}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Bloktitel">
            <input
              name="paymentBlockTitle"
              defaultValue={payment.paymentBlockTitle}
              disabled={!canWrite || pending}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Bloktekst">
            <textarea
              name="paymentBlockText"
              rows={3}
              defaultValue={payment.paymentBlockText}
              disabled={!canWrite || pending}
              className="veele-input w-full resize-none"
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Checkbox
            name="mollieEnabled"
            label="Mollie actief"
            defaultChecked={payment.mollieEnabled}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showPaymentLinkOnInvoice"
            label="Betaallink op PDF"
            defaultChecked={payment.showPaymentLinkOnInvoice}
            disabled={!canWrite || pending}
          />
          <Checkbox
            name="showPaymentQrOnInvoice"
            label="QR-code op PDF"
            defaultChecked={payment.showPaymentQrOnInvoice}
            disabled={!canWrite || pending}
          />
        </div>
      </SectionCard>
      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={pending}
        saved={saved}
        error={error}
        submitLabel="Betaling opslaan"
      />
    </form>
  );
}

function MollieCard({ settings, canWrite }: Props) {
  return (
    <div className="space-y-6">
      <SectionCard
        icon={<WalletCards className="h-5 w-5" />}
        title="Mollie"
        description="Mollie wordt tenant-breed aangestuurd via de betaalinstellingen en de beveiligde runtime-configuratie."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <InfoBlock
            label="Status"
            value={settings.payment.mollieEnabled ? "Actief" : "Niet actief"}
          />
          <InfoBlock
            label="PDF betaallink"
            value={
              settings.payment.showPaymentLinkOnInvoice ? "Tonen" : "Verbergen"
            }
          />
          <InfoBlock
            label="PDF QR-code"
            value={
              settings.payment.showPaymentQrOnInvoice ? "Tonen" : "Verbergen"
            }
          />
        </div>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          API-sleutels blijven buiten de browser. Activeer Mollie hier, maar
          beheer secrets via de beveiligde deploymentomgeving.
        </p>
      </SectionCard>
      {!canWrite && (
        <p className="text-sm text-slate-500">
          Alleen gebruikers met schrijfrechten mogen Mollie-instellingen
          wijzigen.
        </p>
      )}
    </div>
  );
}

function PreviewCard({ settings }: { settings: InvoiceSettingsBundle }) {
  return (
    <SectionCard
      icon={<FileText className="h-5 w-5" />}
      title="Preview"
      description="Voorbeeld van de huidige canon-instellingen zonder een factuurnummer te claimen."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Conceptpreview
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">
                {settings.company.legalName || "Uw organisatie"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {settings.company.addressLine1 || "Adresregel"}{" "}
                {settings.company.city || ""}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs uppercase text-slate-500">Volgend nummer</p>
              <p className="font-mono text-lg font-semibold text-slate-950">
                {settings.preview.invoiceNumber}
              </p>
            </div>
          </div>
          <div className="mt-8 rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1fr_120px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
              <span>Omschrijving</span>
              <span className="text-right">Bedrag</span>
            </div>
            <div className="grid grid-cols-[1fr_120px] px-4 py-4 text-sm">
              <span>Voorbeeldregel definitieve factuur</span>
              <span className="text-right">EUR 100,00</span>
            </div>
          </div>
          <p className="mt-6 text-sm text-slate-600">
            {settings.template.paymentInstruction}
          </p>
        </div>
        <div className="space-y-3">
          <InfoBlock label="Periode" value={settings.preview.periodKey} />
          <InfoBlock
            label="Start sequence"
            value={String(settings.preview.sequenceValue)}
          />
          <InfoBlock
            label="Betaaltermijn"
            value={`${settings.preview.dueDateDays} dagen`}
          />
          <InfoBlock label="Reset" value={settings.numbering.resetPeriod} />
        </div>
      </div>
    </SectionCard>
  );
}

function InvoicePreviewCard({ settings }: { settings: InvoiceSettingsBundle }) {
  const primaryColor =
    settings.template.primaryColor || settings.company.primaryColor;
  const accentColor =
    settings.template.secondaryColor || settings.company.secondaryColor;
  const logoUrl = settings.template.logoUrl || settings.company.logoUrl;

  return (
    <SectionCard
      icon={<FileText className="h-5 w-5" />}
      title="Preview en testfactuur"
      description="Voorbeeld van de huidige canon-instellingen zonder een officieel factuurnummer te claimen."
    >
      {settings.preview.warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Controleer deze instellingen voor u definitief factureert
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {settings.preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            className="flex items-center justify-between gap-4 px-6 py-5 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl ? (
                <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-white/95 p-2">
                  <img
                    src={logoUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </span>
              ) : (
                <span
                  className="h-10 w-10 rounded-lg"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase opacity-75">
                  Testfactuur
                </p>
                <h3 className="truncate text-xl font-bold">
                  {settings.company.tradeName ||
                    settings.company.legalName ||
                    "Uw organisatie"}
                </h3>
              </div>
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              Geen sequence claim
            </span>
          </div>
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Afzender
                </p>
                <h4 className="mt-2 text-2xl font-bold text-slate-950">
                  {settings.company.legalName || "Uw organisatie"}
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  {settings.company.addressLine1 || "Adresregel"}{" "}
                  {settings.company.city || ""}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-right">
                <p className="text-xs uppercase text-slate-500">
                  Preview nummer
                </p>
                <p className="font-mono text-lg font-semibold text-slate-950">
                  {settings.preview.invoiceNumber}
                </p>
              </div>
            </div>
            <div className="mt-8 rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1fr_120px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                <span>Omschrijving</span>
                <span className="text-right">Bedrag</span>
              </div>
              <div className="grid grid-cols-[1fr_120px] px-4 py-4 text-sm">
                <span>Voorbeeldregel definitieve factuur</span>
                <span className="text-right">EUR 100,00</span>
              </div>
            </div>
            <p className="mt-6 text-sm text-slate-600">
              {settings.template.paymentInstruction}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <InfoBlock label="Periode" value={settings.preview.periodKey} />
          <InfoBlock
            label="Preview sequence"
            value={String(settings.preview.sequenceValue)}
          />
          <InfoBlock
            label="Betaaltermijn"
            value={`${settings.preview.dueDateDays} dagen`}
          />
          <InfoBlock label="Reset" value={settings.numbering.resetPeriod} />
          <Link
            href={settings.preview.testPdfUrl}
            target="_blank"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Test-PDF downloaden
          </Link>
          <p className="text-xs leading-relaxed text-slate-500">
            Deze download gebruikt dezelfde logo-, kleur- en
            template-instellingen, maar schrijft geen factuur weg en claimt geen
            officieel nummer.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="veele-card">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E0FAFB] text-[#075E5D]">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
      <CheckboxAdapter
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 accent-[#00B7B3]"
      />
      {label}
    </label>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
