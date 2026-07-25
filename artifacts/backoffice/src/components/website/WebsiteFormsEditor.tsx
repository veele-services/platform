"use client";

import { SelectAdapter } from "@/components/ui/select-adapter";
import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type { WebsiteFormsView } from "@workspace/db";
import {
  WEBSITE_FORM_FIELD_KEYS,
  type WebsiteFormDraft,
  type WebsiteFormField,
  type WebsiteFormFieldKey,
} from "@workspace/website-core/forms";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createWebsiteFormAction,
  updateWebsiteFormAction,
} from "@/app/actions/website-forms";
import { Button } from "@/components/ui/button";

type EditableForm = WebsiteFormDraft & {
  clientId: string;
  id: string | null;
  authoringRevision: number | null;
};

const FIELD_LABELS: Record<WebsiteFormFieldKey, string> = {
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  company: "Bedrijf",
  postalCode: "Postcode",
  subject: "Onderwerp",
  preferredDate: "Voorkeursdatum",
  message: "Bericht",
};

function newForm(defaultLocale: string, count: number): EditableForm {
  return {
    clientId: crypto.randomUUID(),
    id: null,
    authoringRevision: null,
    key: `formulier-${count + 1}`,
    locale: defaultLocale,
    kind: "contact",
    name: "Nieuw formulier",
    fields: [
      {
        key: "name",
        label: FIELD_LABELS.name,
        required: true,
        placeholder: null,
      },
      {
        key: "email",
        label: FIELD_LABELS.email,
        required: true,
        placeholder: null,
      },
      {
        key: "message",
        label: FIELD_LABELS.message,
        required: true,
        placeholder: null,
      },
    ],
    submitLabel: "Versturen",
    successMessage: "Bedankt. We nemen zo snel mogelijk contact met u op.",
    notificationEmail: null,
    status: "draft",
  };
}

