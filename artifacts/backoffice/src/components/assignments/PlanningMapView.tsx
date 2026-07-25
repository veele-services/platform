"use client";

import { SelectAdapter } from "@/components/ui/select-adapter";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bike,
  Car,
  Clock,
  Footprints,
  Info,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation,
  RefreshCcw,
  Route,
  TrainFront,
  UserRound,
} from "lucide-react";

import { applyRouteTimeSuggestion } from "@/app/actions/assignments";
import {
  calculatePlanningMapRoute,
  type PlanningMapRouteCalculationResult,
} from "@/app/actions/planning";
import {
  GoogleMapCanvas,
  type GoogleMapCanvasConfig,
  type GoogleMapMarker,
  type GoogleMapPolyline,
} from "@/components/google-maps/GoogleMapCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  GOOGLE_MAPS_MARKER_STATUS,
  markerStatusForAssignment,
} from "@/lib/google-maps/marker-status";
import type { PlanningRouteTravelMode } from "@/lib/google-maps/planning-travel-modes";
import {
  AssignmentPriorityBadge,
  AssignmentStatusBadge,
  statusLabel,
} from "./AssignmentStatusBadge";

type Coordinate = {
  lat: number;
  lng: number;
  source: "object";
};

type MapRouteContext = {
  id: string | null;
  assignmentId: string;
  personnelId: string;
  previousAssignmentId: string | null;
  sequenceIndex: number | null;
  vehicleType: string;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  travelDurationSeconds: number | null;
  travelDistanceMeters: number | null;
  bufferMinutes: number;
  computedEarliestStart: string | null;
  customerWindowStart: string | null;
  customerWindowEnd: string | null;
  snapStatus: string | null;
  snapSuggestedStart: string | null;
  snapSuggestedEnd: string | null;
  warningCode: string | null;
  warningMessage: string | null;
};

type MapMarker = {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string;
  customerName: string;
  objectId: string | null;
  objectName: string | null;
  objectAddress: string | null;
  objectPostalCode: string | null;
  objectCity: string | null;
  objectFormattedAddress: string | null;
  requiredRegion: string | null;
  coordinate: Coordinate | null;
  missingLocation: boolean;
  assignedPersonnel: Array<{
    id: string;
    name: string;
    vehicleType: string;
    region: string | null;
  }>;
  routeContexts: MapRouteContext[];
  primarySnapStatus: string | null;
  primaryWarningCode: string | null;
  primaryWarningMessage: string | null;
};

type PersonnelRoute = {
  personnelId: string;
  personnelName: string;
  vehicleType: string;
  region: string | null;
  stops: Array<{
    assignmentId: string;
    code: string;
    title: string;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    sequenceIndex: number | null;
    routeContextId: string | null;
    snapStatus: string | null;
    warningCode: string | null;
    warningMessage: string | null;
    travelDurationSeconds: number | null;
    travelDistanceMeters: number | null;
    bufferMinutes: number;
  }>;
  totalTravelDurationSeconds: number;
  totalTravelDistanceMeters: number;
  warningCount: number;
};

type PlanningMapData = {
  date: string;
  accessDenied: boolean;
  markers: MapMarker[];
  personnelRoutes: PersonnelRoute[];
  warnings: Array<{
    assignmentId: string;
    personnelId: string | null;
    code: string;
    title: string;
    warningCode: string;
    warningMessage: string;
  }>;
  missingLocationCount: number;
  generatedAt: string;
};

type PlanningMapViewProps = {
  data: PlanningMapData;
  googleMapsConfig: GoogleMapCanvasConfig;
  canApplySuggestions?: boolean;
  dateLabel?: string;
};

type PendingSuggestion = {
  marker: MapMarker;
  context: MapRouteContext;
  personnelName: string;
};

