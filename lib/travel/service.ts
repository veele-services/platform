import "server-only";
import { createHash } from "node:crypto";
import { getObjectActor } from "@/lib/objects/auth";
import type { Json } from "@/lib/database.types";
import {
  segments,
  timing,
  type Segment,
  type TravelContext,
  type TravelLeg,
  type TravelState,
} from "./model";
import { routesFor, routeKey } from "./provider";

export async function travelActor(day: string, personId?: string) {
  const actor = await getObjectActor();
  const result = await actor.admin.rpc("travel_context", {
    t: actor.tenant.id,
    u: actor.user.id,
    s: actor.sessionId,
    d: day,
    p: personId,
  });
  if (result.error) throw new Error("Geen toegang tot deze reisplanning.");
  return { ...actor, context: result.data as unknown as TravelContext };
}
function signature(s: Segment, context: TravelContext) {
  const person = context.people.find((p) => p.id === s.personnelId);
  return createHash("sha256")
    .update(
      JSON.stringify([
        s.assignmentId,
        s.direction,
        s.personnelId,
        s.previousAssignmentId,
        s.day,
        s.vehicle,
        s.origin,
        s.destination,
        s.destinationLabel,
        s.privateRoute
          ? [
              person?.home_address,
              person?.alternate_departure_address,
              person?.override,
            ]
          : null,
      ]),
    )
    .digest("hex");
}
function redact(leg: TravelLeg, force = false): TravelLeg {
  if (!leg.privateRoute || (!force && leg.privateAllowed)) return leg;
  return {
    ...leg,
    origin: null,
    destination: null,
    privateAllowed: false,
    ...(leg.direction === "before"
      ? { originLabel: "Privévertrekpunt (afgeschermd)" }
      : { destinationLabel: "Privévertrekpunt (afgeschermd)" }),
  };
}
type TravelActor = Awaited<ReturnType<typeof travelActor>>;
// Planning revisions do not change when memberships or sessions are revoked.
// Compare the live authorization scope separately, without caching private data.
function accessScope(actor: TravelActor) {
  const c = actor.context;
  return JSON.stringify([
    actor.tenant.id, actor.user.id, actor.sessionId, c.canManage,
    c.people.map((p) => [p.id, p.privateAllowed]).sort(),
    c.assignments.map((a) => [a.id, a.personnelId, a.workOrderId, a.objectId]).sort(),
    c.depots.map((d) => d.id).sort(),
  ]);
}
async function assertCurrent(actor: TravelActor, day: string, personId?: string) {
  const current = await travelActor(day, personId);
  if (current.context.revision !== actor.context.revision)
    throw new Error("De planning is intussen gewijzigd. Probeer opnieuw.");
  if (accessScope(current) !== accessScope(actor))
    throw new Error("Je toegang tot deze reisplanning is gewijzigd. Open de planning opnieuw.");
}
export async function travelDay(day: string, personId?: string) {
  const actor = await travelActor(day, personId),
    c = actor.context,
    planned = segments(c);
  const ids = [...new Set(planned.map((s) => s.assignmentId))];
  const stored = ids.length
    ? await actor.admin
        .from("travel_legs")
        .select("*")
        .eq("tenant_id", actor.tenant.id)
        .in("assignment_id", ids)
    : { data: [], error: null };
  if (stored.error) throw new Error("Reisgegevens tijdelijk niet beschikbaar.");
  const saved = new Map(
    (stored.data || []).map((l) => [`${l.assignment_id}:${l.direction}`, l]),
  );
  const provider = await routesFor(
    planned.filter(
      (s) =>
        !s.locked &&
        s.state === "pending" &&
        saved.get(`${s.assignmentId}:${s.direction}`)?.manual_signature !==
          signature(s, c),
    ),
  );
  const legs: TravelLeg[] = planned.map((s) => {
    const sig = signature(s, c),
      old = saved.get(`${s.assignmentId}:${s.direction}`);
    if (s.locked && old?.estimate_snapshot) {
      const history = old.estimate_snapshot as unknown as TravelLeg;
      const referencesAllowed = history.assignmentId === s.assignmentId &&
        history.personnelId === s.personnelId && history.workOrderId === s.workOrderId &&
        history.day === s.day && history.direction === s.direction &&
        (history.previousAssignmentId === null || c.assignments.some(
          (a) => a.id === history.previousAssignmentId && a.personnelId === s.personnelId,
        ));
      if (referencesAllowed)
        return redact({ ...history, locked: true, privateAllowed: false }, true);
      // Keep the original evidence in storage, but do not disclose references
      // to an earlier visit after its assignment/dispatch access was revoked.
      return redact({
        ...s, signature: sig, state: "historical_unknown", seconds: null,
        metres: null, calculatedAt: null, refreshing: false,
        reason: "De historische rit is niet beschikbaar binnen je huidige toegang.",
        ...timing(null, s.marginMinutes, s.previousEnd, s.plannedStart),
      });
    }
    const cached =
      s.profile && s.origin && s.destination
        ? provider.cache.get(routeKey(s))
        : undefined;
    let state: TravelState = s.locked ? "historical_unknown" : s.state,
      seconds: number | null = null,
      metres: number | null = null,
      calculatedAt: string | null = null,
      reason: string | null = null,
      refreshing = false;
    if (old?.manual_signature && old.manual_seconds !== null) {
      if (old.manual_signature === sig) {
        state = "manual";
        seconds = old.manual_seconds;
        metres = old.manual_metres;
        calculatedAt = old.manual_updated_at;
        reason = old.manual_reason;
      } else {
        state = "manual_review";
        reason =
          "De eerdere handmatige waarde is niet meer toepasbaar. Bevestig opnieuw of kies automatisch.";
      }
    } else if (!s.locked && s.state === "pending") {
      if (cached?.result) {
        seconds = cached.result.seconds;
        metres = cached.result.metres;
        calculatedAt = cached.calculated_at;
        state = "known";
        refreshing = Date.parse(cached.expires_at || "") <= Date.now();
        if (refreshing && cached.error_code)
          reason =
            "Ouder resultaat voor hetzelfde traject; verversen is tijdelijk niet gelukt.";
      } else
        state = !provider.configured
          ? "not_configured"
          : provider.limited.has(routeKey(s))
            ? "rate_limit"
            : cached?.error_code || "pending";
    }
    return redact({
      ...s,
      signature: sig,
      seconds,
      metres,
      calculatedAt,
      reason,
      refreshing,
      state,
      ...timing(seconds, s.marginMinutes, s.previousEnd, s.plannedStart),
      ...(s.direction === "after"
        ? { departureAt: s.previousEnd, shortageMinutes: null }
        : {}),
    });
  });
  await assertCurrent(actor, day, personId);
  const writable = legs.filter((l) => !l.locked).map((l) => redact(l, true));
  if (writable.length) {
    const result = await actor.admin.rpc("store_travel_estimates", {
      t: actor.tenant.id,
      revision: c.revision,
      legs: writable as unknown as Json,
    });
    if (result.error || !result.data)
      throw new Error(
        "De planning is intussen gewijzigd. Reisgegevens worden opnieuw geladen.",
      );
  }
  await assertCurrent(actor, day, personId);
  return {
    revision: c.revision,
    day,
    timezone: c.timezone,
    canManage: c.canManage,
    legs,
    people: c.people.map((p) => ({
      id: p.id,
      name: p.name,
      vehicle: p.override?.standard_vehicle || p.standard_vehicle,
      overridden: Boolean(p.override),
    })),
    depots: c.depots.map((d) => ({ id: d.id, name: d.name, active: d.active })),
  };
}
export async function travelGeometry(
  day: string,
  assignmentId: string,
  direction: "before" | "after",
) {
  const actor = await travelActor(day),
    s = segments(actor.context).find(
      (l) => l.assignmentId === assignmentId && l.direction === direction,
    );
  if (!s || (s.privateRoute && !s.privateAllowed))
    throw new Error("Deze route bevat afgeschermde vertrekgegevens.");
  if (!s.origin || !s.destination || !s.profile || s.locked)
    throw new Error("Een routekaart is voor deze rit niet beschikbaar.");
  const before = signature(s, actor.context),
    r = await routesFor([s], true),
    value = r.cache.get(routeKey(s, true));
  const current = await travelActor(day),
    latest = segments(current.context).find(
      (l) => l.assignmentId === assignmentId && l.direction === direction,
    );
  if (
    !latest ||
    signature(latest, current.context) !== before ||
    (latest.privateRoute && !latest.privateAllowed)
  )
    throw new Error("De reisplanning is gewijzigd. Open de route opnieuw.");
  if (!value?.result?.geometry)
    throw new Error(
      !r.configured
        ? "Routedienst nog niet ingesteld."
        : "Routekaart tijdelijk niet beschikbaar. Probeer later opnieuw.",
    );
  return {
    geometry: value.result.geometry,
    origin: s.origin,
    destination: s.destination,
    refreshing: Date.parse(value.expires_at || "") <= Date.now(),
  };
}
export async function manualTravel(input: {
  day: string;
  assignmentId: string;
  direction: "before" | "after";
  expectedSignature: string;
  minutes: number | null;
  metres: number | null;
  reason: string;
}) {
  const actor = await travelActor(input.day),
    s = segments(actor.context).find(
      (l) =>
        l.assignmentId === input.assignmentId &&
        l.direction === input.direction,
    );
  if (!actor.context.canManage || !s || s.locked)
    throw new Error("Deze rit kan niet worden aangepast.");
  const sig = signature(s, actor.context);
  if (sig !== input.expectedSignature)
    throw new Error(
      "Het traject is intussen gewijzigd. Vernieuw en controleer de handmatige waarde opnieuw.",
    );
  const seconds = input.minutes === null ? null : input.minutes * 60;
  const leg = redact(
    {
      ...s,
      signature: sig,
      seconds,
      metres: input.metres,
      reason: input.reason,
      calculatedAt: new Date().toISOString(),
      refreshing: false,
      state: seconds === null ? "pending" : "manual",
      ...timing(seconds, s.marginMinutes, s.previousEnd, s.plannedStart),
    },
    true,
  );
  const saved = await actor.admin.rpc("store_travel_estimates", {
    t: actor.tenant.id,
    revision: actor.context.revision,
    legs: [leg] as unknown as Json,
    manual_action: seconds === null ? "clear" : "set",
    actor: actor.user.id,
    actor_session: actor.sessionId,
  });
  if (saved.error || !saved.data)
    throw new Error(
      "Niet opgeslagen. De planning is gewijzigd; vernieuw en probeer opnieuw.",
    );
}
