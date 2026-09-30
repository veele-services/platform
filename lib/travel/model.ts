import { location, normalizeAddress, type Point } from "../addresses/model";

export const vehicles = {
  car: "Auto",
  van: "Bestelauto",
  bicycle: "Fiets",
  ebike: "E-bike",
  walking: "Lopend",
  other: "Overig / handmatige reistijd",
} as const;
export type Vehicle = keyof typeof vehicles;
export const profiles: Record<Vehicle, string | null> = {
  car: "driving-car",
  van: "driving-car",
  bicycle: "cycling-regular",
  ebike: "cycling-electric",
  walking: "foot-walking",
  other: null,
};
export type TravelState =
  | "known"
  | "manual"
  | "pending"
  | "address_missing"
  | "location_unconfirmed"
  | "vehicle_missing"
  | "unsupported"
  | "no_route"
  | "provider_unavailable"
  | "not_configured"
  | "rate_limit"
  | "manual_review"
  | "historical_unknown";
export const travelStates: Record<TravelState, string> = {
  historical_unknown: "Geen reistijd vastgelegd voor deze historische planning",
  known: "Basisreistijd berekend",
  manual: "Handmatige reistijd actief",
  pending: "Berekening loopt nog",
  address_missing: "Adres ontbreekt",
  location_unconfirmed: "Locatie nog niet bevestigd",
  vehicle_missing: "Kies een vervoermiddel",
  unsupported: "Dit vervoermiddel vraagt handmatige reistijd",
  no_route: "Geen route beschikbaar",
  provider_unavailable: "Routedienst tijdelijk niet bereikbaar",
  not_configured: "Routedienst nog niet ingesteld",
  rate_limit: "Gebruikslimiet bereikt; probeer later opnieuw",
  manual_review: "Controleer de handmatige reistijd na de wijziging",
};
export type Mobility = {
  standard_vehicle: Vehicle | null;
  departure_kind: "home" | "depot" | "custom" | null;
  departure_depot_id: string | null;
  home_address: unknown;
  alternate_departure_address: unknown;
  return_to_departure: boolean;
};
export type TravelPerson = Mobility & {
  id: string;
  name: string;
  privateAllowed: boolean;
  override: Partial<Mobility> | null;
};
export type TravelAssignment = {
  id: string;
  workOrderId: string;
  personnelId: string;
  start: string;
  end: string;
  status: string;
  orderStatus: string;
  objectId: string;
  objectName: string;
  address: unknown;
  arrival: Point | null;
  instruction: string;
  margin: number | null;
  version: number;
};
export type TravelContext = {
  revision: number;
  timezone: string;
  today: string;
  day: string;
  canManage: boolean;
  defaultMargin: number;
  vehicleMargins: Partial<Record<Vehicle, number>>;
  depots: Array<{
    id: string;
    name: string;
    address: unknown;
    active: boolean;
  }>;
  people: TravelPerson[];
  assignments: TravelAssignment[];
};
export type Segment = {
  assignmentId: string;
  workOrderId: string;
  personnelId: string;
  day: string;
  direction: "before" | "after";
  previousAssignmentId: string | null;
  origin: Point | null;
  destination: Point | null;
  originLabel: string;
  destinationLabel: string;
  privateRoute: boolean;
  privateAllowed: boolean;
  vehicle: Vehicle | null;
  profile: string | null;
  overridden: boolean;
  instruction: string;
  marginMinutes: number;
  previousEnd: string | null;
  plannedStart: string;
  locked: boolean;
  state: TravelState;
};
export type TravelLeg = Omit<Segment, "origin" | "destination" | "profile"> & {
  signature: string;
  origin?: Point | null;
  destination?: Point | null;
  seconds: number | null;
  metres: number | null;
  calculatedAt: string | null;
  refreshing: boolean;
  minutes: number | null;
  totalMinutes: number | null;
  earliestStart: string | null;
  departureAt: string | null;
  shortageMinutes: number | null;
  reason: string | null;
};
export function timing(
  seconds: number | null,
  margin: number,
  previousEnd: string | null,
  plannedStart: string,
) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
    return {
      minutes: null,
      totalMinutes: null,
      earliestStart: null,
      departureAt: null,
      shortageMinutes: null,
    };
  const minutes = Math.ceil(seconds / 60),
    totalMinutes = minutes + margin;
  const earliest = previousEnd
    ? Date.parse(previousEnd) + totalMinutes * 60000
    : null;
  return {
    minutes,
    totalMinutes,
    earliestStart: earliest === null ? null : new Date(earliest).toISOString(),
    departureAt: new Date(
      Date.parse(plannedStart) - totalMinutes * 60000,
    ).toISOString(),
    shortageMinutes:
      earliest === null
        ? 0
        : Math.max(0, Math.ceil((earliest - Date.parse(plannedStart)) / 60000)),
  };
}
export function segments(context: TravelContext): Segment[] {
  const result: Segment[] = [];
  for (const person of context.people) {
    const effective = { ...person, ...person.override };
    const vehicle = effective.standard_vehicle;
    const depot = context.depots.find(
      (d) => d.id === effective.departure_depot_id && d.active,
    );
    const baseAddress = normalizeAddress(
      effective.departure_kind === "home"
        ? person.home_address
        : effective.departure_kind === "custom"
          ? effective.alternate_departure_address
          : depot?.address,
    );
    const base = location(baseAddress),
      privateBase = effective.departure_kind !== "depot";
    const assignments = context.assignments
      .filter(
        (a) =>
          a.personnelId === person.id &&
          a.status !== "cancelled" &&
          a.orderStatus !== "cancelled",
      )
      .sort(
        (a, b) =>
          Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id),
      );
    let origin = base,
      originLabel =
        privateBase && !person.privateAllowed
          ? "Privévertrekpunt (afgeschermd)"
          : effective.departure_kind === "depot"
            ? depot?.name || "Bedrijfslocatie ontbreekt"
            : baseAddress.formatted || "Vertrekplek ontbreekt";
    let previous: TravelAssignment | null = null;
    for (const a of assignments) {
      const address = normalizeAddress(a.address),
        destination = a.arrival || location(address);
      const missing = !origin || !destination;
      const margin =
        a.margin ??
        (vehicle ? context.vehicleMargins[vehicle] : undefined) ??
        context.defaultMargin;
      result.push({
        assignmentId: a.id,
        workOrderId: a.workOrderId,
        personnelId: person.id,
        day: context.day,
        direction: "before",
        previousAssignmentId: previous?.id || null,
        origin,
        destination,
        originLabel,
        destinationLabel: `${a.objectName} · ${address.formatted || "Adres ontbreekt"}`,
        privateRoute: !previous && privateBase,
        privateAllowed: person.privateAllowed,
        vehicle,
        profile: vehicle ? profiles[vehicle] : null,
        overridden: Boolean(person.override),
        instruction: a.instruction,
        marginMinutes: margin,
        previousEnd: previous?.end || null,
        plannedStart: a.start,
        locked:
          context.day < context.today ||
          ["completed", "returned"].includes(a.status) ||
          ["completed", "invoice_ready", "invoiced"].includes(a.orderStatus),
        state: !vehicle
          ? "vehicle_missing"
          : vehicle === "other"
            ? "unsupported"
            : missing
              ? !address.formatted || (!previous && !baseAddress.formatted)
                ? "address_missing"
                : "location_unconfirmed"
              : "pending",
      });
      origin = destination;
      originLabel = `${a.objectName} · ${address.formatted}`;
      previous = a;
    }
    if (previous && effective.return_to_departure) {
      const last = result[result.length - 1];
      result.push({
        ...last,
        direction: "after",
        previousAssignmentId: previous.id,
        origin,
        destination: base,
        originLabel,
        destinationLabel:
          privateBase && !person.privateAllowed
            ? "Privévertrekpunt (afgeschermd)"
            : baseAddress.formatted || depot?.name || "Vertrekplek ontbreekt",
        privateRoute: privateBase,
        instruction: "",
        previousEnd: previous.end,
        plannedStart: previous.end,
        marginMinutes: vehicle
          ? (context.vehicleMargins[vehicle] ?? context.defaultMargin)
          : context.defaultMargin,
        state: !vehicle
          ? "vehicle_missing"
          : vehicle === "other"
            ? "unsupported"
            : !origin || !base
              ? "location_unconfirmed"
              : "pending",
      });
    }
  }
  return result;
}