const ROUTE_MODE_OPTIONS: Array<{
  value: PlanningRouteTravelMode;
  label: string;
  icon: ReactNode;
}> = [
  { value: "DRIVE", label: "Auto", icon: <Car className="h-4 w-4" /> },
  { value: "BICYCLE", label: "Fiets", icon: <Bike className="h-4 w-4" /> },
  { value: "WALK", label: "Lopen", icon: <Footprints className="h-4 w-4" /> },
  {
    value: "TRANSIT",
    label: "Openbaar vervoer",
    icon: <TrainFront className="h-4 w-4" />,
  },
];

function canonicalTravelMode(
  value: string | null | undefined,
): PlanningRouteTravelMode {
  switch (value) {
    case "BICYCLE":
    case "bicycle":
      return "BICYCLE";
    case "WALK":
    case "walking":
      return "WALK";
    case "TRANSIT":
    case "public_transport":
      return "TRANSIT";
    case "DRIVE":
    case "car":
    case "moped_or_scooter":
    default:
      return "DRIVE";
  }
}

function routeModeLabel(value: PlanningRouteTravelMode): string {
  return (
    ROUTE_MODE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function routeModeWarning(value: PlanningRouteTravelMode): string | null {
  if (value === "BICYCLE" || value === "WALK") {
    return "Fiets- en wandelroutes kunnen onvolledige paden bevatten. Controleer de route voor vertrek.";
  }
  return null;
}

function routeResultBelongsToMarker(
  result: PlanningMapRouteCalculationResult | null,
  marker: MapMarker | null,
  personnelId: string,
): boolean {
  return Boolean(
    result &&
    marker &&
    result.assignmentId === marker.id &&
    result.personnelId === personnelId,
  );
}

function decodeEncodedPolyline(encoded: string): Coordinate[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Coordinate[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
      source: "object",
    });
  }

  return coordinates;
}

function markerTone(marker: MapMarker) {
  const status = markerStatusForAssignment({
    status: marker.status,
    priority: marker.priority,
  });
  return GOOGLE_MAPS_MARKER_STATUS[status];
}

function formatTimeRange(
  marker: Pick<MapMarker, "scheduledStart" | "scheduledEnd">,
): string {
  if (marker.scheduledStart && marker.scheduledEnd) {
    return `${marker.scheduledStart} - ${marker.scheduledEnd}`;
  }
  return marker.scheduledStart ?? marker.scheduledEnd ?? "Geen tijd";
}

function formatTimeWindow(start: string | null, end: string | null): string {
  if (start && end) return `${start} - ${end}`;
  return start ?? end ?? "Geen tijd";
}

