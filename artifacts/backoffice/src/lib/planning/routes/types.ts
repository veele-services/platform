import type { LegacyPersonnelVehicleType, PersonnelVehicleType } from "@workspace/db";

export type RouteCoordinate = {
  lat: number;
  lng: number;
};

export type RouteVehicleType = PersonnelVehicleType | LegacyPersonnelVehicleType;

export type RouteProviderMode =
  | "DRIVE"
  | "BICYCLE"
  | "WALK"
  | "TRANSIT";

export type RouteRequest = {
  tenantId: string;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  vehicleType: RouteVehicleType;
  departureTime?: Date;
};

export type SuccessfulRouteResult = {
  success: true;
  provider: string;
  providerMode: RouteProviderMode;
  durationSeconds: number;
  distanceMeters: number | null;
  warnings: string[];
  providerMeta?: Record<string, unknown>;
};

export type FailedRouteResult = {
  success: false;
  provider: string;
  providerMode: RouteProviderMode;
  error: string;
  retryable: boolean;
  warnings: string[];
  providerMeta?: Record<string, unknown>;
};

export type RouteResult = SuccessfulRouteResult | FailedRouteResult;

export type RouteProvider = {
  readonly name: string;
  getRoute(request: RouteRequest): Promise<RouteResult>;
};

export type FetchLike = typeof fetch;
