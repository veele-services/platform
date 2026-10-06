"use client";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Bike, Car, Footprints, HelpCircle, Truck, Route } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LocationMap } from "./location-map";
import { DayMobilityForm } from "./travel-settings";
import {
  travelStates,
  vehicles,
  type TravelLeg,
  type Vehicle,
} from "@/lib/travel/model";
import type { Point } from "@/lib/addresses/model";

type DayData = {
  day: string;
  requestKey?: string;
  revision: number;
  timezone: string;
  canManage: boolean;
  legs: TravelLeg[];
  people: Array<{
    id: string;
    name: string;
    vehicle: Vehicle | null;
    overridden: boolean;
  }>;
};
async function request(body: unknown, signal?: AbortSignal) {
  const r = await fetch("/api/routes/estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Reistijd onbekend. Probeer opnieuw.");
  return d;
}
export function useTravelDay(day: string, personId?: string, planKey = "") {
  const [data, setData] = useState<DayData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);
  useEffect(() => {
    let alive = true,
      working = false;
    const abort = new AbortController();
    const load = async () => {
      if (working) return;
      working = true;
      setLoading(true);
      try {
        const d = await request({ action: "day", day, personId }, abort.signal);
        if (alive) {
          setData({
            ...d,
            requestKey: JSON.stringify([day, personId, planKey, generation]),
          });
          setError("");
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Reistijd onbekend");
          setData(null);
        }
      } finally {
        working = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [day, personId, planKey, generation]);
  return {
    data:
      data?.requestKey === JSON.stringify([day, personId, planKey, generation])
        ? data
        : null,
    error,
    loading,
    refresh,
  };
}
export function VehicleIcon({ vehicle }: { vehicle: Vehicle | null }) {
  const Icon =
    vehicle === "car"
      ? Car
      : vehicle === "van"
        ? Truck
        : vehicle === "walking"
          ? Footprints
          : vehicle === "bicycle" || vehicle === "electric_bicycle"
            ? Bike
            : HelpCircle;
  return <Icon size={13} aria-hidden="true" />;
}
export function TravelBadge({ leg }: { leg?: TravelLeg }) {
  return (
    <span
      className="travel-status"
      title={leg ? travelStates[leg.state] : "Reistijd onbekend"}
    >
      <VehicleIcon vehicle={leg?.vehicle || null} />
      {leg?.shortageMinutes
        ? `${leg.shortageMinutes} min tekort`
        : leg?.totalMinutes !== null && leg?.totalMinutes !== undefined
          ? `${leg.totalMinutes} min reizen${leg.state === "manual" ? " · handmatig" : ""}`
          : "Reistijd onbekend"}
    </span>
  );
}
const time = (value: string | null, tz: string) =>
  value
    ? new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
      }).format(new Date(value))
    : "—";
