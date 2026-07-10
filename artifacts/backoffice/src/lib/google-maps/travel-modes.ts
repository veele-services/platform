import type { PersonnelVehicleType } from "@workspace/db";
import type { GoogleMapsTravelMode } from "./types";

export const GOOGLE_TRAVEL_MODE_LABELS: Record<GoogleMapsTravelMode, string> = {
  DRIVE: "Auto",
  BICYCLE: "Fiets",
  WALK: "Lopen",
  TRANSIT: "Openbaar vervoer",
};

export function googleTravelModeForPersonnelVehicle(
  vehicleType: PersonnelVehicleType | GoogleMapsTravelMode | null | undefined,
): GoogleMapsTravelMode {
  switch (vehicleType) {
    case "BICYCLE":
    case "bicycle":
      return "BICYCLE";
    case "WALK":
    case "walking":
      return "WALK";
    case "TRANSIT":
    case "public_transport":
      return "TRANSIT";
    case "moped_or_scooter":
      return "DRIVE";
    case "DRIVE":
    case "car":
    default:
      return "DRIVE";
  }
}

export function trafficPreferenceForTravelMode(
  travelMode: GoogleMapsTravelMode,
): "TRAFFIC_AWARE" | null {
  return travelMode === "DRIVE" ? "TRAFFIC_AWARE" : null;
}

export function routeRequestEventForTravelMode(
  travelMode: GoogleMapsTravelMode,
): "route_request_drive_traffic" | "route_request_bicycle" | "route_request_walk" | "route_request_transit" {
  switch (travelMode) {
    case "BICYCLE":
      return "route_request_bicycle";
    case "WALK":
      return "route_request_walk";
    case "TRANSIT":
      return "route_request_transit";
    case "DRIVE":
    default:
      return "route_request_drive_traffic";
  }
}
