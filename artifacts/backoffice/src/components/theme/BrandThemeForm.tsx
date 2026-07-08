"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Paintbrush, Save, Type, Upload } from "lucide-react";
import {
  savePlatformThemeSettings,
  saveTenantThemeSettings,
  uploadPlatformThemeAsset,
  uploadTenantThemeAsset,
} from "@/app/actions/theme-settings";
import type { BrandTheme, BrandingAssetKind } from "@workspace/db";

type BrandThemeFormMode = "platform" | "tenant";
type ColorName =
  | "primaryColor"
  | "secondaryColor"
  | "accentColor"
  | "backgroundColor"
  | "surfaceColor"
  | "textColor"
  | "mutedColor"
  | "sidebarBackgroundColor"
  | "sidebarTextColor"
  | "sidebarAccentColor";

export function BrandThemeForm({
  mode,
  theme,
  useCustomTheme = true,
  customThemeAllowed = true,
  canWrite,
}: {
  mode: BrandThemeFormMode;
  theme: BrandTheme;
  useCustomTheme?: boolean;
  customThemeAllowed?: boolean;
  canWrite: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customThemeEnabled, setCustomThemeEnabled] = useState(useCustomTheme);
  const [brandName, setBrandName] = useState(theme.brandName);
  const [colors, setColors] = useState<Record<ColorName, string>>({
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    surfaceColor: theme.surfaceColor,
    textColor: theme.textColor,
    mutedColor: theme.mutedColor,
    sidebarBackgroundColor: theme.sidebarBackgroundColor,
    sidebarTextColor: theme.sidebarTextColor,
    sidebarAccentColor: theme.sidebarAccentColor,
  });
  const [assets, setAssets] = useState({
    logoUrl: theme.logoUrl,
    logoStoragePath: theme.logoStoragePath,
    faviconUrl: theme.faviconUrl,
    faviconStoragePath: theme.faviconStoragePath,
  });
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const editable = canWrite && (mode === "platform" || (customThemeAllowed && customThemeEnabled));

  function updateColor(name: ColorName, value: string) {
    setColors((current) => ({ ...current, [name]: value }));
  }

  function submitTheme(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = mode === "platform"
        ? await savePlatformThemeSettings(formData)
        : await saveTenantThemeSettings(formData);

      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(result.message);
      }
    });
  }

  function uploadAsset(kind: BrandingAssetKind, file: File | undefined) {
    if (!file || !canWrite || (mode === "tenant" && !customThemeAllowed)) return;
    setSaved(false);
    setError(null);
    const formData = new FormData();
    formData.append("assetKind", kind);
    formData.append("asset", file);

    startTransition(async () => {
      const result = mode === "platform"
        ? await uploadPlatformThemeAsset(formData)
        : await uploadTenantThemeAsset(formData);

      if (!result.success) {
        setError(result.message);
        return;
      }

      if (!result.data) {
        setError("Upload mislukt.");
        return;
      }

      const uploaded = result.data;
      if (uploaded) {
        setAssets((current) => kind === "logo"
          ? { ...current, logoUrl: uploaded.url, logoStoragePath: uploaded.path }
          : { ...current, faviconUrl: uploaded.url, faviconStoragePath: uploaded.path });
        if (mode === "tenant") setCustomThemeEnabled(true);
      }
    });
  }

  return (
    <form onSubmit={submitTheme} className="grid gap-5">
      <input type="hidden" name="logoUrl" value={assets.logoUrl ?? ""} />
      <input type="hidden" name="logoStoragePath" value={assets.logoStoragePath ?? ""} />
      <input type="hidden" name="faviconUrl" value={assets.faviconUrl ?? ""} />
      <input type="hidden" name="faviconStoragePath" value={assets.faviconStoragePath ?? ""} />

      {mode === "tenant" && (
        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex items-start gap-3">
            <input
              name="useCustomTheme"
              type="checkbox"
              checked={customThemeEnabled}
              disabled={!canWrite || !customThemeAllowed || isPending}
              onChange={(event) => setCustomThemeEnabled(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">Eigen organisatiethema gebruiken</span>
              <span className="mt-1 block text-sm text-slate-600">
                Uitgeschakeld gebruikt uw organisatie de standaard platformuitstraling.
              </span>
              {!customThemeAllowed ? (
                <span className="mt-2 block rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Whitelabel branding is beschikbaar voor Enterprise organisaties.
                </span>
              ) : null}
            </span>
          </label>
        </section>
      )}

      <section className="grid gap-5 rounded border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Paintbrush className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Branding</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Naam" htmlFor="brandName">
              <input
                id="brandName"
                name="brandName"
                value={brandName}
                disabled={!editable || isPending}
                maxLength={120}
                onChange={(event) => setBrandName(event.target.value)}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </Field>
            <Field label="Logo" htmlFor="logoUpload">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                  {assets.logoUrl ? (
                    <img src={assets.logoUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <input
                  ref={logoRef}
                  id="logoUpload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={!canWrite || (mode === "tenant" && !customThemeAllowed) || isPending}
                  className="hidden"
                  onChange={(event) => {
                    uploadAsset("logo", event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoRef.current?.click()}
                  disabled={!canWrite || (mode === "tenant" && !customThemeAllowed) || isPending}
                  className="inline-flex min-h-10 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </button>
              </div>
            </Field>
            <Field label="Favicon/app icon" htmlFor="faviconUpload">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                  {assets.faviconUrl ? (
                    <img src={assets.faviconUrl} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <input
                  ref={faviconRef}
                  id="faviconUpload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={!canWrite || (mode === "tenant" && !customThemeAllowed) || isPending}
                  className="hidden"
                  onChange={(event) => {
                    uploadAsset("favicon", event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => faviconRef.current?.click()}
                  disabled={!canWrite || (mode === "tenant" && !customThemeAllowed) || isPending}
                  className="inline-flex min-h-10 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </button>
              </div>
            </Field>
            <p className="self-end text-xs text-slate-500">PNG, JPG, WebP of SVG. Maximaal 2 MB.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ColorField label="Primair" name="primaryColor" value={colors.primaryColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Secundair" name="secondaryColor" value={colors.secondaryColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Accent" name="accentColor" value={colors.accentColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Achtergrond" name="backgroundColor" value={colors.backgroundColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Vlakken" name="surfaceColor" value={colors.surfaceColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Tekst" name="textColor" value={colors.textColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Subtekst" name="mutedColor" value={colors.mutedColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Sidebar achtergrond" name="sidebarBackgroundColor" value={colors.sidebarBackgroundColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Sidebar tekst" name="sidebarTextColor" value={colors.sidebarTextColor} disabled={!editable || isPending} onChange={updateColor} />
            <ColorField label="Sidebar accent" name="sidebarAccentColor" value={colors.sidebarAccentColor} disabled={!editable || isPending} onChange={updateColor} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Tekstfont" name="fontFamily" defaultValue={theme.fontFamily} disabled={!editable || isPending}>
              <option value="inter">Inter</option>
              <option value="poppins">Poppins</option>
              <option value="system">System</option>
            </SelectField>
            <SelectField label="Kopfont" name="headingFontFamily" defaultValue={theme.headingFontFamily} disabled={!editable || isPending}>
              <option value="poppins">Poppins</option>
              <option value="inter">Inter</option>
              <option value="system">System</option>
            </SelectField>
            <SelectField label="Hoeken" name="borderRadius" defaultValue={theme.borderRadius} disabled={!editable || isPending}>
              <option value="sm">Strak</option>
              <option value="md">Normaal</option>
              <option value="lg">Rond</option>
            </SelectField>
            <SelectField label="Dichtheid" name="density" defaultValue={theme.density} disabled={!editable || isPending}>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortabel</option>
              <option value="spacious">Ruim</option>
            </SelectField>
          </div>
        </div>

        <aside className="rounded border border-slate-200 p-4" style={{ backgroundColor: colors.backgroundColor, color: colors.textColor }}>
          <div
            className="rounded p-4 shadow-sm"
            style={{
              backgroundColor: colors.surfaceColor,
              borderRadius: theme.borderRadius === "lg" ? 10 : theme.borderRadius === "sm" ? 4 : 6,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded" style={{ backgroundColor: colors.accentColor }}>
                {assets.logoUrl ? <img src={assets.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : <Type className="h-5 w-5 text-white" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: colors.primaryColor }}>{brandName || theme.brandName}</p>
                <p className="truncate text-xs" style={{ color: colors.mutedColor }}>Theme preview</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <span className="h-2 rounded-full" style={{ backgroundColor: colors.primaryColor }} />
              <span className="h-2 w-4/5 rounded-full" style={{ backgroundColor: colors.secondaryColor }} />
              <span className="h-2 w-3/5 rounded-full" style={{ backgroundColor: colors.accentColor }} />
            </div>
            <div
              className="mt-4 rounded p-3"
              style={{ backgroundColor: colors.sidebarBackgroundColor, color: colors.sidebarTextColor }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.sidebarAccentColor }} />
                <span className="text-xs font-semibold">Sidebar preview</span>
              </div>
            </div>
            <button type="button" className="mt-5 min-h-10 rounded px-4 text-sm font-semibold text-white" style={{ backgroundColor: colors.accentColor }}>
              Actie
            </button>
          </div>
        </aside>
      </section>

      <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
          <Type className="h-5 w-5 text-cyan-700" />
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">E-mail</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Footertekst" htmlFor="emailFooterText">
            <textarea
              id="emailFooterText"
              name="emailFooterText"
              defaultValue={theme.emailFooterText}
              disabled={!editable || isPending}
              rows={4}
              maxLength={2000}
              className="min-h-28 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </Field>
          <Field label="Handtekening" htmlFor="emailSignature">
            <textarea
              id="emailSignature"
              name="emailSignature"
              defaultValue={theme.emailSignature}
              disabled={!editable || isPending}
              rows={4}
              maxLength={2000}
              className="min-h-28 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {saved ? <span className="font-semibold text-emerald-700">Opgeslagen</span> : null}
          {error ? <span className="font-semibold text-rose-700">{error}</span> : null}
        </p>
        <button
          type="submit"
          disabled={!canWrite || isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Bezig..." : "Opslaan"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function ColorField({
  label,
  name,
  value,
  disabled,
  onChange,
}: {
  label: string;
  name: ColorName;
  value: string;
  disabled: boolean;
  onChange: (name: ColorName, value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <span className="flex min-h-11 overflow-hidden rounded border border-slate-300 bg-white">
        <input
          type="color"
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(name, event.target.value)}
          className="h-11 w-12 shrink-0 border-0 bg-transparent p-1 disabled:opacity-50"
        />
        <input
          name={name}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(name, event.target.value)}
          className="min-w-0 flex-1 border-0 px-3 text-sm text-slate-950 outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </span>
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  disabled,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {children}
      </select>
    </label>
  );
}