export function TravelLegCard({
  leg,
  timezone,
  canManage,
  onChange,
  initialMode,
}: {
  leg: TravelLeg;
  timezone: string;
  canManage: boolean;
  onChange: () => void;
  initialMode?: string;
}) {
  const [manual, setManual] = useState(initialMode === "manual"),
    [map, setMap] = useState<{
      origin: Point;
      geometry: { type: "LineString"; coordinates: number[][] };
      refreshing: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(initialMode === "route");
  useEffect(() => {
    if (initialMode !== "route") return;
    let alive = true;
    const controller = new AbortController();
    void request(
      {
        action: "geometry",
        day: leg.day,
        assignmentId: leg.assignmentId,
        direction: leg.direction,
      },
      controller.signal,
    )
      .then((data) => {
        if (alive) setMap(data);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Route niet beschikbaar");
      })
      .finally(() => {
        if (alive) setPending(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [initialMode, leg.day, leg.assignmentId, leg.direction]);
  async function showRoute() {
    setPending(true);
    setError("");
    try {
      const data = await request({
        action: "geometry",
        day: leg.day,
        assignmentId: leg.assignmentId,
        direction: leg.direction,
      });
      setMap(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Route niet beschikbaar");
    } finally {
      setPending(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(
      e.currentTarget,
      (e.nativeEvent as SubmitEvent).submitter,
    );
    setPending(true);
    setError("");
    try {
      await request({
        action: "manual",
        day: leg.day,
        assignmentId: leg.assignmentId,
        direction: leg.direction,
        expectedSignature: leg.signature,
        minutes: f.get("automatic") === "yes" ? null : Number(f.get("minutes")),
        metres: f.get("distance") ? Number(f.get("distance")) * 1000 : null,
        reason: String(f.get("reason") || ""),
      });
      setManual(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Niet opgeslagen");
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="travel-card">
      <header>
        <strong>
          <Route size={15} />{" "}
          {leg.direction === "after" ? "Terugrit" : "Reis naar werkbon"}
        </strong>
        <TravelBadge leg={leg} />
      </header>
      <p>
        {leg.originLabel} → {leg.destinationLabel}
      </p>
      <p className="travel-notice">
        {leg.vehicle ? vehicles[leg.vehicle] : "Vervoermiddel ontbreekt"}
        {leg.overridden ? " · dagafwijking actief" : ""} ·{" "}
        {travelStates[leg.state]}
        {leg.locked ? " · historische planning" : ""}
      </p>
      {leg.seconds === null && (
        <p className="travel-warning">Reistijd onbekend</p>
      )}
      {Boolean(leg.shortageMinutes) && (
        <p className="travel-warning" role="status">
          {leg.shortageMinutes} minuten te weinig tijd om de volgende afspraak
          te bereiken.
        </p>
      )}
      <dl className="travel-facts">
        <div>
          <dt>Basisreistijd</dt>
          <dd>
            {leg.minutes === null
              ? "Onbekend"
              : `${leg.minutes} min (${Math.round(leg.seconds!)} seconden)`}
          </dd>
        </div>
        <div>
          <dt>Aankomstmarge</dt>
          <dd>{leg.marginMinutes} min</dd>
        </div>
        <div>
          <dt>Totaal benodigd</dt>
          <dd>
            {leg.totalMinutes === null ? "Onbekend" : `${leg.totalMinutes} min`}
          </dd>
        </div>
        <div>
          <dt>Afstand</dt>
          <dd>
            {leg.metres === null
              ? "Onbekend"
              : `${(leg.metres / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`}
          </dd>
        </div>
        {leg.direction === "before" && (
          <div>
            <dt>
              {leg.previousEnd
                ? "Vroegst haalbare start"
                : "Geadviseerd vertrek"}
            </dt>
            <dd>
              {time(
                leg.previousEnd ? leg.earliestStart : leg.departureAt,
                timezone,
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>Berekend / bevestigd</dt>
          <dd>
            {leg.calculatedAt
              ? new Intl.DateTimeFormat("nl-NL", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: timezone,
                }).format(new Date(leg.calculatedAt))
              : "Nog niet berekend"}
          </dd>
        </div>
      </dl>
      {leg.instruction && (
        <p>
          <strong>Aankomst:</strong> {leg.instruction}
        </p>
      )}
      {leg.refreshing && (
        <p role="status">
          Ouder resultaat voor hetzelfde traject en profiel. Gegevens worden
          bijgewerkt.
        </p>
      )}
      {leg.reason && <p>{leg.reason}</p>}
      <div className="travel-actions">
        {(!leg.privateRoute || leg.privateAllowed) && (
          <button
            className="secondary-button"
            disabled={pending || leg.locked}
            onClick={() => void showRoute()}
          >
            Bekijk route
          </button>
        )}
        {leg.privateRoute && !leg.privateAllowed && (
          <small>Kaart privévertrekpunt afgeschermd</small>
        )}
        {canManage && !leg.locked && (
          <button
            className="secondary-button"
            onClick={() => setManual((v) => !v)}
          >
            Handmatige reistijd
          </button>
        )}
      </div>
      {map && <LocationMap point={map.origin} geometry={map.geometry} />}
      <p className="travel-notice">
        Basisreistijd, zonder live verkeer. Dit zijn geen geregistreerde of
        factureerbare reisuren.
      </p>
      {manual && (
        <form className="travel-form" onSubmit={save}>
          <label>
            Handmatige basisreistijd (minuten)
            <input
              type="number"
              name="minutes"
              min={0}
              max={2880}
              required
              defaultValue={leg.minutes ?? ""}
            />
          </label>
          <label>
            Afstand (km, optioneel)
            <input
              name="distance"
              type="number"
              min={0}
              max={10000}
              step="0.001"
              defaultValue={leg.metres === null ? "" : leg.metres / 1000}
            />
          </label>
          <label>
            Reden
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              defaultValue={leg.state === "manual" ? leg.reason || "" : ""}
            />
          </label>
          <button className="primary-button" disabled={pending}>
            Handmatige reistijd opslaan
          </button>
          <button
            className="secondary-button"
            name="automatic"
            value="yes"
            formNoValidate
            disabled={pending}
          >
            Terug naar automatische berekening
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function TravelList({
  legs,
  timezone,
  canManage,
  onChange,
  initialMode,
  people,
}: {
  legs: TravelLeg[];
  timezone: string;
  canManage: boolean;
  onChange: () => void;
  initialMode?: string;
  /** Show one employee's legs at a time when names are supplied. */
  people?: ReadonlyArray<{id: string; name: string}>;
}) {
  const [selectedPerson, setSelectedPerson] = useState("");
  const personnelIds = [...new Set(legs.map(leg => leg.personnelId))];
  const activePerson = personnelIds.includes(selectedPerson) ? selectedPerson : personnelIds[0];
  const visibleLegs = people ? legs.filter(leg => leg.personnelId === activePerson) : legs;
  return (
    <div className="travel-list">
      {people && personnelIds.length > 1 && <label className="travel-person-select">
        Medewerker
        <select aria-label="Medewerker" value={activePerson} onChange={event => setSelectedPerson(event.target.value)}>
          {personnelIds.map((id, index) => <option key={id} value={id}>{people.find(person => person.id === id)?.name || `Medewerker ${index + 1}`}</option>)}
        </select>
      </label>}
      {visibleLegs.map((l) => (
        <TravelLegCard
          key={`${l.assignmentId}:${l.direction}:${l.signature}:${l.calculatedAt}`}
          leg={l}
          timezone={timezone}
          canManage={canManage}
          onChange={onChange}
          initialMode={initialMode}
        />
      ))}
      {!legs.length && (
        <p>
          Reistijd onbekend. Koppel een medewerker en geplande begin- en
          eindtijd.
        </p>
      )}
    </div>
  );
}
export function TravelOrderPanel({
  day,
  orderId,
  personnelId,
}: {
  day: string;
  orderId?: string;
  personnelId?: string;
}) {
  const travel = useTravelDay(day, personnelId);
  return (
    <section className="travel-list">
      <h3>Reisplanning</h3>
      {travel.loading && !travel.data && (
        <p role="status">Reistijd berekenen…</p>
      )}
      {travel.error && (
        <p role="alert">
          Reistijd onbekend. {travel.error}{" "}
          <button onClick={travel.refresh}>Opnieuw proberen</button>
        </p>
      )}
      {travel.data && (
        <TravelList
          legs={travel.data.legs.filter(
            (l) => !orderId || l.workOrderId === orderId,
          )}
          timezone={travel.data.timezone}
          canManage={travel.data.canManage}
          onChange={travel.refresh}
        />
      )}
    </section>
  );
}
export function TravelDialog({
  travel,
  assignmentId,
  personnelId,
  day,
  mode,
  onClose,
  theme,
  onSaved,
}: {
  travel: ReturnType<typeof useTravelDay>;
  assignmentId?: string;
  personnelId?: string;
  day: string;
  mode?: string;
  onClose: () => void;
  theme: CSSProperties;
  onSaved: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="travel-dialog" style={theme}>
        <DialogTitle>
          {personnelId
            ? "Vervoer en vertrek voor deze dag"
            : "Reistijd & route"}
        </DialogTitle>
        <DialogDescription>
          Basisreistijden en aankomstmarges; de overige werkbonnen worden niet
          automatisch verschoven.
        </DialogDescription>
        {personnelId ? (
          <DayMobilityForm
            personnelId={personnelId}
            day={day}
            onSaved={() => {
              onSaved();
              onClose();
            }}
          />
        ) : (
          <>
            <p role="status">
              {travel.loading && !travel.data
                ? "Reistijd berekenen…"
                : travel.error}
            </p>
            {travel.data && (
              <TravelList
                legs={travel.data.legs.filter(
                  (l) => l.assignmentId === assignmentId,
                )}
                timezone={travel.data.timezone}
                canManage={travel.data.canManage}
                onChange={travel.refresh}
                initialMode={mode}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
