"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type {
  WebsiteRedirectDraftItem,
  WebsiteRedirectPageOption,
} from "@workspace/db";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { replaceWebsiteRedirectsAction } from "@/app/actions/website";
import { Button } from "@/components/ui/button";

type Props = {
  siteId: string;
  authoringRevision: number;
  defaultLocale: string;
  redirects: WebsiteRedirectDraftItem[];
  pages: WebsiteRedirectPageOption[];
  canWrite: boolean;
};

export function WebsiteRedirectEditor({
  siteId,
  authoringRevision,
  defaultLocale,
  redirects: initialRedirects,
  pages,
  canWrite,
}: Props) {
  const router = useRouter();
  const [redirects, setRedirects] = useState(initialRedirects);
  const [revision, setRevision] = useState(authoringRevision);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locales = useMemo(
    () => [...new Set([defaultLocale, ...pages.map((page) => page.locale)])],
    [defaultLocale, pages],
  );

  function updateRedirect(
    id: string,
    patch: Partial<WebsiteRedirectDraftItem>,
  ) {
    setRedirects((current) =>
      current.map((redirect) =>
        redirect.id === id ? { ...redirect, ...patch } : redirect,
      ),
    );
  }

  function addRedirect() {
    setRedirects((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        locale: defaultLocale,
        sourcePath: "/oud-pad",
        destinationType: "path",
        destination:
          pages.find(
            (page) =>
              page.locale === defaultLocale && page.status === "published",
          )?.path ?? "/",
        statusCode: 308,
        isActive: true,
      },
    ]);
  }

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await replaceWebsiteRedirectsAction({
        siteId,
        expectedAuthoringRevision: revision,
        redirects,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (result.data) {
        setRevision(result.data.authoringRevision);
        setMessage(
          result.data.changed
            ? "Redirects opgeslagen als concept."
            : "Geen wijzigingen om op te slaan.",
        );
        router.refresh();
      }
    });
  }

  const disabled = !canWrite || isPending;
  return (
    <div className="space-y-4">
      <section className="veele-card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Redirects
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Bronnen zijn per taal uniek. Interne doelen moeten rechtstreeks
              naar een bestaande pagina wijzen; ketens en lussen worden
              geweigerd.
            </p>
          </div>
          {canWrite && (
            <Button type="button" variant="outline" onClick={addRedirect}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Redirect toevoegen
            </Button>
          )}
        </div>

        {redirects.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Er zijn nog geen beheerde redirects.
          </p>
        ) : (
          <div className="space-y-3">
            {redirects.map((redirect) => (
              <article
                key={redirect.id}
                className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[130px_minmax(160px,1fr)_140px_minmax(180px,1fr)_100px_auto]"
              >
                <label className="text-xs font-semibold text-slate-600">
                  Taal
                  <select
                    value={redirect.locale}
                    onChange={(event) =>
                      updateRedirect(redirect.id, {
                        locale: event.target.value,
                      })
                    }
                    disabled={disabled}
                    className="veele-input mt-1 w-full text-sm"
                  >
                    {locales.map((locale) => (
                      <option key={locale} value={locale}>
                        {locale}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Bronpad
                  <input
                    value={redirect.sourcePath}
                    onChange={(event) =>
                      updateRedirect(redirect.id, {
                        sourcePath: event.target.value.trim().toLowerCase(),
                      })
                    }
                    disabled={disabled}
                    maxLength={500}
                    className="veele-input mt-1 w-full font-mono text-sm"
                    aria-label={`Bronpad ${redirect.sourcePath}`}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Doeltype
                  <select
                    value={redirect.destinationType}
                    onChange={(event) =>
                      updateRedirect(redirect.id, {
                        destinationType: event.target.value as
                          | "path"
                          | "external",
                        destination:
                          event.target.value === "path"
                            ? (pages.find(
                                (page) =>
                                  page.locale === redirect.locale &&
                                  page.status === "published",
                              )?.path ?? "/")
                            : "https://",
                      })
                    }
                    disabled={disabled}
                    className="veele-input mt-1 w-full text-sm"
                  >
                    <option value="path">Interne pagina</option>
                    <option value="external">Externe HTTPS-link</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Bestemming
                  {redirect.destinationType === "path" ? (
                    <select
                      value={redirect.destination}
                      onChange={(event) =>
                        updateRedirect(redirect.id, {
                          destination: event.target.value,
                        })
                      }
                      disabled={disabled}
                      className="veele-input mt-1 w-full text-sm"
                    >
                      {pages
                        .filter((page) => page.locale === redirect.locale)
                        .map((page) => (
                          <option key={page.id} value={page.path}>
                            {page.path} · {page.title}
                            {page.status === "draft" ? " (concept)" : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="url"
                      value={redirect.destination}
                      onChange={(event) =>
                        updateRedirect(redirect.id, {
                          destination: event.target.value,
                        })
                      }
                      disabled={disabled}
                      maxLength={2_048}
                      className="veele-input mt-1 w-full text-sm"
                    />
                  )}
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Status
                  <select
                    value={redirect.statusCode}
                    onChange={(event) =>
                      updateRedirect(redirect.id, {
                        statusCode: Number(event.target.value) as
                          | 301
                          | 302
                          | 308,
                      })
                    }
                    disabled={disabled}
                    className="veele-input mt-1 w-full text-sm"
                  >
                    <option value={308}>308</option>
                    <option value={301}>301</option>
                    <option value={302}>302</option>
                  </select>
                </label>
                <div className="flex items-end justify-between gap-2 lg:justify-end">
                  <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
                    <CheckboxAdapter
                      type="checkbox"
                      checked={redirect.isActive}
                      onChange={(event) =>
                        updateRedirect(redirect.id, {
                          isActive: event.target.checked,
                        })
                      }
                      disabled={disabled}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Actief
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    onClick={() =>
                      setRedirects((current) =>
                        current.filter((item) => item.id !== redirect.id),
                      )
                    }
                    aria-label={`Redirect ${redirect.sourcePath} verwijderen`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div aria-live="polite" className="min-h-5 text-sm">
          {error && <p className="text-red-700">{error}</p>}
          {message && <p className="text-emerald-700">{message}</p>}
          {!error && !message && (
            <p className="text-slate-600">
              Opslaan publiceert, activeert of deployt nooit.
            </p>
          )}
        </div>
        <Button type="button" onClick={save} disabled={disabled}>
          {isPending ? "Opslaan…" : "Redirects opslaan"}
        </Button>
      </div>
    </div>
  );
}
