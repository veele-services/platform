"use client";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AddressInput } from "./address-input";
import { LocationMap } from "./location-map";
import {
  addressStatus,
  location,
  normalizeAddress,
  type Point,
} from "@/lib/addresses/model";
import { vehicles, type Mobility, type Vehicle } from "@/lib/travel/model";
import {
  loadMobility,
  saveMobility,
  loadTravelSettings,
  saveTravelSettings,
  saveDepot,
  saveArrival,
  loadTravelDaySettings,
  saveTravelDaySettings,
} from "@/app/app/travel-actions";
import type { Database } from "@/lib/database.types";
import { useFormChanges } from "./unsaved-form";

type Depot = Database["public"]["Tables"]["travel_depots"]["Row"];
export function VehicleSelect({
  name = "standardVehicle",
  value = "",
  inherit = false,
}: {
  name?: string;
  value?: string;
  inherit?: boolean;
}) {
  return (
    <label>
      Vervoermiddel
      <select name={name} defaultValue={value}>
        <option value="">
          {inherit
            ? "Standaard van medewerker"
            : "Nog kiezen — reistijd onbekend"}
        </option>
        {Object.entries(vehicles).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <small>
        Bestelauto: standaard autoroute, zonder hoogte-, gewicht- of bijzondere
        toegangscontrole. Scooter, brommer, motor en OV: kies Overig.
      </small>
    </label>
  );
}
export function MobilityFields({
  initial,
  depots = [],
}: {
  initial?: Mobility;
  depots?: Array<{ id: string; name: string; active: boolean }>;
}) {
  const [kind, setKind] = useState(initial?.departure_kind || "");
  return (
    <div className="travel-settings wide">
      <VehicleSelect value={initial?.standard_vehicle || ""} />
      <label>
        Vertrekpunt voor de eerste werkbon
        <select
          name="departureKind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Nog kiezen</option>
          <option value="home">Woonadres</option>
          <option value="depot">Bedrijfslocatie / depot</option>
          <option value="custom">Afwijkende vertrekplek</option>
        </select>
      </label>
      <label>
        Bedrijfslocatie
        <select
          name="departureDepotId"
          defaultValue={initial?.departure_depot_id || ""}
          disabled={kind !== "depot"}
        >
          <option value="">Kies bedrijfslocatie</option>
          {depots
            .filter((d) => d.active)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
        </select>
        {kind === "depot" && !depots.some((d) => d.active) && (
          <small>Voeg eerst een bedrijfslocatie toe bij Instellingen.</small>
        )}
      </label>
      <details open={kind === "home"}>
        <summary>Woonadres (afgeschermd)</summary>
        <AddressInput name="homeAddress" initial={initial?.home_address} />
      </details>
      <details open={kind === "custom"}>
        <summary>Afwijkende vertrekplek (afgeschermd)</summary>
        <AddressInput
          name="departureAddress"
          initial={initial?.alternate_departure_address}
        />
      </details>
      <label className="check">
        <input
          name="returnToDeparture"
          type="checkbox"
          defaultChecked={initial?.return_to_departure}
        />
        Ook terugrit naar deze vertrekplek tonen
      </label>
      <p className="travel-notice">
        Het woonadres is niet nodig bij vertrek vanaf een depot. Zonder
        bevestigd vertrekpunt of vervoermiddel blijft de reistijd onbekend. Een
        dagafwijking op het planbord gaat voor.
      </p>
    </div>
  );
}
export function WizardMobility() {
  const [depots, setDepots] = useState<
    Array<{ id: string; name: string; active: boolean }>
  >([]);
  useEffect(() => {
    let alive = true;
    void loadTravelSettings().then((r) => {
      if (alive && r.ok) setDepots(r.depots);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <MobilityFields depots={depots} />;
}
export function MobilityPanel({ personnelId }: { personnelId: string }) {
  const [data, setData] = useState<Awaited<
      ReturnType<typeof loadMobility>
    > | null>(null),
    [generation, setGeneration] = useState(0),
    [pending, start] = useTransition();
  const router = useRouter();
  const { ref, changed, saved } = useFormChanges();
  useEffect(() => {
    let alive = true;
    void loadMobility(personnelId).then((r) => {
      if (alive) setData(r);
    });
    return () => {
      alive = false;
    };
  }, [personnelId, generation]);
  if (!data)
    return (
      <section className="dossier-card">
        <p role="status">Adres- en reisinstellingen laden…</p>
      </section>
    );
  if (!data.ok)
    return (
      <section className="dossier-card">
        <p role="alert">{data.error}</p>
        <button onClick={() => setGeneration((n) => n + 1)}>
          Opnieuw laden
        </button>
      </section>
    );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveMobility(f);
      if (!r.ok) toast.error(r.error);
      else {
        saved();
        toast.success("Adres- en reisinstellingen opgeslagen");
        setGeneration((n) => n + 1);
        router.refresh();
      }
    });
  };
  return (
    <section className="dossier-card">
      <h2>Woonadres, vertrekpunt & vervoer</h2>
      <p className="travel-notice">
        Eén adresregistratie voor dit dossier en de reisplanning. Alleen
        bevoegde beheerders en de medewerker zelf kunnen privévertrekgegevens
        inzien.
      </p>
      <form
        key={data.record.version}
        ref={ref}
        onChange={changed}
        onSubmit={submit}
        className="travel-form"
      >
        <input type="hidden" name="personnelId" value={personnelId} />
        <input type="hidden" name="version" value={data.record.version} />
        <MobilityFields initial={data.record} depots={data.depots} />
        <button className="primary-button" disabled={pending}>
          {pending ? "Opslaan…" : "Reisinstellingen opslaan"}
        </button>
      </form>
    </section>
  );
}
function DepotForm({ depot, onSaved }: { depot?: Depot; onSaved: () => void }) {
  const [id] = useState(() => depot?.id || crypto.randomUUID()),
    [pending, start] = useTransition();
  return (
    <form
      className="travel-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveDepot(f);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Bedrijfslocatie opgeslagen");
            onSaved();
          }
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={depot?.version || 0} />
      <label>
        Naam bedrijfslocatie
        <input name="name" required defaultValue={depot?.name} />
      </label>
      <AddressInput initial={depot?.address} required />
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={depot?.active ?? true}
        />
        Actief vertrekpunt
      </label>
      <button className="primary-button" disabled={pending}>
        Bedrijfslocatie opslaan
      </button>
    </form>
  );
}
export function TravelSettings() {
  const [data, setData] = useState<Awaited<
      ReturnType<typeof loadTravelSettings>
    > | null>(null),
    [generation, setGeneration] = useState(0),
    [edit, setEdit] = useState<Depot | "new" | null>(null),
    [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    void loadTravelSettings().then((r) => {
      if (alive) setData(r);
    });
    return () => {
      alive = false;
    };
  }, [generation]);
  if (!data)
    return (
      <section className="panel">
        <p>Reisinstellingen laden…</p>
      </section>
    );
  if (!data.ok)
    return (
      <section className="panel">
        <p role="alert">{data.error}</p>
        <button onClick={() => setGeneration((n) => n + 1)}>
          Opnieuw proberen
        </button>
      </section>
    );
  const margins = data.settings.travel_vehicle_margins as Partial<
    Record<Vehicle, number>
  >;
  const attention = data.objects.filter(
    (o) => !o.arrival_location && !location(normalizeAddress(o.address)),
  );
  return (
    <section className="panel travel-settings">
      <h2>Vertrekpunten & reismarges</h2>
      <p className="travel-notice">
        Alleen basisreistijden. Voorrang marge: object → vervoermiddel →
        tenantstandaard. Reistijd wordt naar boven afgerond; de aankomstmarge
        wordt ook bij korte ritten apart toegevoegd.
      </p>
      <form
        className="travel-form"
        key={data.settings.updated_at}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveTravelSettings(f);
            if (!r.ok) toast.error(r.error);
            else {
              toast.success("Reismarges opgeslagen");
              setGeneration((n) => n + 1);
            }
          });
        }}
      >
        <input
          type="hidden"
          name="updatedAt"
          value={data.settings.updated_at}
        />
        <label>
          Standaard aankomstmarge (minuten)
          <input
            name="margin"
            type="number"
            min={0}
            max={180}
            defaultValue={data.settings.travel_margin_minutes}
            required
          />
        </label>
        <div className="address-fields">
          {Object.entries(vehicles).map(([k, v]) => (
            <label key={k}>
              {v}: afwijkende marge
              <input
                name={`margin-${k}`}
                type="number"
                min={0}
                max={180}
                defaultValue={margins[k as Vehicle] ?? ""}
                placeholder="Tenantstandaard"
              />
            </label>
          ))}
        </div>
        <button className="primary-button" disabled={pending}>
          Reismarges opslaan
        </button>
      </form>
      <h3>Bedrijfslocaties en depots</h3>
      {data.depots.map((d) => (
        <article className="travel-card" key={d.id}>
          <header>
            <strong>{d.name}</strong>
            <button className="resource-action" onClick={() => setEdit(d)}>
              Bewerk
            </button>
          </header>
          <p>{normalizeAddress(d.address).formatted}</p>
          <small>
            {d.active
              ? addressStatus[normalizeAddress(d.address).status]
              : "Inactief"}
          </small>
        </article>
      ))}
      <button className="secondary-button" onClick={() => setEdit("new")}>
        Bedrijfslocatie toevoegen
      </button>
      {edit && (
        <DepotForm
          key={typeof edit === "string" ? "new" : edit.id}
          depot={typeof edit === "string" ? undefined : edit}
          onSaved={() => {
            setEdit(null);
            setGeneration((n) => n + 1);
          }}
        />
      )}
      <h3>Locaties die aandacht vragen ({attention.length})</h3>
      <p className="travel-notice">
        Bestaande adressen blijven behouden. Open een object, zoek het adres en
        bevestig zelf het juiste resultaat; Fieldgrid kiest geen onzekere match.
      </p>
      {attention.map((o) => (
        <Link className="text-link" key={o.id} href={`/app/objecten/${o.id}`}>
          {o.name} · {addressStatus[normalizeAddress(o.address).status]}
        </Link>
      ))}
      {!attention.length && (
        <p>Alle actieve objecten hebben een bruikbare routebestemming.</p>
      )}
      <h3>Medewerkers: vertrek of vervoer aanvullen</h3>
      {data.people
        .filter((p) => !p.standard_vehicle || !p.departure_kind)
        .map((p) => (
          <Link
            className="text-link"
            key={p.id}
            href={`/app/personeel/${p.id}?tab=persoon`}
          >
            {p.full_name} ·{" "}
            {!p.standard_vehicle
              ? "vervoermiddel ontbreekt"
              : "vertrekkeuze ontbreekt"}
          </Link>
        ))}
    </section>
  );
}
export function ArrivalSettings({
  object,
}: {
  object: Database["public"]["Tables"]["objects"]["Row"];
}) {
  const a = normalizeAddress(object.address),
    base = location(a),
    existing = object.arrival_location as Point | null;
  const [useAddress, setUseAddress] = useState(!existing),
    [latitude, setLatitude] = useState(String((existing || base)?.[1] ?? "")),
    [longitude, setLongitude] = useState(String((existing || base)?.[0] ?? "")),
    [version, setVersion] = useState(object.version),
    [map, setMap] = useState(false),
    [pending, start] = useTransition();
  const router = useRouter();
  const { ref, changed, saved } = useFormChanges();
  const point: Point | null =
    latitude !== "" && longitude !== ""
      ? [Number(longitude), Number(latitude)]
      : null;
  const setPoint = (p: Point) => {
    setLongitude(String(p[0]));
    setLatitude(String(p[1]));
    changed();
  };
  return (
    <section className="dossier-card travel-settings">
      <h2>Adres & aankomstlocatie</h2>
      <p>{a.formatted || "Adres ontbreekt"}</p>
      <p className={!base ? "travel-warning" : "travel-notice"}>
        {addressStatus[a.status]}
      </p>
      <p className="travel-notice">
        Het officiële werkadres blijft gescheiden van de ingang of parkeerplek.
        Pas het adres aan via Object bewerken. Een klantfactuuradres wordt nooit
        als bestemming gebruikt.
      </p>
      <form
        className="travel-form"
        ref={ref}
        onChange={changed}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const r = await saveArrival(f);
            if (!r.ok) toast.error(r.error);
            else {
              setVersion(r.version);
              saved();
              toast.success("Aankomstlocatie opgeslagen");
              router.refresh();
            }
          });
        }}
      >
        <input type="hidden" name="objectId" value={object.id} />
        <input type="hidden" name="version" value={version} />
        <label className="check">
          <input
            type="checkbox"
            name="useAddress"
            checked={useAddress}
            onChange={(e) => setUseAddress(e.target.checked)}
          />
          Gebruik adreslocatie
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setUseAddress(true);
            if (base) setPoint(base);
          }}
        >
          Gebruik adreslocatie
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setMap((n) => !n)}
        >
          {map ? "Kaart sluiten" : "Locatie controleren op kaart"}
        </button>
        {map && (
          <LocationMap
            point={(useAddress && base ? base : point) || [5.1, 52.1]}
            onMove={(p) => {
              setPoint(p);
              setUseAddress(false);
            }}
          />
        )}
        <div className="address-fields">
          <label>
            Breedtegraad aankomst
            <input
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={latitude}
              required={!useAddress}
              onChange={(e) => {
                setLatitude(e.target.value);
                setUseAddress(false);
              }}
            />
          </label>
          <label>
            Lengtegraad aankomst
            <input
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={longitude}
              required={!useAddress}
              onChange={(e) => {
                setLongitude(e.target.value);
                setUseAddress(false);
              }}
            />
          </label>
        </div>
        <label>
          Aankomstinstructie
          <input
            name="instruction"
            defaultValue={object.arrival_instruction}
            maxLength={1000}
            placeholder="Parkeren achter het gebouw, ingang via de zijstraat"
          />
        </label>
        <label>
          Aankomstmarge voor dit object (minuten)
          <input
            type="number"
            name="margin"
            min={0}
            max={180}
            defaultValue={object.travel_margin_minutes ?? ""}
            placeholder="Vervoermiddel / tenantstandaard"
          />
        </label>
        <button className="primary-button" disabled={pending}>
          Aankomstinstellingen opslaan
        </button>
      </form>
    </section>
  );
}
export function DayMobilityForm({
  personnelId,
  day,
  onSaved,
}: {
  personnelId: string;
  day: string;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Awaited<
      ReturnType<typeof loadTravelDaySettings>
    > | null>(null),
    [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    void loadTravelDaySettings(personnelId, day).then((r) => {
      if (alive) setData(r);
    });
    return () => {
      alive = false;
    };
  }, [personnelId, day]);
  if (!data) return <p>Daginstellingen laden…</p>;
  if (!data.ok) return <p role="alert">{data.error}</p>;
  return (
    <form
      className="travel-form"
      onSubmit={(e) => {
        e.preventDefault();
        const native = e.nativeEvent as SubmitEvent;
        const f = new FormData(e.currentTarget, native.submitter);
        start(async () => {
          const r = await saveTravelDaySettings(f);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success("Daginstellingen opgeslagen");
            onSaved();
          }
        });
      }}
    >
      <h3>
        {data.person.full_name} · {day}
      </h3>
      <input type="hidden" name="personnelId" value={personnelId} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="version" value={data.override?.version || 0} />
      <VehicleSelect
        name="vehicle"
        value={data.override?.standard_vehicle || ""}
        inherit
      />
      <p className="travel-notice">
        Standaard:{" "}
        {data.person.standard_vehicle
          ? vehicles[data.person.standard_vehicle as Vehicle]
          : "nog niet gekozen"}
        . Deze wijziging geldt alleen voor deze werkdag.
      </p>
      <label>
        Vertrekpunt
        <select
          name="departure"
          defaultValue={data.override?.departure_kind || ""}
        >
          <option value="">Standaard van medewerker</option>
          <option value="home">Woonadres</option>
          <option value="depot">Bedrijfslocatie / depot</option>
          <option value="custom">Bevestigde afwijkende vertrekplek</option>
        </select>
      </label>
      <label>
        Bedrijfslocatie
        <select
          name="depot"
          defaultValue={data.override?.departure_depot_id || ""}
        >
          <option value="">Standaard van medewerker</option>
          {data.depots
            .filter((d) => d.active)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </label>
      {data.privateAccess && (
        <details>
          <summary>Eigen vertrekadres voor deze werkdag</summary>
          <p className="travel-notice">
            Alleen gebruikt bij vertrekkeuze ‘Bevestigde afwijkende
            vertrekplek’. Privégegevens blijven afgeschermd.
          </p>
          <label className="check">
            <input
              name="useDefaultDepartureAddress"
              type="checkbox"
              defaultChecked={!data.departureAddress}
            />
            Gebruik de standaard afwijkende vertrekplek
          </label>
          <AddressInput
            name="dayDepartureAddress"
            initial={data.departureAddress}
          />
        </details>
      )}
      <label>
        Terugrit
        <select
          name="returnTrip"
          defaultValue={
            data.override?.return_to_departure === null || !data.override
              ? ""
              : data.override.return_to_departure
                ? "yes"
                : "no"
          }
        >
          <option value="">Standaard van medewerker</option>
          <option value="yes">Wel berekenen</option>
          <option value="no">Niet berekenen</option>
        </select>
      </label>
      <button className="primary-button" disabled={pending}>
        Daginstellingen opslaan
      </button>
      <button
        name="reset"
        value="yes"
        className="secondary-button"
        disabled={pending}
      >
        {data.privateAccess ? "Dagafwijkingen wissen" : "Reisinstellingen herstellen"}
      </button>
      {!data.privateAccess && (
        <p className="travel-notice">
          Herstellen gebruikt het standaardvervoer en vertrekpunt van de
          medewerker. Een eventueel privévertrekadres blijft bewaard voor beheer.
        </p>
      )}
    </form>
  );
}
