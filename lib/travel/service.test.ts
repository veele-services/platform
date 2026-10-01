import { beforeEach, expect, it, vi } from "vitest";
import { emptyAddress } from "../addresses/model";
import type { TravelContext } from "./model";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  routesFor: vi.fn(),
  saved: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("./provider", () => ({
  routeKey: () => "key",
  routesFor: mock.routesFor,
}));
vi.mock("@/lib/objects/auth", () => ({
  getObjectActor: async () => ({
    tenant: { id: "tenant" },
    user: { id: "user" },
    sessionId: "session",
    admin: { rpc: mock.rpc, from: mock.from },
  }),
}));
import { travelDay, travelGeometry, manualTravel } from "./service";
let context: TravelContext;
beforeEach(() => {
  const address = {
    ...emptyAddress(),
    street_name: "FICTITIOUS PRIVATE HOME",
    house_number: "1",
    latitude: 52,
    longitude: 4,
    located_at: "2030-01-01T00:00:00.000Z",
    status: "confirmed",
  };
  context = {
    revision: 1,
    timezone: "Europe/Amsterdam",
    today: "2030-01-01",
    day: "2031-01-01",
    canManage: true,
    defaultMargin: 7,
    vehicleMargins: {},
    depots: [],
    people: [
      {
        id: "p",
        name: "Test",
        standard_vehicle: "car",
        departure_kind: "home",
        departure_depot_id: null,
        home_address: address,
        alternate_departure_address: {},
        return_to_departure: false,
        privateAllowed: false,
        override: null,
      },
    ],
    assignments: [
      {
        id: "a",
        workOrderId: "w",
        personnelId: "p",
        start: "2031-01-01T09:00Z",
        end: "2031-01-01T10:00Z",
        status: "planned",
        orderStatus: "planned",
        objectId: "o",
        objectName: "Test office",
        address: {
          ...address,
          street_name: "Fictitious office",
          longitude: 4.5,
        },
        arrival: null,
        instruction: "",
        margin: null,
        version: 1,
      },
    ],
  };
  mock.saved = [];
  mock.routesFor.mockReset();
  mock.routesFor.mockResolvedValue({ configured: false, cache: new Map(), limited: new Set() });
  mock.from.mockReturnValue({
    select: () => ({
      eq: () => ({ in: async () => ({ data: mock.saved, error: null }) }),
    }),
  });
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name) => ({
    data: name === "travel_context" ? structuredClone(context) : true,
    error: null,
  }));
});
it.each(["private permissions", "visible colleagues", "management permission"])(
  "rejects a same-revision loss of %s while route I/O is pending",
  async (change) => {
    context.people[0].privateAllowed = true;
    context.people[0].return_to_departure = true;
    mock.routesFor.mockImplementationOnce(async () => {
      if (change === "private permissions") context.people[0].privateAllowed = false;
      if (change === "visible colleagues") {
        context.people = [];
        context.assignments = [];
      }
      if (change === "management permission") context.canManage = false;
      return { configured: false, cache: new Map(), limited: new Set() };
    });
    await expect(travelDay(context.day)).rejects.toThrow("toegang");
    expect(mock.rpc.mock.calls.filter(([name]) => name === "store_travel_estimates")).toHaveLength(0);
  },
);
it("checks authorization again after writing estimates and before returning private data", async () => {
  context.people[0].privateAllowed = true;
  mock.rpc.mockImplementation(async (name) => {
    if (name === "store_travel_estimates") context.people[0].privateAllowed = false;
    return { data: name === "travel_context" ? structuredClone(context) : true, error: null };
  });
  await expect(travelDay(context.day)).rejects.toThrow("toegang");
});
it("geometry rejects lost private permission in both directions", async () => {
  context.people[0].privateAllowed = true;
  context.people[0].return_to_departure = true;
  for (const direction of ["before", "after"] as const) {
    context.people[0].privateAllowed = true;
    mock.routesFor.mockImplementationOnce(async () => {
      context.people[0].privateAllowed = false;
      return { configured: true, cache: new Map([["key", { result: { geometry: {} } }]]), limited: new Set() };
    });
    await expect(travelGeometry(context.day, "a", direction)).rejects.toThrow("reisplanning is gewijzigd");
  }
});
it("historical route snapshots cannot retain a revoked predecessor; authorized history is unchanged", async () => {
  context.canManage = false;
  context.people[0].privateAllowed = true;
  context.assignments.unshift({ ...context.assignments[0], id: "previous", workOrderId: "previous-order", objectId: "previous-object", objectName: "REVOKED OFFICE", start: "2031-01-01T07:00Z", end: "2031-01-01T08:00Z" });
  const initial = await travelDay(context.day);
  const historical = { ...initial.legs.find(l => l.assignmentId === "a")!, state: "known", seconds: 600, minutes: 10, metres: 2000 };
  mock.saved = [{ assignment_id: "a", direction: "before", estimate_snapshot: structuredClone(historical) }];
  context.today = "2032-01-01";
  const allowed = (await travelDay(context.day)).legs.find(l => l.assignmentId === "a")!;
  expect(allowed).toMatchObject({ previousAssignmentId: "previous", seconds: 600, metres: 2000, locked: true });
  context.assignments = context.assignments.filter(a => a.id !== "previous");
  const denied = await travelDay(context.day);
  expect(JSON.stringify(denied)).not.toContain("REVOKED OFFICE");
  expect(denied.legs[0]).toMatchObject({ previousAssignmentId: null, seconds: null, state: "historical_unknown", locked: true });
  expect(mock.saved[0].estimate_snapshot).toEqual(historical);
});
it.each([10, null])("binds manual set/clear (%s) to the current actor session", async (minutes) => {
  const first = await travelDay(context.day);
  await manualTravel({ day: context.day, assignmentId: "a", direction: "before", expectedSignature: first.legs[0].signature, minutes, metres: null, reason: "Fictitious test" });
  expect(mock.rpc).toHaveBeenLastCalledWith("store_travel_estimates", expect.objectContaining({ actor: "user", actor_session: "session", manual_action: minutes === null ? "clear" : "set" }));
});
it("redacts private coordinates and address labels from planner payloads and all stored snapshots", async () => {
  const result = await travelDay(context.day);
  expect(JSON.stringify(result)).not.toContain("PRIVATE HOME");
  expect(result.legs[0].origin).toBeNull();
  expect(result.legs[0].destination).toBeNull();
  const stored = mock.rpc.mock.calls.find(
    (c) => c[0] === "store_travel_estimates",
  )![1].legs;
  expect(JSON.stringify(stored)).not.toContain("PRIVATE HOME");
  await expect(travelGeometry(context.day, "a", "before")).rejects.toThrow(
    "afgeschermde",
  );
});
it("own employee can see private departure details but stored shared estimate cannot", async () => {
  context.people[0].privateAllowed = true;
  context.canManage = false;
  const result = await travelDay(context.day);
  expect(result.legs[0].origin).toEqual([4, 52]);
  expect(JSON.stringify(result)).toContain("PRIVATE HOME");
  expect(
    JSON.stringify(
      mock.rpc.mock.calls.find((c) => c[0] === "store_travel_estimates")![1]
        .legs,
    ),
  ).not.toContain("PRIVATE HOME");
  await expect(
    manualTravel({
      day: context.day,
      assignmentId: "a",
      direction: "before",
      expectedSignature: result.legs[0].signature,
      minutes: 10,
      metres: null,
      reason: "Test",
    }),
  ).rejects.toThrow("niet worden aangepast");
});
it("a result for an older planning revision never reaches the browser", async () => {
  let reads = 0;
  mock.rpc.mockImplementation(async (name) => ({
    data: name === "travel_context" ? { ...context, revision: ++reads } : true,
    error: null,
  }));
  await expect(travelDay(context.day)).rejects.toThrow(
    "planning is intussen gewijzigd",
  );
});
it("manual value is recognisable, survives margin changes, but requires review after mode change", async () => {
  const first = await travelDay(context.day);
  mock.saved = [
    {
      assignment_id: "a",
      direction: "before",
      manual_signature: first.legs[0].signature,
      manual_seconds: 600,
      manual_metres: 1000,
      manual_reason: "Fictitious manual test",
      manual_updated_at: "2031-01-01T00:00:00Z",
    },
  ];
  expect((await travelDay(context.day)).legs[0]).toMatchObject({
    state: "manual",
    minutes: 10,
    totalMinutes: 17,
  });
  context.defaultMargin = 2;
  expect((await travelDay(context.day)).legs[0].totalMinutes).toBe(12);
  context.people[0].standard_vehicle = "bicycle";
  expect((await travelDay(context.day)).legs[0]).toMatchObject({
    state: "manual_review",
    seconds: null,
    minutes: null,
  });
});
