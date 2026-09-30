"use client";
import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { X } from "lucide-react";
import {
  assignmentInput,
  canPlan,
  executionStatuses,
  initialProposal,
  type PlanningOrder,
  type PlanningPerson,
  type Proposal,
} from "@/lib/planning/model";
import { localDateTime, localToInstant } from "@/lib/planning/time";

import {ObjectVisitSignals} from "../objects/visit-signals";
export function PlanningDetail({
  order,
  people,
  timezone,
  day,
  onClose,
  onSave,
  busy,
  theme,
  saveError,
  onRetry,
}: {
  order: PlanningOrder;
  people: PlanningPerson[];
  timezone: string;
  day: string;
  onClose: () => void;
  onSave: (proposal: Proposal) => void;
  busy: boolean;
  theme: CSSProperties;
  saveError?: string;
  onRetry?: () => void;
}) {
  const [start, setStart] = useState(
    order.start ? localDateTime(order.start, timezone) : `${day}T08:00`,
  );
  const [end, setEnd] = useState(
    order.end ? localDateTime(order.end, timezone) : "",
  );
  const [selected, setSelected] = useState(
    order.assignments.map((a) => a.personnelId),
  );
  const different = order.assignments.some(
    (a) => a.start !== order.start || a.end !== order.end,
  );
  const [scope, setScope] = useState(different ? "shift" : "joint");
  const [fold, setFold] = useState<"" | "earlier" | "later">("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [appointment, setAppointment] = useState({
    requestedDate: order.requestedDate,
    windowKind: order.windowKind,
    requiredPersonnel: order.requiredPersonnel,
    instructions: order.instructions,
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => {
    if (
      !busy &&
      (!dirty || window.confirm("Niet-opgeslagen wijzigingen sluiten?"))
    )
      onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const s = localToInstant(start, timezone, fold || undefined);
      const delta = order.start ? Date.parse(s) - Date.parse(order.start) : 0;
      const e =
        scope === "shift" && order.end
          ? new Date(Date.parse(order.end) + delta).toISOString()
          : localToInstant(end, timezone, fold || undefined);
      if (Date.parse(e) <= Date.parse(s))
        throw new Error("De eindtijd moet na de begintijd liggen.");
      const assignments = selected.map((personnelId) => {
        const old = order.assignments.find(
          (a) => a.personnelId === personnelId,
        );
        return old && scope === "shift"
          ? {
              personnelId,
              start: new Date(Date.parse(old.start) + delta).toISOString(),
              end: new Date(Date.parse(old.end) + delta).toISOString(),
            }
          : { personnelId, start: s, end: e };
      });
      onSave({
        ...initialProposal(order),
        start: s,
        end: e,
        assignments,
        appointment,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Controleer je invoer.",
      );
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        className="pb-detail"
        style={theme}
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (dirty || busy) {
            event.preventDefault();
            close();
          }
        }}
        onInteractOutside={(event) => {
          if (dirty || busy) {
            event.preventDefault();
            close();
          }
        }}
      >
        <SheetHeader>
          <span className="eyebrow">{order.number}</span>
          <SheetTitle>{order.object}</SheetTitle>
          <SheetDescription>
            {order.customer} · {executionStatuses[order.status]}
          </SheetDescription>
          <SheetClose asChild>
            <button
              className="pb-close"
              aria-label="Details sluiten"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                close();
              }}
            >
              <X size={19} />
            </button>
          </SheetClose>
        </SheetHeader>
        <div className="pb-detail-body">
          <nav
            className="pb-context-links"
            aria-label="Gerelateerde dossiers"
            onClick={(e) => {
              if (
                busy ||
                (dirty &&
                  !window.confirm("Niet-opgeslagen wijzigingen sluiten?"))
              )
                e.preventDefault();
            }}
          >
            <Link prefetch={false} href={`/app/werkbonnen/${order.id}`}>
              Werkbon
            </Link>
            <Link
              prefetch={false}
              href={`/app/klanten?record=${order.customerId}`}
            >
              Klant 360
            </Link>
            <Link
              prefetch={false}
              href={`/app/objecten/${order.objectId}`}
            >
              Object 360
            </Link>
          </nav>
          <ObjectVisitSignals orderId={order.id}/>
          <dl className="pb-facts">
            <div>
              <dt>Uitvoeringsduur</dt>
              <dd>
                {order.durationMinutes
                  ? `${order.durationMinutes} minuten`
                  : "Nog invullen"}
              </dd>
            </div>
            <div>
              <dt>Gewenste datum</dt>
              <dd>{order.requestedDate ?? "Niet vastgelegd"}</dd>
            </div>
            <div>
              <dt>Klantvenster</dt>
              <dd>
                {order.windowStart && order.windowEnd
                  ? `${localDateTime(order.windowStart, timezone).replace("T", " ")} – ${localDateTime(order.windowEnd, timezone).replace("T", " ")}`
                  : "Niet vastgelegd"}
              </dd>
            </div>
            <div>
              <dt>Venstertype</dt>
              <dd>
                {
                  {
                    arrival: "Aankomst",
                    execution: "Volledige uitvoering",
                    unknown: "Onbekend",
                  }[order.windowKind]
                }
              </dd>
            </div>
          </dl>
          {order.instructions && (
            <section className="pb-instructions">
              <h3>Instructies voor deze uitvoering</h3>
              <p>{order.instructions}</p>
              <small>Alleen deze bon; geen automatisch meerwerk.</small>
            </section>
          )}
          <section className="pb-travel">
            <h3>Reisinformatie</h3>
            {order.assignments.map((a) => (
              <p key={a.id}>
                {people.find((p) => p.id === a.personnelId)?.name ??
                  "Medewerker"}
                :{" "}
                {a.travel.length
                  ? a.travel
                      .map((t) =>
                        t.state === "known"
                          ? `${t.direction === "before" ? "Heen" : "Vervolg"}: ${t.minutes} min (bestaande berekening)`
                          : t.state === "stale"
                            ? "opnieuw berekenen na planningswijziging"
                            : t.state === "failed"
                              ? "berekening niet beschikbaar"
                              : "onbekend",
                      )
                      .join(" · ")
                  : "onbekend"}
              </p>
            ))}
            {!order.assignments.length && (
              <p>Reistijd onbekend. Er wordt geen vertrekbasis aangenomen.</p>
            )}
          </section>
          <form
            className="pb-edit"
            onSubmit={submit}
            onChange={() => setDirty(true)}
          >
            <h3>Tijd en medewerkers aanpassen</h3>
            {!canPlan(order) ? (
              <p className="pb-notice">
                Deze uitvoering is gestart, afgerond of teruggemeld en kan niet
                met een gewone planactie worden gewijzigd.
              </p>
            ) : (
              <>
                {different && (
                  <label>
                    Omvang wijziging
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="shift">
                        Individuele intervallen behouden en meeschuiven
                      </option>
                      <option value="joint">
                        Alle geselecteerde medewerkers hetzelfde interval geven
                      </option>
                    </select>
                  </label>
                )}
                <div className="pb-form-grid">
                  <label>
                    Gewenste datum
                    <input
                      type="date"
                      value={appointment.requestedDate ?? ""}
                      onChange={(e) =>
                        setAppointment((p) => ({
                          ...p,
                          requestedDate: e.target.value || null,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Benodigde medewerkers
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={appointment.requiredPersonnel}
                      onChange={(e) =>
                        setAppointment((p) => ({
                          ...p,
                          requiredPersonnel: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                {order.windowStart && (
                  <label>
                    Afgesproken venstertype
                    <select
                      value={appointment.windowKind}
                      onChange={(e) =>
                        setAppointment((p) => ({
                          ...p,
                          windowKind: e.target
                            .value as PlanningOrder["windowKind"],
                        }))
                      }
                    >
                      <option value="unknown">Nog niet bekend</option>
                      <option value="arrival">
                        Aankomst binnen het venster
                      </option>
                      <option value="execution">
                        Volledige uitvoering binnen het venster
                      </option>
                    </select>
                  </label>
                )}
                <label>
                  Instructies voor deze uitvoering
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={appointment.instructions}
                    onChange={(e) =>
                      setAppointment((p) => ({
                        ...p,
                        instructions: e.target.value,
                      }))
                    }
                  />
                  <small>
                    Alleen voor deze afspraak. Geen toegangscodes en geen
                    automatisch factureerbaar meerwerk.
                  </small>
                </label>
                <div className="pb-form-grid">
                  <label>
                    Begin
                    <input
                      type="datetime-local"
                      step="60"
                      required
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Einde
                    <input
                      type="datetime-local"
                      step="60"
                      required={scope !== "shift"}
                      disabled={scope === "shift"}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
                {scope === "shift" && (
                  <p className="pb-help">
                    De gezamenlijke duur en alle onderlinge tijdverschillen
                    blijven behouden.
                  </p>
                )}
                <details>
                  <summary>Tijdzone: {timezone}</summary>
                  <label>
                    Bij een dubbele wintertijd
                    <select
                      value={fold}
                      onChange={(e) => setFold(e.target.value as typeof fold)}
                    >
                      <option value="">Eerst waarschuwen</option>
                      <option value="earlier">Eerste keer (zomertijd)</option>
                      <option value="later">Tweede keer (wintertijd)</option>
                    </select>
                  </label>
                </details>
                <fieldset>
                  <legend>
                    Medewerkers · minimaal {appointment.requiredPersonnel}
                  </legend>
                  {people.map((person) => (
                    <label className="pb-person-option" key={person.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(person.id)}
                        disabled={
                          busy ||
                          (person.status !== "active" &&
                            !selected.includes(person.id))
                        }
                        onChange={(event) =>
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, person.id]
                              : ids.filter((id) => id !== person.id),
                          )
                        }
                      />
                      <span>
                        {person.name}
                        {person.status !== "active" && (
                          <small>Niet actief · alleen bestaande planning</small>
                        )}
                        {different &&
                          order.assignments.find(
                            (a) => a.personnelId === person.id,
                          ) && (
                            <small>
                              {order.assignments
                                .filter((a) => a.personnelId === person.id)
                                .map(
                                  (a) =>
                                    `${localDateTime(a.start, timezone).slice(11)}–${localDateTime(a.end, timezone).slice(11)}`,
                                )}
                            </small>
                          )}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="pb-help">
                  Geen roostergegevens betekent onbekende beschikbaarheid. De
                  server controleert bezetting en vereisten bij opslaan.
                </p>
                {error && (
                  <p role="alert" className="pb-error">
                    {error}
                  </p>
                )}
                {saveError && (
                  <div role="alert" className="pb-error">
                    <p>{saveError}</p>
                    {onRetry && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={onRetry}
                      >
                        Dezelfde wijziging opnieuw proberen
                      </button>
                    )}
                  </div>
                )}
                <div className="pb-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={close}
                    disabled={busy}
                  >
                    Annuleren
                  </button>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Opslaan…" : "Planning opslaan"}
                  </button>
                </div>
              </>
            )}
          </form>
          {canPlan(order) && order.assignments.length > 0 && (
            <section className="pb-remove">
              <h3>Uit planning halen</h3>
              <p>
                Alleen de gekozen toewijzing verdwijnt; de werkbon blijft
                bestaan.
              </p>
              {order.assignments.map((a) => (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  key={a.id}
                  onClick={() =>
                    onSave({
                      ...initialProposal(order),
                      assignments: order.assignments
                        .filter((x) => x.id !== a.id)
                        .map(assignmentInput),
                    })
                  }
                >
                  {people.find((p) => p.id === a.personnelId)?.name ??
                    "Medewerker"}{" "}
                  uit planning halen
                </button>
              ))}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
