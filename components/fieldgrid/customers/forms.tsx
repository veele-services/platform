"use client";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import type { TenantContext } from "@/lib/auth/context";
import type { Row } from "@/lib/objects/model";
import {
  customerTypes,
  customerStates,
  contactLabels,
  type CustomerData,
  type Owner,
  type CustomerList,
} from "@/lib/customers/model";
import {
  saveCustomerProfile,
  saveCustomerContact,
  readCustomers,
  customerCommand,
} from "@/app/app/klanten/actions";
import { AddressInput } from "../address-input";
import { useFormChanges, confirmDiscard } from "../unsaved-form";
import { ObjectForm } from "../objects/forms";

export function CustomerDialog({
  title,
  description,
  tenant,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  description: string;
  tenant: TenantContext;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const close = () => {
    if (!busy && confirmDiscard()) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="commercial-dialog customer-dialog"
        showCloseButton={false}
        style={brandThemeStyle(tenant.primaryColor, tenant.accentColor)}
      >
        <header>
          <div>
            <span className="eyebrow">KLANTDOSSIER</span>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            aria-label="Sluiten"
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function CustomerWizard({
  tenant,
  owners,
  defaultPaymentTermsDays,
  customer,
  onClose,
  onSaved,
}: {
  tenant: TenantContext;
  owners: Owner[];
  defaultPaymentTermsDays: number;
  customer?: Row<"customers">;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [id] = useState(() => customer?.id || crypto.randomUUID()),
    [requestId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(1),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [type, setType] = useState(customer?.customer_type || "business"),
    [name, setName] = useState(customer?.name || ""),
    [same, setSame] = useState(!customer),
    [duplicates, setDuplicates] = useState<CustomerList["rows"]>([]),
    [review, setReview] = useState<Record<string, string>>({});
  const { ref, changed, saved } = useFormChanges();
  const prefs = (customer?.billing_preferences ?? {}) as Record<
    string,
    string | boolean
  >;
  useEffect(() => {
    if (customer || name.trim().length < 3) return;
    let live = true;
    const timer = setTimeout(() => {
      void readCustomers({ q: name }).then((r) => {
        if (live && r.ok) setDuplicates(r.data.rows);
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, customer]);
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
    if (pending) return;
    const form = new FormData(e.currentTarget);
    const draft =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "draft";
    if (draft) form.set("status", "draft");
    setError("");
    start(async () => {
      try {
        const r = await saveCustomerProfile(form);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        saved();
        toast.success(draft ? "Klantconcept opgeslagen" : "Klant opgeslagen");
        if (onSaved) onSaved(r.id);
        else router.push(`/app/klanten/${r.id}`);
        onClose();
        router.refresh();
      } catch {
        setError(
          "Opslaan is niet bevestigd. Probeer opnieuw; dezelfde poging maakt geen dubbele klant.",
        );
      }
    });
  };
  return (
    <CustomerDialog
      title={customer ? "Klant bewerken" : "Nieuwe klant"}
      description="Leg de relatie vast. Objecten en afspraken voeg je daarna toe."
      tenant={tenant}
      onClose={onClose}
      busy={pending}
    >
      <ol className="dossier-steps customer-steps">
        {["Identiteit", "Adressen", "Contacten", "Relatie", "Controle"].map(
          (s, i) => (
            <li
              key={s}
              className={step >= i + 1 ? "active" : ""}
              aria-current={step === i + 1 ? "step" : undefined}
            >
              <b>{i + 1}</b>
              <span>{s}</span>
            </li>
          ),
        )}
      </ol>
      <form
        ref={ref}
        onChange={changed}
        className="dossier-form"
        noValidate
        onSubmit={submit}
      >
        <input name="id" type="hidden" value={id} />
        <input name="version" type="hidden" value={customer?.version ?? 0} />
        <input name="requestId" type="hidden" value={requestId} />
        <fieldset hidden={step !== 1} className="dossier-form-fields">
          <legend>Wie is de klant?</legend>
          <label>
            Type klant
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(customerTypes).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Klantnaam
            <input
              name="name"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={customer?.email} />
          </label>
          <label>
            Telefoon
            <input
              name="phone"
              maxLength={50}
              defaultValue={customer?.phone ?? ""}
            />
          </label>
          <label>
            Website
            <input
              name="website"
              maxLength={500}
              defaultValue={customer?.website}
            />
          </label>
          <div className="wide dossier-form-fields" hidden={type === "private"}>
            {[
              ["legalName", "Juridische naam", customer?.legal_name],
              ["tradeName", "Handelsnaam", customer?.trade_name],
              [
                "companyNumber",
                "KvK-nummer (optioneel)",
                customer?.company_number,
              ],
              ["vatNumber", "Btw-nummer (optioneel)", customer?.vat_number],
            ].map(([k, label, value]) => (
              <label key={k}>
                {label}
                <input name={k} defaultValue={value} />
              </label>
            ))}
          </div>
          {!customer && duplicates.length > 0 && name.length >= 3 && (
            <div className="dossier-notice wide">
              <strong>Mogelijk bestaat deze relatie al</strong>
              <p>
                Controleer de bestaande relaties. Er wordt niets automatisch
                samengevoegd.
              </p>
              {duplicates.slice(0, 5).map((c) => (
                <Link
                  className="resource-action"
                  key={c.id}
                  href={`/app/klanten/${c.id}`}
                >
                  {c.name} · {c.customer_number}
                </Link>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset hidden={step !== 2} className="dossier-form-fields">
          <legend>Adressen en facturatie</legend>
          <h3 className="wide">Bezoekadres (optioneel)</h3>
          <AddressInput name="visitAddress" initial={customer?.visit_address} />
          <label className="dossier-check wide">
            <input
              name="sameAddress"
              type="checkbox"
              checked={same}
              onChange={(e) => setSame(e.target.checked)}
            />
            Factuuradres is gelijk aan het bezoekadres
          </label>
          <div className="wide" hidden={same}>
            <h3>Factuuradres</h3>
            <AddressInput
              name="billingAddress"
              initial={customer?.billing_address}
            />
          </div>
          <label>
            Factuurmail
            <input
              name="billingEmail"
              type="email"
              defaultValue={customer?.billing_email ?? ""}
            />
          </label>
          <label>
            Betaaltermijn (dagen)
            <input
              name="paymentTerms"
              type="number"
              min={0}
              max={365}
              defaultValue={
                customer?.payment_terms_days ?? defaultPaymentTermsDays
              }
            />
          </label>
          <label>
            Facturatiekanaal
            <select
              name="invoiceChannel"
              defaultValue={String(prefs.channel || "email")}
            >
              <option value="email">E-mail</option>
              <option value="portal">Klantportaal</option>
              <option value="post">Post (handmatige verzending)</option>
            </select>
          </label>
          <label>
            Facturatiecontact / afdeling
            <input
              name="invoiceContact"
              defaultValue={String(prefs.contact || "")}
            />
          </label>
          <label>
            Referentie / inkoopnummer
            <input
              name="reference"
              defaultValue={String(prefs.reference || "")}
            />
          </label>
          <label>
            Kostenplaats
            <input
              name="costCenter"
              defaultValue={String(prefs.costCenter || "")}
            />
          </label>
          <label className="dossier-check wide">
            <input
              name="referenceRequired"
              type="checkbox"
              defaultChecked={prefs.referenceRequired === true}
            />
            Referentie verplicht bij facturatie
          </label>
        </fieldset>
        <fieldset hidden={step !== 3} className="dossier-form-fields">
          <legend>
            {customer ? "Contactpersonen behouden" : "Eerste contactpersoon"}
          </legend>
          {customer ? (
            <p className="dossier-notice wide">
              Bestaande contactpersonen blijven behouden. Beheer functies,
              bereikbaarheid en objectkoppelingen op het tabblad
              Contactpersonen.
            </p>
          ) : (
            <>
              <label>
                Naam contactpersoon
                <input name="contactName" minLength={2} />
              </label>
              <label>
                Functie
                <input name="contactRole" />
              </label>
              <label>
                E-mail contactpersoon
                <input name="contactEmail" type="email" />
              </label>
              <label>
                Telefoon contactpersoon
                <input name="contactPhone" />
              </label>
              <div className="wide customer-checks">
                {Object.entries(contactLabels).map(([k, v]) => (
                  <label className="dossier-check" key={k}>
                    <input
                      name="contactLabels"
                      type="checkbox"
                      value={k}
                      defaultChecked={k === "operational"}
                    />
                    {v}
                  </label>
                ))}
              </div>
              <p className="dossier-muted wide">
                Meer contactpersonen en objectspecifieke afspraken voeg je na
                opslaan toe. Deze labels geven geen toegang of algemeen
                betaalakkoord.
              </p>
            </>
          )}
          {customer && <input name="contactEmail" type="hidden" value="" />}
        </fieldset>
        <fieldset hidden={step !== 4} className="dossier-form-fields">
          <legend>Relatie en voorkeuren</legend>
          <label>
            Relatiestatus
            <select name="status" defaultValue={customer?.status || "lead"}>
              {Object.entries(customerStates).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Accountverantwoordelijke
            <select name="ownerId" defaultValue={customer?.owner_user_id || ""}>
              <option value="">Nog toewijzen</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Relatie sinds
            <input
              name="since"
              type="date"
              defaultValue={customer?.relationship_since || ""}
            />
          </label>
          <label>
            Diensten (komma-gescheiden)
            <input
              name="services"
              defaultValue={customer?.services.join(", ")}
            />
          </label>
          <label className="wide">
            Zakelijke voorkeuren
            <textarea
              name="preferences"
              maxLength={4000}
              defaultValue={customer?.preferences}
            />
          </label>
          <label className="dossier-check wide">
            <input
              name="remindersEnabled"
              type="checkbox"
              defaultChecked={customer?.reminders_enabled}
            />
            Dagelijkse in-appherinnering aan de accountverantwoordelijke bij
            verlopen deadlines
          </label>
          <p className="dossier-muted wide">
            Relatiestatus staat los van contracten, portaaltoegang, objectstatus
            en betaling.
          </p>
        </fieldset>
        <fieldset hidden={step !== 5} className="dossier-form-fields">
          <legend>Controleer de klantgegevens</legend>
          <dl className="customer-summary wide">
            <dt>Klant</dt>
            <dd>{review.name}</dd>
            <dt>Type</dt>
            <dd>{customerTypes[review.type]}</dd>
            <dt>Relatiestatus</dt>
            <dd>{customerStates[review.status]}</dd>
            <dt>Contact</dt>
            <dd>{review.contactName || review.email || "Later aanvullen"}</dd>
            <dt>Facturatie</dt>
            <dd>
              {review.billingEmail || "Nog geen factuurmail"} ·{" "}
              {review.paymentTerms || defaultPaymentTermsDays} dagen
            </dd>
            <dt>Verantwoordelijke</dt>
            <dd>
              {owners.find((o) => o.id === review.ownerId)?.label ||
                "Nog toewijzen"}
            </dd>
            <dt>Diensten</dt>
            <dd>{review.services || "Later aanvullen"}</dd>
          </dl>
          <p className="dossier-notice wide">
            Opslaan maakt alleen een klantrelatie aan. Er wordt geen opdracht,
            overeenkomst of portaalaccount aangemaakt.
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
            onClick={() => {
              if (step > 1) setStep((s) => s - 1);
              else if (confirmDiscard()) onClose();
            }}
          >
            <ChevronLeft size={16} />
            {step === 1 ? "Annuleren" : "Vorige"}
          </button>
          {step < 5 ? (
            <button
              key="next"
              type="button"
              className="primary-button"
              onClick={next}
            >
              Volgende
              <ChevronRight size={16} />
            </button>
          ) : (
            <div className="object-actions">
              {!customer && (
                <button
                  key="draft"
                  type="submit"
                  value="draft"
                  className="secondary-button"
                  disabled={pending}
                >
                  Concept bewaren
                </button>
              )}
              <button key="save" className="primary-button" disabled={pending}>
                {pending
                  ? "Opslaan…"
                  : customer
                    ? "Wijzigingen opslaan"
                    : "Klant aanmaken"}
              </button>
            </div>
          )}
        </footer>
      </form>
    </CustomerDialog>
  );
}

export function ContactEditor({
  data,
  contact,
  tenant,
  onClose,
}: {
  data: CustomerData;
  contact?: Row<"customer_contacts">;
  tenant: TenantContext;
  onClose: () => void;
}) {
  const [id] = useState(() => contact?.id || crypto.randomUUID()),
    [request] = useState(() => crypto.randomUUID());
  return (
    <CustomerDialog
      title={contact ? "Contactpersoon bewerken" : "Contactpersoon toevoegen"}
      description="Zakelijke contactgegevens en bereikbaarheid. Een functioneel label is geen toegangsrecht."
      tenant={tenant}
      onClose={onClose}
    >
      <ObjectForm
        action={saveCustomerContact}
        onSuccess={onClose}
        label="Contact opslaan"
      >
        <input name="id" type="hidden" value={id} />
        <input name="requestId" type="hidden" value={request} />
        <input name="version" type="hidden" value={contact?.version ?? 0} />
        <input name="customerId" type="hidden" value={data.customer.id} />
        <label>
          Naam
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={180}
            defaultValue={contact?.full_name}
          />
        </label>
        <label>
          Functie
          <input
            name="role"
            maxLength={180}
            defaultValue={contact?.role ?? ""}
          />
        </label>
        <label>
          Organisatie
          <input
            name="organization"
            maxLength={180}
            defaultValue={contact?.organization}
          />
        </label>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </label>
        <label>
          Telefoon
          <input
            name="phone"
            maxLength={50}
            defaultValue={contact?.phone ?? ""}
          />
        </label>
        <label>
          Bereikbaarheid
          <input
            name="availability"
            maxLength={1000}
            defaultValue={contact?.availability}
          />
        </label>
        <label>
          Actief vanaf
          <input
            name="activeFrom"
            type="date"
            defaultValue={contact?.active_from || ""}
          />
        </label>
        <label>
          Actief tot
          <input
            name="activeUntil"
            type="date"
            defaultValue={contact?.active_until || ""}
          />
        </label>
        <div className="wide customer-checks">
          {Object.entries(contactLabels).map(([k, v]) => (
            <label className="dossier-check" key={k}>
              <input
                name="labels"
                type="checkbox"
                value={k}
                defaultChecked={contact?.labels.includes(k)}
              />
              {v}
            </label>
          ))}
        </div>
        <label className="dossier-check">
          <input
            name="primary"
            type="checkbox"
            defaultChecked={contact?.is_primary}
          />
          Primair contact
        </label>
        <label className="dossier-check">
          <input
            name="active"
            type="checkbox"
            defaultChecked={contact?.active ?? true}
          />
          Actief contact
        </label>
        <fieldset className="wide customer-checks">
          <legend>Bereikbaar voor deze objecten</legend>
          {data.objects.map((o) => (
            <label className="dossier-check" key={o.id}>
              <input
                name="objectIds"
                type="checkbox"
                value={o.id}
                defaultChecked={contact?.object_ids.includes(o.id)}
              />
              {o.name}
            </label>
          ))}
          {!data.objects.length && <p>Er zijn nog geen objecten.</p>}
        </fieldset>
      </ObjectForm>
    </CustomerDialog>
  );
}

export function CommunicationForm({
  data,
  onSaved,
}: {
  data: CustomerData;
  onSaved: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [requestId] = useState(() => crypto.randomUUID());
  return (
    <ObjectForm
      action={async (form) =>
        customerCommand(
          "note_save",
          { ...Object.fromEntries(form), id, customerId: data.customer.id },
          requestId,
        )
      }
      onSuccess={onSaved}
      label="Registratie opslaan"
    >
      <label>
        Soort
        <select name="kind">
          <option value="note">Interne notitie</option>
          <option value="call">Telefoongesprek</option>
          <option value="message">Ontvangen / gevoerd bericht</option>
          <option value="meeting">Contactafspraak</option>
          <option value="action">Opvolgactie</option>
        </select>
      </label>
      <label>
        Onderwerp
        <input name="title" maxLength={180} />
      </label>
      <label className="wide">
        Zakelijke toelichting
        <textarea name="body" required maxLength={10000} rows={4} />
      </label>
      <label>
        Verantwoordelijke
        <select name="ownerId" defaultValue={data.customer.owner_user_id || ""}>
          <option value="">Nog toewijzen</option>
          {data.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Opvolgen vóór
        <input name="dueOn" type="date" />
      </label>
      <label>
        Object
        <select name="objectId">
          <option value="">Gehele klantrelatie</option>
          {data.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Concrete afspraak
        <select name="orderId">
          <option value="">Niet gekoppeld</option>
          {data.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.work_order_number}
            </option>
          ))}
        </select>
      </label>
      <p className="dossier-notice wide">
        Dit is een interne registratie. Er wordt geen e-mail verzonden en niets
        automatisch in het klantportaal gepubliceerd.
      </p>
    </ObjectForm>
  );
}