function formatDistance(meters: number): string {
  if (meters <= 0) return "0 km";
  return `${(meters / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 min";
  return `${Math.round(seconds / 60)} min`;
}

function vehicleLabel(value: string): string {
  const labels: Record<string, string> = {
    DRIVE: "Auto",
    BICYCLE: "Fiets",
    WALK: "Lopend",
    TRANSIT: "OV",
    car: "Auto",
    bicycle: "Fiets",
    walking: "Lopend",
    moped_or_scooter: "Scooter",
    public_transport: "OV",
  };
  return labels[value] ?? value;
}

function formatObjectAddress(
  marker: Pick<
    MapMarker,
    | "objectAddress"
    | "objectPostalCode"
    | "objectCity"
    | "objectFormattedAddress"
  >,
): string {
  if (marker.objectFormattedAddress?.trim()) {
    return marker.objectFormattedAddress.trim();
  }

  return (
    [
      marker.objectAddress,
      [marker.objectPostalCode, marker.objectCity].filter(Boolean).join(" "),
    ]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(", ") || "Geen adres bekend"
  );
}

function personnelSummary(
  marker: Pick<MapMarker, "assignedPersonnel">,
): string {
  return (
    marker.assignedPersonnel.map((person) => person.name).join(", ") ||
    "Geen personeel gekoppeld"
  );
}

function snapStatusLabel(value: string | null): string {
  const labels: Record<string, string> = {
    ok: "OK",
    suggested: "Voorstel",
    outside_window: "Buiten tijdvak",
    missing_location: "Locatie ontbreekt",
    provider_error: "Routeprovider",
  };
  return value ? (labels[value] ?? value) : "Geen route-info";
}

function routeContextCanApply(context: MapRouteContext): boolean {
  if (!context.id || !context.snapSuggestedStart) return false;
  return (
    context.warningCode !== "missing_location" &&
    context.warningCode !== "provider_error"
  );
}

function OverlayChip({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50"
          >
            <span>{count}</span>
            <span>{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(420px,calc(100vw-2rem))] p-0"
        >
          {children}
        </PopoverContent>
      </div>
    </Popover>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function PlanningMapView({
  data,
  googleMapsConfig,
  canApplySuggestions = false,
  dateLabel,
}: PlanningMapViewProps) {
  const router = useRouter();
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(
    null,
  );
  const [pendingSuggestion, setPendingSuggestion] =
    useState<PendingSuggestion | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [routePersonnelId, setRoutePersonnelId] = useState<string>("");
  const [routeTravelMode, setRouteTravelMode] =
    useState<PlanningRouteTravelMode>("DRIVE");
  const [routeResult, setRouteResult] =
    useState<PlanningMapRouteCalculationResult | null>(null);
  const [isApplyingSuggestion, startApplySuggestionTransition] =
    useTransition();
  const [isCalculatingRoute, startCalculateRouteTransition] = useTransition();

  const selectedMarker =
    data.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const selectedRoutePersonnel =
    selectedMarker?.assignedPersonnel.find(
      (person) => person.id === routePersonnelId,
    ) ?? null;
  const activeRouteResult = routeResultBelongsToMarker(
    routeResult,
    selectedMarker,
    routePersonnelId,
  )
    ? routeResult
    : null;
  const visibleMarkers = useMemo(
    () => data.markers.filter((marker) => marker.coordinate),
    [data.markers],
  );
  const markerById = useMemo(
    () => new Map(data.markers.map((marker) => [marker.id, marker])),
    [data.markers],
  );

  useEffect(() => {
    if (!selectedMarker) {
      setRoutePersonnelId("");
      setRouteResult(null);
      return;
    }

    const currentPersonnel = selectedMarker.assignedPersonnel.find(
      (person) => person.id === routePersonnelId,
    );
    const nextPersonnel =
      currentPersonnel ?? selectedMarker.assignedPersonnel[0] ?? null;
    if (!nextPersonnel) {
      setRoutePersonnelId("");
      setRouteResult(null);
      return;
    }

    if (nextPersonnel.id !== routePersonnelId) {
      setRoutePersonnelId(nextPersonnel.id);
      setRouteTravelMode(canonicalTravelMode(nextPersonnel.vehicleType));
      setRouteResult(null);
    }
  }, [routePersonnelId, selectedMarker]);

  const googleMarkers: GoogleMapMarker[] = useMemo(
    () =>
      visibleMarkers.map((marker) => {
        const status = markerStatusForAssignment({
          status: marker.status,
          priority: marker.priority,
        });
        const definition = GOOGLE_MAPS_MARKER_STATUS[status];
        return {
          id: marker.id,
          position: marker.coordinate!,
          status,
          selected:
            marker.id === highlightedMarkerId || marker.id === selectedMarkerId,
          title: `${marker.code} - ${marker.title}`,
          ariaLabel: `${marker.code}, ${definition.label}, ${formatObjectAddress(marker)}, ${personnelSummary(marker)}`,
        };
      }),
    [highlightedMarkerId, selectedMarkerId, visibleMarkers],
  );

  const activeRoutePolyline: GoogleMapPolyline | null = useMemo(() => {
    if (!activeRouteResult?.success) return null;
    const decodedPath = activeRouteResult.encodedPolyline
      ? decodeEncodedPolyline(activeRouteResult.encodedPolyline)
      : [];
    const path =
      decodedPath.length > 1
        ? decodedPath
        : [
            { ...activeRouteResult.origin, source: "object" as const },
            { ...activeRouteResult.destination, source: "object" as const },
          ];
    return {
      id: `explicit-route-${activeRouteResult.assignmentId}-${activeRouteResult.personnelId}`,
      path,
      color: "#f59e0b",
    };
  }, [activeRouteResult]);

  const googleRouteLines: GoogleMapPolyline[] = useMemo(() => {
    const scheduledRouteLines = data.personnelRoutes
      .map((route) => {
        const path = route.stops
          .map((stop) => markerById.get(stop.assignmentId)?.coordinate ?? null)
          .filter((position): position is Coordinate => Boolean(position));
        return {
          id: route.personnelId,
          path,
          color: "var(--color-primary)",
        };
      })
      .filter((polyline) => polyline.path.length > 1);

    return activeRoutePolyline
      ? [...scheduledRouteLines, activeRoutePolyline]
      : scheduledRouteLines;
  }, [activeRoutePolyline, data.personnelRoutes, markerById]);

  function personnelNameForContext(
    marker: MapMarker,
    context: MapRouteContext,
  ): string {
    return (
      marker.assignedPersonnel.find(
        (person) => person.id === context.personnelId,
      )?.name ?? "Gekoppeld personeel"
    );
  }

  function handleRoutePersonnelChange(personnelId: string) {
    const person = selectedMarker?.assignedPersonnel.find(
      (item) => item.id === personnelId,
    );
    setRoutePersonnelId(personnelId);
    setRouteTravelMode(canonicalTravelMode(person?.vehicleType));
    setRouteResult(null);
  }

  function handleTravelModeChange(value: string) {
    setRouteTravelMode(canonicalTravelMode(value));
    setRouteResult(null);
  }

  function handleCalculateRoute() {
    if (!selectedMarker || !routePersonnelId) return;
    const assignmentId = selectedMarker.id;
    const personnelId = routePersonnelId;
    const travelMode = routeTravelMode;

    startCalculateRouteTransition(async () => {
      const result = await calculatePlanningMapRoute({
        assignmentId,
        personnelId,
        travelMode,
      });
      setRouteResult(result);
      if (result.success) {
        setHighlightedMarkerId(result.assignmentId);
      }
    });
  }

  function focusMarker(
    marker: MapMarker,
    options: { openDrawer?: boolean } = {},
  ) {
    setHighlightedMarkerId(marker.id);
    if (options.openDrawer) setSelectedMarkerId(marker.id);
  }

  function openSuggestionDialog(marker: MapMarker, context: MapRouteContext) {
    setSuggestionMessage(null);
    setPendingSuggestion({
      marker,
      context,
      personnelName: personnelNameForContext(marker, context),
    });
  }

  function handleApplySuggestion() {
    if (!pendingSuggestion?.context.id) return;
    const routeContextId = pendingSuggestion.context.id;
    const assignmentId = pendingSuggestion.marker.id;

    startApplySuggestionTransition(async () => {
      const result = await applyRouteTimeSuggestion({
        routeContextId,
        assignmentId,
      });
      if (!result.success) {
        setSuggestionMessage({ tone: "error", text: result.message });
        return;
      }
      setSuggestionMessage({
        tone: "success",
        text:
          result.warning ??
          "Tijdvoorstel toegepast. De planning is bijgewerkt.",
      });
      setPendingSuggestion(null);
      router.refresh();
    });
  }

  if (data.accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        U heeft geen planningrechten om kaartdata te bekijken.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-600" />
              <h2 className="text-base font-semibold text-slate-950">
                Live dagkaart
              </h2>
            </div>
            {dateLabel ? (
              <p className="mt-1 text-sm font-medium capitalize text-slate-600">
                {dateLabel}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Werkbonnen, route-informatie en waarschuwingen voor deze
                planningsdag.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OverlayChip label="werkbonnen" count={data.markers.length}>
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">
                  Werkbonnen deze dag
                </p>
                <p className="text-xs text-slate-500">
                  Klik een werkbon om de marker uit te lichten.
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {data.markers.length > 0 ? (
                  data.markers.map((marker) => {
                    const tone = markerTone(marker);
                    return (
                      <button
                        type="button"
                        key={marker.id}
                        onClick={() =>
                          focusMarker(marker, { openDrawer: true })
                        }
                        className="w-full rounded-md p-2 text-left hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              {marker.code} - {marker.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {formatObjectAddress(marker)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {personnelSummary(marker)}
                            </p>
                          </div>
                          <span
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{ background: tone.color }}
                            aria-label={tone.label}
                          />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="p-3 text-sm text-slate-500">
                    Geen werkbonnen voor deze selectie.
                  </p>
                )}
              </div>
            </OverlayChip>

            <OverlayChip label="waarschuwingen" count={data.warnings.length}>
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">
                  Waarschuwingen
                </p>
                <p className="text-xs text-slate-500">
                  Locaties, routeprovider en tijdvakcontrole.
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {data.warnings.length > 0 ? (
                  data.warnings.map((warning) => (
                    <button
                      key={`${warning.assignmentId}-${warning.personnelId ?? "assignment"}-${warning.warningCode}`}
                      type="button"
                      onClick={() => {
                        const marker = data.markers.find(
                          (item) => item.id === warning.assignmentId,
                        );
                        if (marker) focusMarker(marker, { openDrawer: true });
                      }}
                      className="w-full rounded-md border border-amber-200 bg-amber-50 p-2 text-left text-sm text-amber-950 hover:bg-amber-100"
                    >
                      <span className="font-semibold">{warning.code}</span>
                      <span className="mt-1 block text-xs">
                        {warning.warningMessage}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Geen route- of locatieblokkades.
                  </p>
                )}
              </div>
            </OverlayChip>

            <OverlayChip label="routes" count={data.personnelRoutes.length}>
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">Routes</p>
                <p className="text-xs text-slate-500">
                  Reistijd en afstand per medewerker.
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {data.personnelRoutes.length > 0 ? (
                  data.personnelRoutes.map((route) => (
                    <div
                      key={route.personnelId}
                      className="rounded-md border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {route.personnelName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {vehicleLabel(route.vehicleType)} -{" "}
                            {route.region ?? "Geen regio"}
                          </p>
                        </div>
                        {route.warningCount > 0 && (
                          <Badge variant="secondary">
                            {route.warningCount} waarschuwing
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-white p-2">
                          <p className="text-slate-500">Reistijd</p>
                          <p className="font-semibold text-slate-900">
                            {formatDuration(route.totalTravelDurationSeconds)}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-2">
                          <p className="text-slate-500">Afstand</p>
                          <p className="font-semibold text-slate-900">
                            {formatDistance(route.totalTravelDistanceMeters)}
                          </p>
                        </div>
                      </div>
                      <ol className="mt-3 space-y-1.5">
                        {route.stops.map((stop, index) => (
                          <li
                            key={`${route.personnelId}-${stop.assignmentId}`}
                            className="flex gap-2 text-sm"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const marker = data.markers.find(
                                  (item) => item.id === stop.assignmentId,
                                );
                                if (marker)
                                  focusMarker(marker, { openDrawer: true });
                              }}
                              className="min-w-0 text-left hover:underline"
                            >
                              <span className="block truncate font-medium text-slate-900">
                                {stop.code}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {snapStatusLabel(stop.snapStatus)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))
                ) : (
                  <p className="p-3 text-sm text-slate-500">
                    Nog geen routes beschikbaar.
                  </p>
                )}
              </div>
            </OverlayChip>
          </div>
        </div>

        <div className="relative">
          {data.missingLocationCount > 0 ? (
            <div className="absolute inset-x-4 top-4 z-10 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm">
              {data.missingLocationCount} werkbon
              {data.missingLocationCount === 1 ? "" : "nen"} zonder bruikbare
              locatie. Vul object- of klantlocaties aan om alle markers te
              tonen.
            </div>
          ) : null}
          <GoogleMapCanvas
            config={googleMapsConfig}
            markers={googleMarkers}
            polylines={googleRouteLines}
            selectedMarkerId={selectedMarkerId}
            onMarkerSelect={(markerId) => {
              setHighlightedMarkerId(markerId);
              setSelectedMarkerId(markerId);
            }}
            className="h-[calc(100vh-13rem)] min-h-[620px]"
            emptyTitle="Geen werkbonnen met bruikbare coordinaten"
            emptyDescription="Vul objectlocaties aan om markers op de Google planningkaart te tonen."
          />
        </div>
      </section>

      <Sheet
        open={Boolean(selectedMarker)}
        onOpenChange={(open) => !open && setSelectedMarkerId(null)}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          {selectedMarker && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedMarker.code} - {selectedMarker.title}
                </SheetTitle>
                <SheetDescription>
                  {selectedMarker.customerName || "Geen klant"} -{" "}
                  {formatTimeRange(selectedMarker)}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap gap-2">
                  <AssignmentStatusBadge
                    status={selectedMarker.status as never}
                  />
                  <AssignmentPriorityBadge
                    priority={selectedMarker.priority as never}
                  />
                  {selectedMarker.coordinate ? (
                    <Badge variant="outline">
                      <LocateFixed className="mr-1 h-3 w-3" />
                      Objectlocatie
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Geen locatie</Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard
                    icon={<Clock className="h-4 w-4" />}
                    label="Planning"
                    value={formatTimeRange(selectedMarker)}
                  />
                  <InfoCard
                    icon={<Navigation className="h-4 w-4" />}
                    label="Status"
                    value={statusLabel(selectedMarker.status as never)}
                  />
                  <InfoCard
                    icon={<MapPin className="h-4 w-4" />}
                    label="Object"
                    value={selectedMarker.objectName ?? "Geen object"}
                  />
                  <InfoCard
                    icon={<Car className="h-4 w-4" />}
                    label="Regio"
                    value={selectedMarker.requiredRegion ?? "Geen regio"}
                  />
                </div>

                {selectedMarker.primaryWarningMessage && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Routewaarschuwing</p>
                    <p className="mt-1">
                      {selectedMarker.primaryWarningMessage}
                    </p>
                  </div>
                )}
                {suggestionMessage && (
                  <div
                    className={
                      suggestionMessage.tone === "success"
                        ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                        : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                    }
                  >
                    {suggestionMessage.text}
                  </div>
                )}

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">
                    Gekoppeld personeel
                  </h3>
                  <div className="mt-2 space-y-2">
                    {selectedMarker.assignedPersonnel.length > 0 ? (
                      selectedMarker.assignedPersonnel.map((person) => (
                        <div
                          key={person.id}
                          className="rounded-lg border bg-slate-50 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-cyan-700" />
                            <p className="font-medium text-slate-900">
                              {person.name}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {vehicleLabel(person.vehicleType)} -{" "}
                            {person.region ?? "Geen regio"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-500">
                        Geen personeel gekoppeld.
                      </p>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-cyan-700" />
                        <h3 className="text-sm font-semibold text-slate-950">
                          Route bekijken
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Routes worden alleen berekend wanneer u expliciet op
                        Route bekijken klikt.
                      </p>
                    </div>
                    {activeRouteResult?.success ? (
                      <Badge variant="outline">
                        {routeModeLabel(activeRouteResult.travelMode)}
                      </Badge>
                    ) : null}
                  </div>

                  {selectedMarker.assignedPersonnel.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium text-slate-700">
                            Medewerker
                          </span>
                          <SelectAdapter
                            value={routePersonnelId}
                            onChange={(event) =>
                              handleRoutePersonnelChange(event.target.value)
                            }
                            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                          >
                            {selectedMarker.assignedPersonnel.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </SelectAdapter>
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="font-medium text-slate-700">
                            Vervoersmiddel
                          </span>
                          <SelectAdapter
                            value={routeTravelMode}
                            onChange={(event) =>
                              handleTravelModeChange(event.target.value)
                            }
                            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                          >
                            {ROUTE_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </SelectAdapter>
                        </label>
                      </div>

                      {selectedRoutePersonnel ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                          Profielvoorkeur:{" "}
                          {vehicleLabel(selectedRoutePersonnel.vehicleType)}. De
                          gekozen route hier wijzigt het medewerkerprofiel niet.
                        </div>
                      ) : null}

                      {routeModeWarning(routeTravelMode) ? (
                        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>{routeModeWarning(routeTravelMode)}</p>
                        </div>
                      ) : null}

                      <Button
                        type="button"
                        className="w-full"
                        disabled={isCalculatingRoute || !routePersonnelId}
                        onClick={handleCalculateRoute}
                      >
                        {isCalculatingRoute ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Route berekenen...
                          </>
                        ) : (
                          "Route bekijken"
                        )}
                      </Button>

                      {isCalculatingRoute ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
                          <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
                        </div>
                      ) : null}

                      {activeRouteResult?.success ? (
                        <div className="space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <InfoCard
                              icon={<MapPin className="h-4 w-4" />}
                              label="Afstand"
                              value={
                                activeRouteResult.distanceMeters === null
                                  ? "Onbekend"
                                  : formatDistance(
                                      activeRouteResult.distanceMeters,
                                    )
                              }
                            />
                            <InfoCard
                              icon={<Clock className="h-4 w-4" />}
                              label="Reistijd"
                              value={formatDuration(
                                activeRouteResult.durationSeconds,
                              )}
                            />
                            <InfoCard
                              icon={<Clock className="h-4 w-4" />}
                              label="Zonder verkeer"
                              value={
                                activeRouteResult.staticDurationSeconds === null
                                  ? "Niet beschikbaar"
                                  : formatDuration(
                                      activeRouteResult.staticDurationSeconds,
                                    )
                              }
                            />
                            {activeRouteResult.travelMode === "DRIVE" ? (
                              <InfoCard
                                icon={<Car className="h-4 w-4" />}
                                label="Vertraging"
                                value={
                                  activeRouteResult.trafficDelaySeconds === null
                                    ? "Niet beschikbaar"
                                    : formatDuration(
                                        activeRouteResult.trafficDelaySeconds,
                                      )
                                }
                              />
                            ) : null}
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                            <p className="font-medium text-slate-950">Van</p>
                            <p className="mt-1 text-slate-600">
                              {activeRouteResult.originLabel}
                            </p>
                            <p className="mt-3 font-medium text-slate-950">
                              Naar
                            </p>
                            <p className="mt-1 text-slate-600">
                              {activeRouteResult.destinationLabel}
                            </p>
                            {activeRouteResult.warnings.length > 0 ? (
                              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
                                {activeRouteResult.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <Button asChild variant="outline" className="w-full">
                            <a
                              href={activeRouteResult.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Google Maps
                            </a>
                          </Button>
                        </div>
                      ) : activeRouteResult && !activeRouteResult.success ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                          <p className="font-semibold">
                            {activeRouteResult.code === "transit_no_result"
                              ? "Geen OV-route gevonden"
                              : "Route kon niet worden berekend"}
                          </p>
                          <p className="mt-1">{activeRouteResult.message}</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3 bg-white"
                            onClick={handleCalculateRoute}
                            disabled={isCalculatingRoute}
                          >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Opnieuw proberen
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm text-slate-500">
                      Koppel eerst een medewerker aan deze werkbon om een route
                      te berekenen.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">
                    Opdrachtinformatie
                  </h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <InfoCard
                      icon={<Info className="h-4 w-4" />}
                      label="Titel"
                      value={selectedMarker.title}
                    />
                    <InfoCard
                      icon={<Clock className="h-4 w-4" />}
                      label="Tijdvak"
                      value={formatTimeRange(selectedMarker)}
                    />
                    <InfoCard
                      icon={<Navigation className="h-4 w-4" />}
                      label="Status"
                      value={statusLabel(selectedMarker.status as never)}
                    />
                    <InfoCard
                      icon={<Car className="h-4 w-4" />}
                      label="Prioriteit"
                      value={selectedMarker.priority}
                    />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">
                    Adresgegevens
                  </h3>
                  <div className="mt-2 rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-cyan-700" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                          {selectedMarker.objectName ?? "Geen object"}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {formatObjectAddress(selectedMarker)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedMarker.customerName || "Geen klant"}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {selectedMarker.routeContexts.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Routecontext
                    </h3>
                    <div className="mt-2 space-y-2">
                      {selectedMarker.routeContexts.map((context) => (
                        <div
                          key={`${context.personnelId}-${context.id ?? "context"}`}
                          className="rounded-lg border bg-slate-50 p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-950">
                                {personnelNameForContext(
                                  selectedMarker,
                                  context,
                                )}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {vehicleLabel(context.vehicleType)} -{" "}
                                {formatDuration(
                                  context.travelDurationSeconds ?? 0,
                                )}{" "}
                                -{" "}
                                {formatDistance(
                                  context.travelDistanceMeters ?? 0,
                                )}
                              </p>
                            </div>
                            <Badge
                              variant={
                                context.warningCode ? "secondary" : "outline"
                              }
                            >
                              {snapStatusLabel(context.snapStatus)}
                            </Badge>
                          </div>
                          {context.warningMessage ? (
                            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                              {context.warningMessage}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {selectedMarker.routeContexts.some(
                  (context) => context.snapSuggestedStart,
                ) && (
                  <section>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Tijdvoorstellen
                    </h3>
                    <div className="mt-2 space-y-2">
                      {selectedMarker.routeContexts
                        .filter((context) => context.snapSuggestedStart)
                        .map((context) => (
                          <div
                            key={`${context.personnelId}-${context.id ?? "context"}-suggestion`}
                            className="rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-sm"
                          >
                            <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                              <div>
                                <p className="font-medium uppercase text-slate-500">
                                  Huidig
                                </p>
                                <p className="mt-1 font-semibold text-slate-950">
                                  {formatTimeWindow(
                                    selectedMarker.scheduledStart,
                                    selectedMarker.scheduledEnd,
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium uppercase text-slate-500">
                                  Voorstel
                                </p>
                                <p className="mt-1 font-semibold text-slate-950">
                                  {formatTimeWindow(
                                    context.snapSuggestedStart,
                                    context.snapSuggestedEnd,
                                  )}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full bg-white"
                              disabled={
                                !canApplySuggestions ||
                                !routeContextCanApply(context)
                              }
                              onClick={() =>
                                openSuggestionDialog(selectedMarker, context)
                              }
                            >
                              Voorstel toepassen
                            </Button>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                <div className="grid gap-2">
                  <Button asChild className="w-full">
                    <Link href={`/assignments/${selectedMarker.id}`}>
                      Werkbon openen
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingSuggestion)}
        onOpenChange={(open) => !open && setPendingSuggestion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tijdvoorstel toepassen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  Fieldgrid past routevoorstellen nooit automatisch toe.
                  Controleer de wijziging voordat u de planning bijwerkt.
                </p>
                {pendingSuggestion && (
                  <div className="rounded-lg border bg-slate-50 p-3 text-slate-900">
                    <p className="font-semibold">
                      {pendingSuggestion.marker.code} -{" "}
                      {pendingSuggestion.marker.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {pendingSuggestion.personnelName}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-white p-2">
                        <p className="text-xs font-medium uppercase text-slate-500">
                          Van
                        </p>
                        <p className="font-semibold">
                          {formatTimeWindow(
                            pendingSuggestion.marker.scheduledStart,
                            pendingSuggestion.marker.scheduledEnd,
                          )}
                        </p>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <p className="text-xs font-medium uppercase text-slate-500">
                          Naar
                        </p>
                        <p className="font-semibold">
                          {formatTimeWindow(
                            pendingSuggestion.context.snapSuggestedStart,
                            pendingSuggestion.context.snapSuggestedEnd,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {suggestionMessage?.tone === "error" && (
                  <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">
                    {suggestionMessage.text}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingSuggestion}>
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isApplyingSuggestion}
              onClick={(event) => {
                event.preventDefault();
                handleApplySuggestion();
              }}
            >
              {isApplyingSuggestion ? "Toepassen..." : "Tijd aanpassen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
