"use client";
import { ContentSection } from "../content-section";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, FileText } from "lucide-react";
import { customerCommand } from "@/app/app/klanten/actions";
import type { TenantContext } from "@/lib/auth/context";
import type { Agreement } from "@/lib/dossiers/model";
import type { CustomerData } from "@/lib/customers/model";
import { CustomerDialog } from "./forms";
import { useFormChanges, confirmDiscard } from "../unsaved-form";
import { money, commercialDate } from "@/lib/commercial/model";

const bases: Record<string, string> = {
  visit: "Per bezoek",
  hour: "Per uur",
  week: "Per week",
  month: "Per maand",
  once: "Eenmalig",
};
export function CustomerAgreements({
  data,
  tenant,
}: {
  data: CustomerData;
  tenant: TenantContext;
}) {
  const [edit, setEdit] = useState<Agreement | "new" | null>(null);
  return (
    <ContentSection title={"Contracten & diensten"} description={"Vaste afspraken, scope en expliciet vastgelegde akkoorden. Een concept geeft geen toestemming voor betaald werk."} actions={<button className="primary-button" onClick={() => setEdit("new")}>
          <Plus size={16} />
          Nieuw contract
        </button>} bodyClassName="dossier-section-body ">

      {!data.agreements.length && (
        <p className="dossier-empty">Nog geen contracten vastgelegd.</p>
      )}
      {data.agreements.map((a) => (
        <article className="object-record" key={a.id}>
          <header>
            <div>
              <span className="eyebrow">
                {a.agreement_type === "addendum" ? "ADDENDUM" : "CONTRACT"} ·
                VERSIE {a.version}
              </span>
              <h3>{a.title}</h3>
            </div>
            <span className="resource-status">
              {a.state === "draft"
                ? "Concept"
                : a.state === "ended"
                  ? "Beëindigd"
                  : "Vastgelegd"}
              {data.agreements.some(
                (n) => n.previous_id === a.id && n.state === "active",
              )
                ? " · opgevolgd"
                : ""}
            </span>
          </header>
          <p>
            {commercialDate(a.starts_on, tenant.timezone)} –{" "}
            {a.ends_on
              ? commercialDate(a.ends_on, tenant.timezone)
              : "Doorlopend"}
          </p>
          {a.accepted_on && (
            <p>
              Akkoord: {a.accepted_by_name} ·{" "}
              {commercialDate(a.accepted_on, tenant.timezone)}
            </p>
          )}
          <p>
            Verantwoordelijke:{" "}
            {data.owners.find((o) => o.id === a.owner_user_id)?.label ||
              "Nog toewijzen"}
          </p>
          <div className="table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Object / afspraak</th>
                  <th>Omvang</th>
                  <th>Prijsbasis</th>
                  <th>Tarief excl. btw</th>
                  <th>Frequentie</th>
                </tr>
              </thead>
              <tbody>
                {a.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {data.objects.find((o) => o.id === l.object_id)?.name}
                      <small>{l.scope}</small>
                    </td>
                    <td>
                      {l.quantity} {l.unit}
                      {l.extra_work && (
                        <small>
                          Begrensd meerwerk · maximaal {money(l.limit_cents)}
                        </small>
                      )}
                    </td>
                    <td>{bases[l.price_basis]}</td>
                    <td>
                      {money(l.price_cents)}
                      <small>
                        {l.vat_basis_points === null
                          ? "Btw volgens oorspronkelijke taak"
                          : `${l.vat_basis_points / 100}% btw`}
                      </small>
                    </td>
                    <td>{l.frequency || "Niet ingevuld"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="customer-summary">
            <span>Herzien: {commercialDate(a.review_on, tenant.timezone)}</span>
            <span>
              Opzegdeadline: {commercialDate(a.notice_on, tenant.timezone)}
            </span>
            <span>
              Verlenging: {commercialDate(a.renewal_on, tenant.timezone)}
            </span>
          </div>
          <footer>
            {a.evidence_document_id && (
              <a
                className="resource-action"
                href={`/api/files/customer-document/${a.evidence_document_id}`}
              >
                <FileText size={14} />
                Akkoordbewijs
              </a>
            )}
            {!data.agreements.some((n) => n.previous_id === a.id) && (
              <button className="resource-action" onClick={() => setEdit(a)}>
                <Pencil size={14} />
                {a.state === "draft"
                  ? "Concept bewerken"
                  : "Nieuwe versie / addendum"}
              </button>
            )}
          </footer>
        </article>
      ))}
      {edit && (
        <AgreementWizard
          data={data}
          tenant={tenant}
          previous={edit === "new" ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
    </ContentSection>
  );
}

function cents(value: FormDataEntryValue | null) {
  const text = String(value ?? "0");
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Gebruik bedragen met maximaal twee decimalen.");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 10000000000)
    throw new Error("Bedrag is te groot.");
  return result;
}
export function AgreementWizard({
  data,
  tenant,
  previous,
  onClose,
}: {
  data: CustomerData;
  tenant: TenantContext;
  previous?: Agreement;
  onClose: () => void;
}) {
  const draft = previous?.state === "draft";
  const [id] = useState(() => (draft ? previous.id : crypto.randomUUID())),
    [requestId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(1),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const [review, setReview] = useState<Record<string, string>>({});
  const [lineIds, setLineIds] = useState(
    () => previous?.lines.map((l) => l.id) || [crypto.randomUUID()],
  );
  const { ref, changed, saved } = useFormChanges();
  const router = useRouter();
  const d = (previous?.details ?? {}) as Record<string, string>;
  const next = () => {
    const fields = ref.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(
      "fieldset:not([hidden]) input,fieldset:not([hidden]) select,fieldset:not([hidden]) textarea",
    );
    if (fields && ![...fields].every((f) => f.reportValidity())) return;
    if (ref.current)
      setReview(
        Object.fromEntries(
          [...new FormData(ref.current)].map(([k, v]) => [k, String(v)]),
        ),
      );
    setStep((s) => s + 1);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const active =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "active";
    setError("");
    start(async () => {
      try {
        const lines = lineIds.map((key, i) => ({
          objectId: form.get(`object-${i}`),
          taskRevisionId: form.get(`task-${i}`),
          scope: form.get(`scope-${i}`),
          quantity: form.get(`qty-${i}`),
          priceCents: cents(form.get(`price-${i}`)),
          limitCents: cents(form.get(`limit-${i}`)),
          vatBasisPoints: cents(form.get(`vat-${i}`)),
          unit: form.get(`unit-${i}`),
          priceBasis: form.get(`basis-${i}`),
          frequency: form.get(`frequency-${i}`),
          window: form.get(`window-${i}`),
          durationMinutes: form.get(`duration-${i}`),
          extraWork: form.get(`extra-${i}`) === "on",
        }));
        const r = await customerCommand(
          "agreement_save",
          {
            ...Object.fromEntries(form),
            id,
            customerId: data.customer.id,
            version: draft ? previous.edit_version : 0,
            previousId: draft ? previous.previous_id || "" : previous?.id || "",
            state: active ? "active" : "draft",
            lines,
          },
          requestId,
        );
        if (!r.ok) {
          setError(r.error);
          return;
        }
        saved();
        toast.success(
          active ? "Contractafspraak vastgelegd" : "Contractconcept opgeslagen",
        );
        onClose();
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Opslaan niet bevestigd. Probeer opnieuw.",
        );
      }
    });
  };
  return (
    <CustomerDialog
      tenant={tenant}
      title={
        previous
          ? draft
            ? "Contractconcept bewerken"
            : "Nieuwe contractversie"
          : "Nieuw contract"
      }
      description="Van scope naar aantoonbaar akkoord, met behoud van eerdere afspraken."
      onClose={onClose}
      busy={pending}
    >
      <ol className="dossier-steps customer-steps">
        {[
          "Relatie",
          "Diensten",
          "Uitvoering",
          "Prijzen",
          "Documenten",
          "Controle",
        ].map((s, i) => (
          <li
            className={i < step ? "active" : ""}
            aria-current={step === i + 1 ? "step" : undefined}
            key={s}
          >
            <b>{i + 1}</b>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <form
        ref={ref}
        onChange={changed}
        className="dossier-form"
        noValidate
        onSubmit={submit}
      >
        <fieldset hidden={step !== 1} className="dossier-form-fields">
          <legend>Relatie en overeenkomst</legend>
          <p className="dossier-notice wide">
            {data.customer.name} · {data.customer.customer_number}
          </p>
          <label>
            Titel
            <input
              name="title"
              required
              minLength={2}
              maxLength={180}
              defaultValue={previous?.title}
            />
          </label>
          <label>
            Soort overeenkomst
            <select
              name="type"
              defaultValue={previous?.agreement_type || "service"}
            >
              <option value="service">Dienstenovereenkomst</option>
              <option value="framework">Raamafspraak</option>
              <option value="addendum">Addendum / wijziging</option>
            </select>
          </label>
          <label>
            Verantwoordelijke
            <select
              name="ownerId"
              defaultValue={
                previous?.owner_user_id || data.customer.owner_user_id || ""
              }
            >
              <option value="">Nog toewijzen</option>
              {data.owners
                .filter((o) => o.commercial)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Ingangsdatum
            <input
              name="startsOn"
              type="date"
              defaultValue={draft ? previous.starts_on || "" : ""}
            />
          </label>
          <label>
            Einddatum (leeg = doorlopend)
            <input
              name="endsOn"
              type="date"
              defaultValue={previous?.ends_on || ""}
            />
          </label>
          {previous && (
            <label>
              Reden nieuwe vastlegging
              <textarea
                name="changeReason"
                defaultValue={draft ? d.changeReason : ""}
              />
            </label>
          )}
        </fieldset>
        <fieldset hidden={step !== 2} className="dossier-form-fields">
          <legend>Diensten, omvang en kwaliteit</legend>
          {[
            ["scope", "Inbegrepen werkzaamheden"],
            ["exclusions", "Niet inbegrepen"],
            ["quality", "Kwaliteitsafspraken / rapportage"],
          ].map(([k, v]) => (
            <label className="wide" key={k}>
              {v}
              <textarea name={k} maxLength={4000} defaultValue={d[k]} />
            </label>
          ))}
          <p className="dossier-muted wide">
            Kies bij Prijzen de objecten en catalogustaken waarop de afspraak
            van toepassing is.
          </p>
        </fieldset>
        <fieldset hidden={step !== 3} className="dossier-form-fields">
          <legend>Bezoekfrequentie en uitvoering</legend>
          <label>
            Algemene bezoekfrequentie
            <input name="frequency" defaultValue={d.frequency} />
          </label>
          <label>
            Uitvoeringsvensters
            <input name="window" defaultValue={d.window} />
          </label>
          <label>
            Materialen / middelen
            <textarea name="materials" defaultValue={d.materials} />
          </label>
          <label>
            Toeslagen
            <textarea name="surcharges" defaultValue={d.surcharges} />
          </label>
          <p className="dossier-notice wide">
            Frequentie is geen prijsbasis. De planner koppelt een geldige
            contractregel aan het werkprogramma en bevestigt concrete bezoeken
            in het bestaande planbord.
          </p>
        </fieldset>
        <fieldset hidden={step !== 4} className="dossier-form-fields">
          <legend>Prijsafspraken per object en taak</legend>
          {lineIds.map((key, i) => {
            const l = previous?.lines.find((l) => l.id === key);
            return (
              <div className="wide customer-contract-line" key={key}>
                <h3>Contractregel {i + 1}</h3>
                <div className="dossier-form-fields">
                  <label>
                    Object
                    <select
                      aria-label="Object"
                      name={`object-${i}`}
                      required
                      defaultValue={l?.object_id || ""}
                    >
                      <option value="">Kies een object</option>
                      {data.objects.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Catalogustaak
                    <select
                      aria-label="Catalogustaak"
                      name={`task-${i}`}
                      required
                      defaultValue={l?.task_revision_id || ""}
                      onChange={(e) => {
                        const r = data.revisions.find(
                            (r) => r.id === e.target.value,
                          ),
                          form = e.currentTarget.form;
                        if (!r || !form) return;
                        for (const [name, value] of [
                          [`price-${i}`, r.price_cents / 100],
                          [`vat-${i}`, r.vat_basis_points / 100],
                          [`duration-${i}`, r.duration_minutes],
                          [`unit-${i}`, r.unit],
                        ] as const) {
                          const field = form.elements.namedItem(
                            name,
                          ) as HTMLInputElement | null;
                          if (field) field.value = String(value);
                        }
                      }}
                    >
                      <option value="">Kies een taakversie</option>
                      {data.revisions
                        .filter(
                          (r) => !r.valid_until || r.id === l?.task_revision_id,
                        )
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {data.tasks.find((t) => t.id === r.task_id)?.name ||
                              "Taak"}{" "}
                            · v{r.revision}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="wide">
                    Afgesproken omvang
                    <textarea
                      name={`scope-${i}`}
                      required
                      minLength={2}
                      defaultValue={l?.scope}
                    />
                  </label>
                  <label>
                    Maximale hoeveelheid
                    <input
                      name={`qty-${i}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      defaultValue={l?.quantity || 1}
                    />
                  </label>
                  <label>
                    Eenheid
                    <input
                      name={`unit-${i}`}
                      required
                      defaultValue={l?.unit || "uitvoering"}
                    />
                  </label>
                  <label>
                    Prijs per eenheid excl. btw
                    <input
                      name={`price-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      defaultValue={(l?.price_cents || 0) / 100}
                    />
                  </label>
                  <label>
                    Btw %
                    <input
                      name={`vat-${i}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      required
                      defaultValue={
                        l?.vat_basis_points == null
                          ? ""
                          : l.vat_basis_points / 100
                      }
                    />
                  </label>
                  <label>
                    Prijsbasis
                    <select
                      name={`basis-${i}`}
                      defaultValue={l?.price_basis || "visit"}
                    >
                      {Object.entries(bases).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximumbedrag excl. btw
                    <input
                      name={`limit-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      defaultValue={(l?.limit_cents || 0) / 100}
                    />
                  </label>
                  <label>
                    Bezoekfrequentie
                    <input
                      name={`frequency-${i}`}
                      defaultValue={l?.frequency}
                    />
                  </label>
                  <label>
                    Tijdvenster
                    <input name={`window-${i}`} defaultValue={l?.time_window} />
                  </label>
                  <label>
                    Geschatte duur (minuten)
                    <input
                      name={`duration-${i}`}
                      type="number"
                      min={0}
                      defaultValue={l?.duration_minutes || ""}
                    />
                  </label>
                  <label className="dossier-check">
                    <input
                      name={`extra-${i}`}
                      type="checkbox"
                      defaultChecked={l?.extra_work}
                    />
                    Vooraf toegestaan meerwerk (begrensd per bezoek)
                  </label>
                </div>
                {lineIds.length > 1 && (
                  <button
                    className="resource-action danger"
                    type="button"
                    onClick={() =>
                      setLineIds((ids) => ids.filter((k) => k !== key))
                    }
                  >
                    Regel verwijderen
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="secondary-button wide"
            onClick={() => setLineIds((ids) => [...ids, crypto.randomUUID()])}
          >
            Contractregel toevoegen
          </button>
          <label>
            Facturatiefrequentie
            <input name="billingFrequency" defaultValue={d.billingFrequency} />
          </label>
          <label>
            Betalingsafspraken
            <input name="paymentTerms" defaultValue={d.paymentTerms} />
          </label>
          <label>
            Referentie / PO
            <input name="reference" defaultValue={d.reference} />
          </label>
          <label>
            Kostenplaats
            <input name="costCenter" defaultValue={d.costCenter} />
          </label>
          <label>
            Indexatie-afspraak
            <input name="indexation" defaultValue={d.indexation} />
          </label>
          <p className="dossier-notice wide">
            Alleen reguliere bezoekregels zijn direct aan een werkprogramma te
            koppelen. Periodeprijzen worden niet automatisch per bezoek
            gefactureerd. Vooraf toegestaan meerwerk verwerk je bij het concrete
            verzoek in Object 360: de hoeveelheid, looptijd en gezamenlijke
            bedraglimiet blijven verplicht.
          </p>
        </fieldset>
        <fieldset hidden={step !== 5} className="dossier-form-fields">
          <legend>Documenten, bewijs en deadlines</legend>
          <label>
            Akkoordbewijs
            <select
              aria-label="Akkoordbewijs"
              name="documentId"
              defaultValue={draft ? previous.evidence_document_id || "" : ""}
            >
              <option value="">Kies een klantdocument</option>
              {data.documents
                .filter((d) => !d.archived)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} · v{d.version}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Akkoordgever
            <input
              name="acceptedBy"
              defaultValue={draft ? previous.accepted_by_name || "" : ""}
            />
          </label>
          <label>
            Ontvangen akkoord op
            <input
              name="acceptedOn"
              type="date"
              defaultValue={draft ? previous.accepted_on || "" : ""}
            />
          </label>
          <label>
            Herzien op
            <input
              name="reviewOn"
              type="date"
              defaultValue={previous?.review_on || ""}
            />
          </label>
          <label>
            Opzegdeadline
            <input
              name="noticeOn"
              type="date"
              defaultValue={previous?.notice_on || ""}
            />
          </label>
          <label>
            Verlengdatum
            <input
              name="renewalOn"
              type="date"
              defaultValue={previous?.renewal_on || ""}
            />
          </label>
          <label>
            Opzegtermijn
            <input name="noticePeriod" defaultValue={d.noticePeriod} />
          </label>
          <p className="dossier-notice wide">
            Upload het daadwerkelijke bewijs eerst bij Documenten. Een nieuwe
            versie bewaart het eerdere akkoord en wijzigt geen historische
            werkbonnen.
          </p>
        </fieldset>
        <fieldset hidden={step !== 6} className="dossier-form-fields">
          <legend>Controleer de overeenkomst</legend>
          <dl className="customer-summary wide">
            <dt>Overeenkomst</dt>
            <dd>
              {review.title} · {data.customer.name}
            </dd>
            <dt>Looptijd</dt>
            <dd>
              {commercialDate(review.startsOn, tenant.timezone)} –{" "}
              {review.endsOn
                ? commercialDate(review.endsOn, tenant.timezone)
                : "Doorlopend"}
            </dd>
            <dt>Omvang</dt>
            <dd>{review.scope || "Zie contractregels"}</dd>
            <dt>Uitsluitingen</dt>
            <dd>{review.exclusions || "Niet ingevuld"}</dd>
            <dt>Uitvoering</dt>
            <dd>
              {review.frequency || "Nog af te spreken"} ·{" "}
              {review.window || "Geen vast tijdvenster"}
            </dd>
            <dt>Akkoordgever</dt>
            <dd>
              {review.acceptedBy || "Ontbreekt"} ·{" "}
              {commercialDate(review.acceptedOn, tenant.timezone)}
            </dd>
            <dt>Bewijs</dt>
            <dd>
              {data.documents.find((d) => d.id === review.documentId)?.title ||
                "Nog geen bewijs gekozen"}
            </dd>
          </dl>
          {lineIds.map((id, i) => (
            <article key={id} className="customer-contract-line wide">
              <strong>
                {data.objects.find((o) => o.id === review[`object-${i}`])
                  ?.name || "Kies een object"}
              </strong>
              <p>{review[`scope-${i}`]}</p>
              <p>
                {review[`qty-${i}`]} {review[`unit-${i}`]} · €{" "}
                {review[`price-${i}`]} excl. btw · {bases[review[`basis-${i}`]]}{" "}
                · {review[`vat-${i}`]}% btw
              </p>
              <p>
                Limiet: € {review[`limit-${i}`]} excl. btw{" "}
                {review[`extra-${i}`] === "on"
                  ? "· vooraf toegestaan meerwerk"
                  : ""}
              </p>
            </article>
          ))}
          <p className="dossier-notice wide">
            Een concept geeft geen uitvoeringsakkoord. Vastleggen vereist
            compleet bewijs en verandert geen bestaande werkbonnen.
          </p>
        </fieldset>
        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
        <footer className="wizard-footer">
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() =>
              step === 1 ? confirmDiscard() && onClose() : setStep((s) => s - 1)
            }
          >
            {step === 1 ? "Annuleren" : "Vorige"}
          </button>
          {step < 6 ? (
            <button
              key="next"
              type="button"
              className="primary-button"
              onClick={next}
            >
              Volgende
            </button>
          ) : (
            <div className="object-actions">
              <button
                key="draft"
                type="submit"
                className="secondary-button"
                value="draft"
                disabled={pending}
              >
                Concept bewaren
              </button>
              <button
                key="active"
                type="submit"
                className="primary-button"
                value="active"
                disabled={pending}
              >
                Akkoord vastleggen
              </button>
            </div>
          )}
        </footer>
      </form>
    </CustomerDialog>
  );
}
