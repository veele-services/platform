import type { PersonnelVehicleType } from "@workspace/db";

/**
 * The server-action module may only export async functions. Keep this shared
 * value in a regular module so Next.js does not serialize it as an action.
 */
export const PLANNING_ROUTE_TRAVEL_MODES = [
  "DRIVE",
  "BICYCLE",
  "WALK",
  "TRANSIT",
] as const satisfies readonly PersonnelVehicleType[];

export type PlanningRouteTravelMode =
  (typeof PLANNING_ROUTE_TRAVEL_MODES)[number];