export function WebsiteFormsEditor({
  view,
  canWrite,
}: {
  view: WebsiteFormsView;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [forms, setForms] = useState<EditableForm[]>(
    view.forms.map((form) => ({
      ...form,
      clientId: form.id,
    })),
  );
  const [siteRevision, setSiteRevision] = useState(view.authoringRevision);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateForm(clientId: string, patch: Partial<EditableForm>) {
    setForms((current) =>
      current.map((form) =>
        form.clientId === clientId ? { ...form, ...patch } : form,
      ),
    );
  }

  function updateField(
    clientId: string,
    key: WebsiteFormFieldKey,
    patch: Partial<WebsiteFormField>,
  ) {
    setForms((current) =>
      current.map((form) =>
        form.clientId === clientId
          ? {
              ...form,
              fields: form.fields.map((field) =>
                field.key === key ? { ...field, ...patch } : field,
              ),
            }
          : form,
      ),
    );
  }

  function toggleField(clientId: string, key: WebsiteFormFieldKey) {
    setForms((current) =>
      current.map((form) => {
        if (form.clientId !== clientId) return form;
        const exists = form.fields.some((field) => field.key === key);
        return {
          ...form,
          fields: exists
            ? form.fields.filter((field) => field.key !== key)
            : [
                ...form.fields,
                {
                  key,
                  label: FIELD_LABELS[key],
                  required: false,
                  placeholder: null,
                },
              ],
        };
      }),
    );
  }

  function addForm() {
    setForms((current) => [
      ...current,
      newForm(view.defaultLocale, current.length),
    ]);
  }

  function save(form: EditableForm) {
    setMessage(null);
    setError(null);
    setPendingId(form.clientId);
    startTransition(async () => {
      const draft: WebsiteFormDraft = {
        key: form.key.trim().toLowerCase(),
        locale: form.locale,
        kind: form.kind,
        name: form.name.trim(),
        fields: WEBSITE_FORM_FIELD_KEYS.flatMap((key) => {
          const field = form.fields.find((entry) => entry.key === key);
          return field ? [field] : [];
        }),
        submitLabel: form.submitLabel.trim(),
        successMessage: form.successMessage.trim(),
        notificationEmail: form.notificationEmail?.trim().toLowerCase() || null,
        status: form.status,
      };
      const result =
        form.id && form.authoringRevision
          ? await updateWebsiteFormAction({
              siteId: view.siteId,
              expectedAuthoringRevision: siteRevision,
              formId: form.id,
              expectedFormRevision: form.authoringRevision,
              form: draft,
            })
          : await createWebsiteFormAction({
              siteId: view.siteId,
              expectedAuthoringRevision: siteRevision,
              form: draft,
            });
      setPendingId(null);
      if (!result.success || !result.data) {
        setError(
          result.success
            ? "Het formulier kon niet worden opgeslagen."
            : result.message,
        );
        return;
      }
      const saved = result.data;
      if ("id" in saved && typeof saved.id === "string") {
        const createdId = saved.id;
        setForms((current) =>
          current.map((entry) =>
            entry.clientId === form.clientId
              ? {
                  ...entry,
                  ...draft,
                  id: createdId,
                  clientId: createdId,
                  authoringRevision: saved.formAuthoringRevision,
                }
              : entry,
          ),
        );
      } else {
        setForms((current) =>
          current.map((entry) =>
            entry.clientId === form.clientId
              ? {
                  ...entry,
                  ...draft,
                  authoringRevision: saved.formAuthoringRevision,
                }
              : entry,
          ),
        );
      }
      setSiteRevision(saved.siteAuthoringRevision);
      setMessage(
        draft.status === "published"
          ? "Formulier opgeslagen. Publiceer de website opnieuw om managed pagina's bij te werken."
          : "Formulier opgeslagen.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="veele-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">
              Publieke formulieren
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Gepubliceerde formulieren worden immutable opgenomen in de
              volgende managed publicatie. Custom Next.js gebruikt dezelfde
              host-gebonden API met het formulier-ID.
            </p>
          </div>
          {canWrite ? (
            <Button type="button" variant="outline" onClick={addForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Formulier toevoegen
            </Button>
          ) : null}
        </div>
      </section>

      {forms.map((form) => {
        const disabled =
          !canWrite || (isPending && pendingId === form.clientId);
        return (
          <article key={form.clientId} className="veele-card space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Interne naam">
                <input
                  className="veele-input w-full"
                  value={form.name}
                  maxLength={160}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, { name: event.target.value })
                  }
                />
              </Field>
              <Field label="Code">
                <input
                  className="veele-input w-full font-mono"
                  value={form.key}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      key: event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/gu, "-"),
                    })
                  }
                />
              </Field>
              <Field label="Type">
                <SelectAdapter
                  className="veele-input w-full"
                  value={form.kind}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      kind: event.target.value as WebsiteFormDraft["kind"],
                    })
                  }
                >
                  <option value="contact">Contact</option>
                  <option value="quote">Offerteaanvraag</option>
                  <option value="callback">Terugbelverzoek</option>
                  <option value="emergency">Spoedaanvraag</option>
                </SelectAdapter>
              </Field>
              <Field label="Status">
                <SelectAdapter
                  className="veele-input w-full"
                  value={form.status}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      status: event.target.value as WebsiteFormDraft["status"],
                    })
                  }
                >
                  <option value="draft">Concept</option>
                  <option value="published">Gepubliceerd</option>
                  <option value="archived">Gearchiveerd</option>
                </SelectAdapter>
              </Field>
              <Field label="Taal">
                <input
                  className="veele-input w-full font-mono"
                  value={form.locale}
                  maxLength={20}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, { locale: event.target.value })
                  }
                />
              </Field>
              <Field label="Knoptekst">
                <input
                  className="veele-input w-full"
                  value={form.submitLabel}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      submitLabel: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Notificatie naar">
                <input
                  className="veele-input w-full"
                  value={form.notificationEmail ?? ""}
                  type="email"
                  maxLength={254}
                  disabled={disabled}
                  placeholder="planning@bedrijf.nl"
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      notificationEmail: event.target.value || null,
                    })
                  }
                />
              </Field>
              <Field
                label="Succesmelding"
                className="md:col-span-2 xl:col-span-1"
              >
                <textarea
                  className="veele-input min-h-24 w-full"
                  value={form.successMessage}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) =>
                    updateForm(form.clientId, {
                      successMessage: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <fieldset disabled={disabled}>
              <legend className="text-sm font-semibold text-slate-900">
                Velden
              </legend>
              <p className="mt-1 text-xs text-slate-500">
                Minimaal e-mail of telefoon is vereist. Alleen geselecteerde
                velden worden door de publieke API geaccepteerd.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {WEBSITE_FORM_FIELD_KEYS.map((key) => {
                  const field = form.fields.find((entry) => entry.key === key);
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <CheckboxAdapter
                          type="checkbox"
                          checked={Boolean(field)}
                          onChange={() => toggleField(form.clientId, key)}
                        />
                        {FIELD_LABELS[key]}
                      </label>
                      {field ? (
                        <div className="mt-3 space-y-2">
                          <input
                            className="veele-input w-full text-sm"
                            value={field.label}
                            maxLength={120}
                            aria-label={`Label voor ${FIELD_LABELS[key]}`}
                            onChange={(event) =>
                              updateField(form.clientId, key, {
                                label: event.target.value,
                              })
                            }
                          />
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <CheckboxAdapter
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) =>
                                updateField(form.clientId, key, {
                                  required: event.target.checked,
                                })
                              }
                            />
                            Verplicht
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {form.id
                  ? `Formulier-ID ${form.id} · revisie ${form.authoringRevision}`
                  : "Nog niet opgeslagen"}
              </p>
              {canWrite ? (
                <Button
                  type="button"
                  onClick={() => save(form)}
                  disabled={disabled}
                >
                  {isPending && pendingId === form.clientId
                    ? "Opslaan…"
                    : "Formulier opslaan"}
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}

      {message ? (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid content-start gap-1 text-xs font-semibold text-slate-600 ${className}`}
    >
      {label}
      {children}
    </label>
  );
}
