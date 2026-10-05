import { describe, expect, it } from "vitest";
import {
  changeAddress,
  emptyAddress,
  location,
  normalizeAddress,
} from "../addresses/model";
import { profiles, segments, timing, type TravelContext } from "./model";

const address = (lng = 4.31, lat = 52.08) => ({
  ...emptyAddress(),
  street_name: "Fictieve teststraat",
  house_number: "12",
  house_letter: "A",
  house_addition: "bis",
  city: "Testplaats",
  postal_code: "1234 AB",
  latitude: lat,
  longitude: lng,
  located_at: "2031-01-01T00:00:00.000Z",
  source: "pdok",
  status: "confirmed",
});
function context(): TravelContext {
  return {
    revision: 1,
    timezone: "Europe/Amsterdam",
    today: "2030-01-01",
    day: "2031-01-01",
    canManage: true,
    defaultMargin: 7,
    vehicleMargins: { bicycle: 3 },
    depots: [
      { id: "depot", name: "Fictief depot", address: address(), active: true },
    ],
    people: [
      {
        id: "p",
        name: "Fictieve medewerker",
        standard_vehicle: "car",
        departure_kind: "depot",
        departure_depot_id: "depot",
        home_address: {},
        alternate_departure_address: {},
        return_to_departure: false,
        privateAllowed: false,
        override: null,
      },
    ],
    assignments: [0, 1, 2].map((i) => ({
      id: `a${i}`,
      workOrderId: `w${i}`,
      personnelId: "p",
      start: `2031-01-01T${["08:00", "09:40", "11:00"][i]}:00Z`,
      end: `2031-01-01T${["09:30", "10:30", "12:00"][i]}:00Z`,
      status: "planned",
      orderStatus: "planned",
      objectId: `o${i}`,
      objectName: `Fictief object ${i}`,
      address: address(4.4 + i / 10),
      arrival: null,
      instruction: "Zij-ingang",
      margin: null,
      version: 1,
    })),
  };
}
describe("canonical addresses", () => {
  it("preserves house letters and suffixes and invalidates old location after edits", () => {
    const a = normalizeAddress(address());
    expect(a.street).toBe("Fictieve teststraat 12A bis");
    expect(location(a)).toEqual([4.31, 52.08]);
    const changed = changeAddress(a, { house_addition: "2" });
    expect(location(changed)).toBeNull();
    expect(changed.source_id).toBeNull();
    expect(changed.status).toBe("needs_review");
  });
  it("keeps legacy text without guessing or pretending coordinates are verified", () => {
    const a = normalizeAddress({
      street: "Oude straat 12A bis",
      city: "Test",
      latitude: 52,
      longitude: 4,
    });
    expect(a.street_name).toBe("Oude straat 12A bis");
    expect(a.status).toBe("needs_review");
    expect(location(a)).toBeNull();
  });
});
describe("employee itineraries", () => {
  it("uses a confirmed private day departure without replacing the person's address", () => {
    const c = context();
    c.people[0].override = {
      departure_kind: "custom",
      alternate_departure_address: address(4.8, 52.3),
    };
    expect(segments(c)[0].origin).toEqual([4.8, 52.3]);
    expect(c.people[0].home_address).toEqual({});
    expect(segments(c)[0].privateRoute).toBe(true);
  });
  it("uses exact supported profiles, never silently maps unsupported transport", () => {
    expect(profiles).toEqual({
      car: "driving-car",
      van: "driving-car",
      motorcycle: null,
      scooter: null,
      electric_bicycle: "cycling-electric",
      bicycle: "cycling-regular",
      public_transport: null,
      walking: "foot-walking",
      other: null,
    });
  });
  it("builds all legs from depot then previous objects, without requiring a home", () => {
    const c = context(),
      legs = segments(c);
    expect(legs).toHaveLength(3);
    expect(legs[0].origin).toEqual([4.31, 52.08]);
    expect(legs[1].origin).toEqual([4.4, 52.08]);
    expect(legs[2].previousAssignmentId).toBe("a1");
    expect(legs.every((l) => l.state === "pending")).toBe(true);
  });
  it("uses daily mode, object > mode > tenant margins and arrival separately", () => {
    const c = context();
    c.people[0].override = { standard_vehicle: "bicycle" };
    c.assignments[1].arrival = [4.9, 52.2];
    c.assignments[1].margin = 11;
    const l = segments(c);
    expect(l[0].profile).toBe("cycling-regular");
    expect(l[0].marginMinutes).toBe(3);
    expect(l[1].marginMinutes).toBe(11);
    expect(l[1].destination).toEqual([4.9, 52.2]);
    expect(l[2].origin).toEqual([4.9, 52.2]);
    expect(normalizeAddress(c.assignments[1].address).longitude).toBe(4.5);
  });
  it("reconnects old and new employee chains after moving a job", () => {
    const c = context();
    c.people.push({ ...c.people[0], id: "p2", standard_vehicle: "walking" });
    c.assignments[1].personnelId = "p2";
    const l = segments(c);
    expect(l.find((x) => x.assignmentId === "a2")?.previousAssignmentId).toBe(
      "a0",
    );
    expect(l.find((x) => x.assignmentId === "a1")?.origin).toEqual([
      4.31, 52.08,
    ]);
    expect(l.find((x) => x.assignmentId === "a1")?.profile).toBe(
      "foot-walking",
    );
  });
  it("excludes cancelled and unassigned jobs, supports individual routes and optional return", () => {
    const c = context();
    c.people[0].return_to_departure = true;
    c.assignments[1].status = "cancelled";
    c.assignments[2].personnelId = "someone-else";
    const l = segments(c);
    expect(l).toHaveLength(2);
    expect(l[1].direction).toBe("after");
    expect(l[1].destination).toEqual([4.31, 52.08]);
  });
  it("reports missing/unsupported mode and unconfirmed locations honestly", () => {
    const c = context();
    c.people[0].standard_vehicle = null;
    expect(segments(c)[0].state).toBe("vehicle_missing");
    c.people[0].standard_vehicle = "other";
    expect(segments(c)[0].state).toBe("unsupported");
    c.people[0].standard_vehicle = "car";
    c.people[0].departure_kind = "home";
    expect(segments(c)[0].state).toBe("address_missing");
    c.people[0].home_address = { street: "Fictief 1" };
    expect(segments(c)[0].state).toBe("location_unconfirmed");
  });
  it("locks historical and completed estimates", () => {
    const c = context();
    c.today = "2032-01-01";
    expect(segments(c).every((l) => l.locked)).toBe(true);
  });
});
describe("feasibility", () => {
  it("09:30 + 18 + 7 = 09:55; at 09:40 exactly 15 minutes short", () => {
    const t = timing(1080, 7, "2031-01-01T09:30:00Z", "2031-01-01T09:40:00Z");
    expect(t).toMatchObject({
      minutes: 18,
      totalMinutes: 25,
      earliestStart: "2031-01-01T09:55:00.000Z",
      shortageMinutes: 15,
    });
  });
  it("rounds upward, retains arrival margin at zero distance, never makes errors zero", () => {
    expect(timing(61, 7, null, "2031-01-01T09:00Z").totalMinutes).toBe(9);
    expect(timing(0, 7, null, "2031-01-01T09:00Z").totalMinutes).toBe(7);
    expect(timing(null, 7, null, "2031-01-01T09:00Z").totalMinutes).toBeNull();
    expect(timing(NaN, 7, null, "2031-01-01T09:00Z").minutes).toBeNull();
  });
});
