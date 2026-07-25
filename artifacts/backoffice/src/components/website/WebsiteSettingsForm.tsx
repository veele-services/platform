"use client";

import { SelectAdapter } from "@/components/ui/select-adapter";
import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type { WebsiteSiteSettings } from "@workspace/db";
import {
  WEBSITE_TEMPLATE_KEYS,
  WEBSITE_TEMPLATE_REGISTRY,
  type WebsiteTemplateKey,
} from "@workspace/website-core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  initializeWebsiteAction,
  updateWebsiteSettingsAction,
} from "@/app/actions/website";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type WebsiteSettingsFormProps = {
  initialSettings: WebsiteSiteSettings;
  canWrite: boolean;
  siteId?: string;
  authoringRevision?: number;
  initialize?: boolean;
};

function optionalValue(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function lines(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function settingsFromForm(
  formData: FormData,
  previous: WebsiteSiteSettings,
): WebsiteSiteSettings {
  const analyticsProvider = String(formData.get("analyticsProvider") ?? "none");
  const socialLinks = (
    ["facebook", "instagram", "linkedin", "youtube"] as const
  ).flatMap((provider) => {
    const url = optionalValue(formData, `social_${provider}`);
    return url ? [{ provider, url }] : [];
  });

  return {
    schemaVersion: 1,
    name: String(formData.get("name") ?? "").trim(),
    defaultLocale: String(formData.get("defaultLocale") ?? "nl-NL").trim(),
    theme: {
      schemaVersion: 1,
      colors: {
        background: String(formData.get("color_background") ?? "").trim(),
        foreground: String(formData.get("color_foreground") ?? "").trim(),
        primary: String(formData.get("color_primary") ?? "").trim(),
        primaryForeground: String(
          formData.get("color_primary_foreground") ?? "",
        ).trim(),
        accent: String(formData.get("color_accent") ?? "").trim(),
        accentForeground: String(
          formData.get("color_accent_foreground") ?? "",
        ).trim(),
      },
      headingFont: String(
        formData.get("headingFont") ?? "inter",
      ) as WebsiteSiteSettings["theme"]["headingFont"],
      bodyFont: String(
        formData.get("bodyFont") ?? "inter",
      ) as WebsiteSiteSettings["theme"]["bodyFont"],
      radius: String(
        formData.get("radius") ?? "medium",
      ) as WebsiteSiteSettings["theme"]["radius"],
      spacing: String(
        formData.get("spacing") ?? "comfortable",
      ) as WebsiteSiteSettings["theme"]["spacing"],
      contentWidth: String(
        formData.get("contentWidth") ?? "standard",
      ) as WebsiteSiteSettings["theme"]["contentWidth"],
      buttonStyle: String(
        formData.get("buttonStyle") ?? "solid",
      ) as WebsiteSiteSettings["theme"]["buttonStyle"],
      surfaceStyle: String(
        formData.get("surfaceStyle") ?? "bordered",
      ) as WebsiteSiteSettings["theme"]["surfaceStyle"],
      logoMediaId: previous.theme.logoMediaId,
      faviconMediaId: previous.theme.faviconMediaId,
    },
    contact: {
      companyName: String(formData.get("companyName") ?? "").trim(),
      email: optionalValue(formData, "email"),
      phone: optionalValue(formData, "phone"),
      street: optionalValue(formData, "street"),
      postalCode: optionalValue(formData, "postalCode"),
      city: optionalValue(formData, "city"),
      countryCode: String(formData.get("countryCode") ?? "NL")
        .trim()
        .toUpperCase(),
      openingHours: lines(formData, "openingHours"),
    },
    socialLinks,
    defaultSeo: {
      title: String(formData.get("seoTitle") ?? "").trim(),
      description: String(formData.get("seoDescription") ?? "").trim(),
      canonicalPath: null,
      socialImageMediaId: previous.defaultSeo.socialImageMediaId,
      socialImageUrl: optionalValue(formData, "socialImageUrl"),
      indexable: formData.get("indexable") === "on",
    },
    analytics:
      analyticsProvider === "plausible"
        ? {
            provider: "plausible",
            publicSiteId: String(formData.get("plausiblePublicSiteId") ?? "")
              .trim()
              .toLowerCase(),
          }
        : { provider: "none" },
    seoSettings: {
      schemaVersion: 1,
      structuredData: {
        enabled: formData.get("structuredDataEnabled") === "on",
        organizationType: String(
          formData.get("organizationType") ?? "organization",
        ) as WebsiteSiteSettings["seoSettings"]["structuredData"]["organizationType"],
      },
      webmasterVerification: {
        google: optionalValue(formData, "googleVerification"),
        bing: optionalValue(formData, "bingVerification"),
      },
    },
  };
}

export function WebsiteSettingsForm({
  initialSettings,
  canWrite,
  siteId,
  authoringRevision,
  initialize = false,
}: WebsiteSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [revision, setRevision] = useState(authoringRevision ?? 1);
  const [templateKey, setTemplateKey] =
    useState<WebsiteTemplateKey>("trust_conversion");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const settings = settingsFromForm(
      new FormData(event.currentTarget),
      initialSettings,
    );

    startTransition(async () => {
      if (initialize) {
        const result = await initializeWebsiteAction({
          templateKey,
          settings,
        });
        if (!result.success) {
          setError(result.message);
          return;
        }
        setMessage("De beheerde website is aangemaakt.");
        router.push("/website/pages");
        router.refresh();
        return;
      }

      const result = await updateWebsiteSettingsAction({
        siteId: siteId!,
        expectedAuthoringRevision: revision,
        settings,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (result.data?.authoringRevision) {
        setRevision(result.data.authoringRevision);
      }
      setMessage("Website-instellingen opgeslagen.");
      router.refresh();
    });
  }

  const social = new Map(
    initialSettings.socialLinks.map((item) => [item.provider, item.url]),
  );
  const disabled = !canWrite || isPending;
  const theme = initialize
    ? WEBSITE_TEMPLATE_REGISTRY[templateKey].defaultTheme
    : initialSettings.theme;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {initialize && (
        <WebsiteFormSection
          title="Kies een starttemplate"
          description="De template maakt één bewerkbaar concept met pagina's, secties en navigatie. Er wordt niets gepubliceerd en later wisselen overschrijft nooit bestaande inhoud."
        >
          <RadioGroup
            name="templateKey"
            value={templateKey}
            disabled={disabled}
            onValueChange={(value) =>
              setTemplateKey(value as WebsiteTemplateKey)
            }
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {WEBSITE_TEMPLATE_KEYS.map((key) => {
              const template = WEBSITE_TEMPLATE_REGISTRY[key];
              const selected = templateKey === key;
              return (
                <label
                  key={key}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    selected
                      ? "border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500"
                      : "border-slate-200 bg-white hover:border-cyan-200"
                  }`}
                >
                  <RadioGroupItem value={key} className="sr-only" />
                  <span className="block text-sm font-semibold text-slate-950">
                    {template.label}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {template.description}
                  </span>
                  <span className="mt-3 block text-xs font-medium text-cyan-800">
                    {template.pages.length} startpagina&apos;s · versie{" "}
                    {template.version}
                  </span>
                </label>
              );
            })}
          </RadioGroup>
          <p className="text-xs text-slate-500">
            Custom Next.js is een afzonderlijke enterprise-deliverymodus en is
            daarom geen templateoptie.
          </p>
        </WebsiteFormSection>
      )}

      <WebsiteFormSection
        title="Algemeen"
        description="De publieke naam en standaardtaal van de website."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Websitenaam" htmlFor="website-name" required>
            <input
              id="website-name"
              name="name"
              defaultValue={initialSettings.name}
              maxLength={160}
              required
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Standaardtaal" htmlFor="website-locale" required>
            <SelectAdapter
              id="website-locale"
              name="defaultLocale"
              defaultValue={initialSettings.defaultLocale}
              disabled={disabled}
              className="veele-input w-full"
            >
              <option value="nl-NL">Nederlands (Nederland)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="de-DE">Deutsch (Deutschland)</option>
            </SelectAdapter>
          </Field>
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        title="Contactgegevens"
        description="Deze gegevens mogen publiek op de website worden getoond."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bedrijfsnaam" htmlFor="website-company" required>
            <input
              id="website-company"
              name="companyName"
              defaultValue={initialSettings.contact.companyName}
              maxLength={180}
              required
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="E-mailadres" htmlFor="website-email">
            <input
              id="website-email"
              name="email"
              type="email"
              defaultValue={initialSettings.contact.email ?? ""}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="info@bedrijf.nl"
            />
          </Field>
          <Field
            label="Telefoonnummer (internationaal)"
            htmlFor="website-phone"
          >
            <input
              id="website-phone"
              name="phone"
              type="tel"
              defaultValue={initialSettings.contact.phone ?? ""}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="+31101234567"
            />
          </Field>
          <Field label="Straat en huisnummer" htmlFor="website-street">
            <input
              id="website-street"
              name="street"
              defaultValue={initialSettings.contact.street ?? ""}
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Postcode" htmlFor="website-postal-code">
            <input
              id="website-postal-code"
              name="postalCode"
              defaultValue={initialSettings.contact.postalCode ?? ""}
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Plaats" htmlFor="website-city">
            <input
              id="website-city"
              name="city"
              defaultValue={initialSettings.contact.city ?? ""}
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Landcode" htmlFor="website-country">
            <input
              id="website-country"
              name="countryCode"
              defaultValue={initialSettings.contact.countryCode}
              minLength={2}
              maxLength={2}
              disabled={disabled}
              className="veele-input w-full uppercase"
            />
          </Field>
          <Field
            label="Openingstijden"
            htmlFor="website-opening-hours"
            hint="Eén regel per vermelding, maximaal 14 regels."
          >
            <textarea
              id="website-opening-hours"
              name="openingHours"
              defaultValue={initialSettings.contact.openingHours.join("\n")}
              disabled={disabled}
              rows={4}
              className="veele-input w-full resize-y"
            />
          </Field>
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        key={initialize ? templateKey : "existing-theme"}
        title="Huisstijl"
        description="Beheer alleen gecontroleerde design-tokens; vrije CSS is niet toegestaan."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["background", "Achtergrond"],
              ["foreground", "Tekst"],
              ["primary", "Primair"],
              ["primaryForeground", "Tekst op primair"],
              ["accent", "Accent"],
              ["accentForeground", "Tekst op accent"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`website-color-${key}`}>
              <div className="flex gap-2">
                <input
                  aria-label={`${label} kiezen`}
                  type="color"
                  defaultValue={theme.colors[key]}
                  disabled={disabled}
                  onChange={(event) => {
                    const textInput = event.currentTarget.nextElementSibling;
                    if (textInput instanceof HTMLInputElement) {
                      textInput.value = event.currentTarget.value.toUpperCase();
                    }
                  }}
                  className="h-10 w-12 rounded-md border border-input bg-white p-1"
                />
                <input
                  id={`website-color-${key}`}
                  name={`color_${key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)}`}
                  defaultValue={theme.colors[key]}
                  pattern="#[0-9A-Fa-f]{6}"
                  required
                  disabled={disabled}
                  className="veele-input min-w-0 flex-1 uppercase"
                />
              </div>
            </Field>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            id="website-heading-font"
            name="headingFont"
            label="Koplettertype"
            value={theme.headingFont}
            disabled={disabled}
            options={[
              ["inter", "Inter"],
              ["manrope", "Manrope"],
              ["source_sans_3", "Source Sans 3"],
            ]}
          />
          <SelectField
            id="website-body-font"
            name="bodyFont"
            label="Broodtekstlettertype"
            value={theme.bodyFont}
            disabled={disabled}
            options={[
              ["inter", "Inter"],
              ["source_sans_3", "Source Sans 3"],
            ]}
          />
          <SelectField
            id="website-radius"
            name="radius"
            label="Afronding"
            value={theme.radius}
            disabled={disabled}
            options={[
              ["none", "Geen"],
              ["small", "Klein"],
              ["medium", "Gemiddeld"],
              ["large", "Groot"],
            ]}
          />
          <SelectField
            id="website-spacing"
            name="spacing"
            label="Ruimte"
            value={theme.spacing}
            disabled={disabled}
            options={[
              ["compact", "Compact"],
              ["comfortable", "Comfortabel"],
              ["spacious", "Ruim"],
            ]}
          />
          <SelectField
            id="website-content-width"
            name="contentWidth"
            label="Inhoudsbreedte"
            value={theme.contentWidth}
            disabled={disabled}
            options={[
              ["compact", "Compact"],
              ["standard", "Standaard"],
              ["wide", "Breed"],
            ]}
          />
          <SelectField
            id="website-button-style"
            name="buttonStyle"
            label="Knoppen"
            value={theme.buttonStyle}
            disabled={disabled}
            options={[
              ["solid", "Vol"],
              ["soft", "Zacht"],
              ["outline", "Omlijnd"],
            ]}
          />
          <SelectField
            id="website-surface-style"
            name="surfaceStyle"
            label="Contentvlakken"
            value={theme.surfaceStyle}
            disabled={disabled}
            options={[
              ["flat", "Vlak"],
              ["bordered", "Omlijnd"],
              ["elevated", "Verhoogd"],
            ]}
          />
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        title="Standaard SEO"
        description="Wordt gebruikt wanneer een pagina geen eigen waarden heeft."
      >
        <div className="grid gap-4">
          <Field label="SEO-titel" htmlFor="website-seo-title" required>
            <input
              id="website-seo-title"
              name="seoTitle"
              defaultValue={initialSettings.defaultSeo.title}
              minLength={1}
              maxLength={70}
              required
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field
            label="SEO-omschrijving"
            htmlFor="website-seo-description"
            required
          >
            <textarea
              id="website-seo-description"
              name="seoDescription"
              defaultValue={initialSettings.defaultSeo.description}
              minLength={1}
              maxLength={170}
              required
              disabled={disabled}
              rows={3}
              className="veele-input w-full resize-y"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <CheckboxAdapter
              type="checkbox"
              name="indexable"
              defaultChecked={initialSettings.defaultSeo.indexable}
              disabled={disabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Zoekmachines mogen de website indexeren zodra deze live staat
          </label>
          <Field
            label="Standaard social-afbeelding"
            htmlFor="website-social-image"
            hint="Een volledige HTTPS-afbeeldings-URL voor Open Graph. Pagina's en blogs kunnen deze overschrijven."
          >
            <input
              id="website-social-image"
              name="socialImageUrl"
              type="url"
              defaultValue={initialSettings.defaultSeo.socialImageUrl ?? ""}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="https://cdn.voorbeeld.nl/social/website.jpg"
            />
          </Field>
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        title="Gestructureerde data en verificatie"
        description="Fieldgrid genereert vaste schema.org- en webmastermetadata uit gevalideerde velden; vrije markup is niet mogelijk."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="website-organization-type"
            name="organizationType"
            label="Organisatietype"
            value={initialSettings.seoSettings.structuredData.organizationType}
            disabled={disabled}
            options={[
              ["organization", "Organisatie"],
              ["local_business", "Lokaal bedrijf"],
              ["home_and_construction_business", "Bouw- of onderhoudsbedrijf"],
              ["professional_service", "Zakelijke dienstverlener"],
            ]}
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckboxAdapter
                type="checkbox"
                name="structuredDataEnabled"
                defaultChecked={
                  initialSettings.seoSettings.structuredData.enabled
                }
                disabled={disabled}
                className="h-4 w-4 rounded border-slate-300"
              />
              Gevalideerde schema.org-data publiceren
            </label>
          </div>
          <Field
            label="Google-verificatietoken"
            htmlFor="website-google-verification"
            hint="Alleen de tokenwaarde, zonder meta-tag of HTML."
          >
            <input
              id="website-google-verification"
              name="googleVerification"
              defaultValue={
                initialSettings.seoSettings.webmasterVerification.google ?? ""
              }
              minLength={8}
              maxLength={180}
              pattern="[A-Za-z0-9_-]+"
              disabled={disabled}
              className="veele-input w-full"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Bing-verificatietoken"
            htmlFor="website-bing-verification"
            hint="Alleen de msvalidate.01-tokenwaarde."
          >
            <input
              id="website-bing-verification"
              name="bingVerification"
              defaultValue={
                initialSettings.seoSettings.webmasterVerification.bing ?? ""
              }
              minLength={8}
              maxLength={180}
              pattern="[A-Za-z0-9_-]+"
              disabled={disabled}
              className="veele-input w-full"
              autoComplete="off"
            />
          </Field>
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        title="Privacyvriendelijke analytics"
        description="Analytics wordt alleen na expliciete bezoekerstoestemming geladen. Eigen scripts of trackingcode zijn niet toegestaan."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="website-analytics-provider"
            name="analyticsProvider"
            label="Provider"
            value={initialSettings.analytics.provider}
            disabled={disabled}
            options={[
              ["none", "Geen analytics"],
              ["plausible", "Plausible"],
            ]}
          />
          <Field
            label="Plausible site-ID"
            htmlFor="website-plausible-site-id"
            hint="Eén publieke hostname, bijvoorbeeld bedrijf.nl."
          >
            <input
              id="website-plausible-site-id"
              name="plausiblePublicSiteId"
              defaultValue={
                initialSettings.analytics.provider === "plausible"
                  ? initialSettings.analytics.publicSiteId
                  : ""
              }
              maxLength={253}
              pattern="(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}"
              disabled={disabled}
              className="veele-input w-full lowercase"
              placeholder="bedrijf.nl"
            />
          </Field>
        </div>
      </WebsiteFormSection>

      <WebsiteFormSection
        title="Sociale kanalen"
        description="Alleen volledige HTTPS-profieladressen."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {(["facebook", "instagram", "linkedin", "youtube"] as const).map(
            (provider) => (
              <Field
                key={provider}
                label={provider[0]!.toUpperCase() + provider.slice(1)}
                htmlFor={`website-social-${provider}`}
              >
                <input
                  id={`website-social-${provider}`}
                  name={`social_${provider}`}
                  type="url"
                  defaultValue={social.get(provider) ?? ""}
                  disabled={disabled}
                  className="veele-input w-full"
                  placeholder={`https://${provider}.com/...`}
                />
              </Field>
            ),
          )}
        </div>
      </WebsiteFormSection>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-5 text-sm">
          {error && <p className="text-red-700">{error}</p>}
          {message && <p className="text-emerald-700">{message}</p>}
        </div>
        <Button type="submit" disabled={disabled}>
          {isPending
            ? "Opslaan…"
            : initialize
              ? "Beheerde website aanmaken"
              : "Instellingen opslaan"}
        </Button>
      </div>
    </form>
  );
}

function WebsiteFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="veele-card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  disabled,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  disabled: boolean;
  options: Array<readonly [string, string]>;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <SelectAdapter
        id={id}
        name={name}
        defaultValue={value}
        disabled={disabled}
        className="veele-input w-full"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </SelectAdapter>
    </Field>
  );
}
