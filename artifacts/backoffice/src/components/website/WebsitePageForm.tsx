"use client";

import type {
  WebsitePageDraft,
  WebsitePageType,
  WebsitePathChangeDecision,
  WebsiteSeo,
} from "@workspace/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createWebsitePageAction,
  updateWebsitePageAction,
} from "@/app/actions/website";
import { Button } from "@/components/ui/button";

type WebsitePageFormProps = {
  siteId: string;
  siteAuthoringRevision: number;
  canWrite: boolean;
  allowHomepageCreation?: boolean;
  page?: {
    id: string;
    title: string;
    navigationLabel: string | null;
    locale: string;
    slug: string;
    path: string;
    pageType: WebsitePageType;
    isHomepage: boolean;
    seo: WebsiteSeo;
    authoringRevision: number;
  };
};

const PAGE_TYPES: Array<readonly [WebsitePageType, string]> = [
  ["standard", "Standaardpagina"],
  ["service", "Dienstpagina"],
  ["contact", "Contactpagina"],
  ["legal", "Juridische pagina"],
  ["area", "Regiopagina"],
  ["custom", "Maatwerkpagina"],
  ["blog_index", "Blogoverzicht"],
];

function slugFromPath(path: string): string {
  if (path === "/") return "";
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

function pageFromForm(
  formData: FormData,
  isHomepage: boolean,
  previousSeo?: WebsiteSeo,
): WebsitePageDraft {
  const rawPath = String(formData.get("path") ?? "")
    .trim()
    .toLowerCase();
  const path = isHomepage ? "/" : `/${rawPath.replace(/^\/+|\/+$/gu, "")}`;
  return {
    title: String(formData.get("title") ?? "").trim(),
    navigationLabel:
      String(formData.get("navigationLabel") ?? "").trim() || null,
    locale: String(formData.get("locale") ?? "nl-NL"),
    slug: isHomepage ? "" : slugFromPath(path),
    path,
    pageType: isHomepage
      ? "home"
      : (String(formData.get("pageType") ?? "standard") as WebsitePageType),
    isHomepage,
    seo: {
      title: String(formData.get("seoTitle") ?? "").trim(),
      description: String(formData.get("seoDescription") ?? "").trim(),
      canonicalPath:
        String(formData.get("canonicalPath") ?? "")
          .trim()
          .toLowerCase() || null,
      socialImageMediaId: previousSeo?.socialImageMediaId ?? null,
      socialImageUrl:
        String(formData.get("socialImageUrl") ?? "").trim() || null,
      indexable: formData.get("indexable") === "on",
    },
  };
}

export function WebsitePageForm({
  siteId,
  siteAuthoringRevision,
  canWrite,
  allowHomepageCreation = false,
  page,
}: WebsitePageFormProps) {
  const router = useRouter();
  const editing = Boolean(page);
  const [isPending, startTransition] = useTransition();
  const [isHomepage, setIsHomepage] = useState(page?.isHomepage ?? false);
  const [pathValue, setPathValue] = useState(page?.path ?? "/");
  const [locale, setLocale] = useState(page?.locale ?? "nl-NL");
  const [siteRevision, setSiteRevision] = useState(siteAuthoringRevision);
  const [pageRevision, setPageRevision] = useState(
    page?.authoringRevision ?? 1,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const draft = pageFromForm(formData, isHomepage, page?.seo);
    const pathChangeDecision = String(
      formData.get("pathChangeDecision") ?? "create_redirect",
    ) as WebsitePathChangeDecision;
    startTransition(async () => {
      if (!editing) {
        const result = await createWebsitePageAction({
          siteId,
          expectedAuthoringRevision: siteRevision,
          page: draft,
        });
        if (!result.success) {
          setError(result.message);
          return;
        }
        if (result.data?.pageId) {
          router.push(`/website/pages/${result.data.pageId}`);
          router.refresh();
        }
        return;
      }

      const result = await updateWebsitePageAction({
        siteId,
        pageId: page!.id,
        expectedAuthoringRevision: siteRevision,
        expectedPageRevision: pageRevision,
        pathChangeDecision,
        page: draft,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (result.data) {
        setPageRevision(result.data.pageAuthoringRevision);
        setSiteRevision(result.data.siteAuthoringRevision);
        setMessage("Paginagegevens opgeslagen.");
        router.refresh();
      }
    });
  }

  const disabled = !canWrite || isPending;
  const normalizedPath = isHomepage
    ? "/"
    : `/${pathValue
        .trim()
        .toLowerCase()
        .replace(/^\/+|\/+$/gu, "")}`;
  const routeChanged =
    editing &&
    (normalizedPath !== page?.path || locale !== (page?.locale ?? locale));
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="veele-card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Paginagegevens
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Titel, publiek pad en type worden server-side op tenant en uniciteit
            gecontroleerd.
          </p>
        </div>
        {!editing && allowHomepageCreation && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isHomepage}
              onChange={(event) => setIsHomepage(event.target.checked)}
              disabled={disabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            Dit is de homepage
          </label>
        )}
        {editing && page?.isHomepage && (
          <p className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
            Dit is de homepage. Het pad en paginatype blijven daarom vastgezet.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Interne titel" htmlFor="website-page-title" required>
            <input
              id="website-page-title"
              name="title"
              defaultValue={page?.title ?? ""}
              maxLength={180}
              required
              disabled={disabled}
              className="veele-input w-full"
            />
          </Field>
          <Field label="Navigatielabel" htmlFor="website-page-nav-label">
            <input
              id="website-page-nav-label"
              name="navigationLabel"
              defaultValue={page?.navigationLabel ?? ""}
              maxLength={180}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="Valt terug op de titel"
            />
          </Field>
          <Field
            label="Publiek pad"
            htmlFor="website-page-path"
            required
            hint="Gebruik kleine letters, cijfers, streepjes en schuine strepen."
          >
            <input
              id="website-page-path"
              name="path"
              value={pathValue}
              onChange={(event) => setPathValue(event.target.value)}
              maxLength={500}
              required
              disabled={disabled || isHomepage}
              className="veele-input w-full"
              placeholder="/diensten/schoonmaak"
            />
          </Field>
          {routeChanged && !page?.isHomepage && (
            <Field
              label="Bij een gewijzigde route"
              htmlFor="website-page-path-change"
              required
              hint="Een permanente redirect behoudt bestaande links en wordt samen met de paginawijziging opgeslagen."
            >
              <select
                id="website-page-path-change"
                name="pathChangeDecision"
                defaultValue=""
                disabled={disabled}
                required
                className="veele-input w-full"
              >
                <option value="" disabled>
                  Kies wat er met de oude route gebeurt
                </option>
                <option value="create_redirect">
                  Maak automatisch een permanente redirect (aanbevolen)
                </option>
                <option value="no_redirect">
                  Wijzig bewust zonder redirect
                </option>
              </select>
            </Field>
          )}
          <Field label="Paginatype" htmlFor="website-page-type" required>
            <select
              id="website-page-type"
              name="pageType"
              defaultValue={
                page?.pageType === "home"
                  ? "standard"
                  : (page?.pageType ?? "standard")
              }
              disabled={disabled || isHomepage}
              className="veele-input w-full"
            >
              {PAGE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taal" htmlFor="website-page-locale" required>
            <select
              id="website-page-locale"
              name="locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              disabled={disabled}
              className="veele-input w-full"
            >
              <option value="nl-NL">Nederlands (Nederland)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="de-DE">Deutsch (Deutschland)</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="veele-card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">SEO</h2>
          <p className="mt-1 text-sm text-slate-600">
            Expliciete metadata voor deze pagina; geen vrije HTML of scripts.
          </p>
        </div>
        <Field label="SEO-titel" htmlFor="website-page-seo-title" required>
          <input
            id="website-page-seo-title"
            name="seoTitle"
            defaultValue={page?.seo.title ?? page?.title ?? ""}
            minLength={1}
            maxLength={70}
            required
            disabled={disabled}
            className="veele-input w-full"
          />
        </Field>
        <Field
          label="SEO-omschrijving"
          htmlFor="website-page-seo-description"
          required
        >
          <textarea
            id="website-page-seo-description"
            name="seoDescription"
            defaultValue={page?.seo.description ?? ""}
            minLength={1}
            maxLength={170}
            required
            disabled={disabled}
            rows={3}
            className="veele-input w-full resize-y"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Canonical pad"
            htmlFor="website-page-canonical"
            hint="Leeg gebruikt het eigen publieke pad. Alleen een bestaand gepubliceerd pad in dezelfde taal is toegestaan."
          >
            <input
              id="website-page-canonical"
              name="canonicalPath"
              defaultValue={page?.seo.canonicalPath ?? ""}
              maxLength={500}
              pattern="/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?"
              disabled={disabled}
              className="veele-input w-full"
              placeholder="/"
            />
          </Field>
          <Field
            label="Social-afbeelding"
            htmlFor="website-page-social-image"
            hint="Volledige HTTPS-afbeeldings-URL; leeg gebruikt de websitebrede standaard."
          >
            <input
              id="website-page-social-image"
              name="socialImageUrl"
              type="url"
              defaultValue={page?.seo.socialImageUrl ?? ""}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="https://cdn.voorbeeld.nl/social/pagina.jpg"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="indexable"
            defaultChecked={page?.seo.indexable ?? true}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300"
          />
          Deze pagina mag door zoekmachines worden geïndexeerd
        </label>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-5 text-sm">
          {error && <p className="text-red-700">{error}</p>}
          {message && <p className="text-emerald-700">{message}</p>}
        </div>
        <Button type="submit" disabled={disabled}>
          {isPending
            ? "Opslaan…"
            : editing
              ? "Pagina opslaan"
              : "Pagina aanmaken"}
        </Button>
      </div>
    </form>
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
