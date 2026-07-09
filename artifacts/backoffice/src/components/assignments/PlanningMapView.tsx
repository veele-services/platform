"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Car,
  Clock,
  Info,
  Layers3,
  LocateFixed,
  MapPin,
  Navigation,
  Route,
  UserRound,
} from "lucide-react";

import { AssignmentPriorityBadge, AssignmentStatusBadge, statusLabel } from "./AssignmentStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Coordinate = {
  lat: number;
  lng: number;
  source: "object" | "customer";
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
};

const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  draft: { color: "#64748B", bg: "#F8FAFC", border: "#CBD5E1" },
  requested: { color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD" },
  accepted: { color: "#0891B2", bg: "#ECFEFF", border: "#67E8F9" },
  scheduled: { color: "#0284C7", bg: "#E0F2FE", border: "#7DD3FC" },
  assigned: { color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  en_route: { color: "#D97706", bg: "#FEF3C7", border: "#FBBF24" },
  in_progress: { color: "#0D9488", bg: "#CCFBF1", border: "#5EEAD4" },
  completed: { color: "#16A34A", bg: "#DCFCE7", border: "#86EFAC" },
  closed: { color: "#334155", bg: "#F1F5F9", border: "#CBD5E1" },
  cancelled: { color: "#DC2626", bg: "#FEE2E2", border: "#FCA5A5" },
  not_completed: { color: "#B91C1C", bg: "#FEF2F2", border: "#FCA5A5" },
};

function markerTone(marker: MapMarker) {
  if (marker.missingLocation || marker.primaryWarningCode) {
    return { color: "#D97706", bg: "#FEF3C7", border: "#F59E0B" };
  }
  return STATUS_COLORS[marker.status] ?? STATUS_COLORS.scheduled;
}

function formatTimeRange(marker: Pick<MapMarker, "scheduledStart" | "scheduledEnd">): string {
  if (marker.scheduledStart && marker.scheduledEnd) {
    return `${marker.scheduledStart} - ${marker.scheduledEnd}`;
  }
  return marker.scheduledStart ?? marker.scheduledEnd ?? "Geen tijd";
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
    car: "Auto",
    bicycle: "Fiets",
    walking: "Lopend",
    moped_or_scooter: "Scooter",
    public_transport: "OV",
  };
  return labels[value] ?? value;
}

function snapStatusLabel(value: string | null): string {
  const labels: Record<string, string> = {
    ok: "OK",
    suggested: "Voorstel",
    outside_window: "Buiten tijdvak",
    missing_location: "Locatie ontbreekt",
    provider_error: "Routeprovider",
  };
  return value ? labels[value] ?? value : "Geen routecontext";
}

function mapCenter(markers: MapMarker[]): [number, number] {
  const visible = markers.filter((marker) => marker.coordinate);
  if (visible.length === 0) return [5.2913, 52.1326];
  const totals = visible.reduce(
    (acc, marker) => ({
      lng: acc.lng + marker.coordinate!.lng,
      lat: acc.lat + marker.coordinate!.lat,
    }),
    { lat: 0, lng: 0 },
  );
  return [totals.lng / visible.length, totals.lat / visible.length];
}

function createRouteFeatures(markers: MapMarker[], routes: PersonnelRoute[]) {
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  return routes
    .map((route) => {
      const coordinates = route.stops
        .map((stop) => markerById.get(stop.assignmentId)?.coordinate)
        .filter((coordinate): coordinate is Coordinate => Boolean(coordinate))
        .map((coordinate) => [coordinate.lng, coordinate.lat]);
      if (coordinates.length < 2) return null;
      return {
        type: "Feature" as const,
        properties: {
          personnelId: route.personnelId,
          personnelName: route.personnelName,
        },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));
}

export function PlanningMapView({ data }: PlanningMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerCleanupRef = useRef<(() => void)[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(data.markers[0]?.id ?? null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const selectedMarker = data.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const visibleMarkers = useMemo(
    () => data.markers.filter((marker) => marker.coordinate),
    [data.markers],
  );
  const routeFeatures = useMemo(
    () => createRouteFeatures(data.markers, data.personnelRoutes),
    [data.markers, data.personnelRoutes],
  );

  useEffect(() => {
    let cancelled = false;
    let mapInstance: unknown = null;

    async function bootMap() {
      if (!mapContainerRef.current || mapRef.current || data.accessDenied) return;
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !mapContainerRef.current) return;
        const map = new maplibre.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "OpenStreetMap",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
          center: mapCenter(data.markers),
          zoom: visibleMarkers.length > 0 ? 10 : 6,
          attributionControl: false,
        });
        map.addControl(new maplibre.NavigationControl({ visualizePitch: false }), "top-right");
        map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          if (cancelled) return;
          map.addSource("planning-routes", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: routeFeatures,
            },
          });
          map.addLayer({
            id: "planning-routes-line",
            type: "line",
            source: "planning-routes",
            paint: {
              "line-color": "#00B7B3",
              "line-opacity": 0.72,
              "line-width": 4,
            },
          });
          setMapReady(true);
        });
        mapRef.current = map;
        mapInstance = map;
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Kaart kon niet laden.");
      }
    }

    void bootMap();

    return () => {
      cancelled = true;
      markerCleanupRef.current.forEach((cleanup) => cleanup());
      markerCleanupRef.current = [];
      const map = (mapInstance ?? mapRef.current) as { remove?: () => void } | null;
      map?.remove?.();
      mapRef.current = null;
    };
  }, [data.accessDenied, data.markers, routeFeatures, visibleMarkers.length]);

  useEffect(() => {
    const map = mapRef.current as
      | {
          getSource?: (id: string) => { setData?: (data: unknown) => void } | undefined;
        }
      | null;
    if (!mapReady || !map) return;
    map.getSource?.("planning-routes")?.setData?.({
      type: "FeatureCollection",
      features: routeFeatures,
    });
  }, [mapReady, routeFeatures]);

  useEffect(() => {
    let cancelled = false;
    async function renderMarkers() {
      const map = mapRef.current as
        | {
            fitBounds?: (bounds: unknown, options?: unknown) => void;
          }
        | null;
      if (!mapReady || !map) return;
      const maplibre = await import("maplibre-gl");
      if (cancelled) return;

      markerCleanupRef.current.forEach((cleanup) => cleanup());
      markerCleanupRef.current = [];

      const bounds = new maplibre.LngLatBounds();
      visibleMarkers.forEach((marker) => {
        const tone = markerTone(marker);
        const node = document.createElement("button");
        node.type = "button";
        node.className =
          "flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400";
        node.style.background = tone.bg;
        node.style.borderColor = tone.border;
        node.style.color = tone.color;
        node.textContent = marker.code.replace(/^[^-]+-?/, "").slice(-2) || "M";
        node.setAttribute("aria-label", `${marker.code} openen`);
        node.addEventListener("click", () => setSelectedMarkerId(marker.id));

        const mapMarker = new maplibre.Marker({ element: node, anchor: "center" })
          .setLngLat([marker.coordinate!.lng, marker.coordinate!.lat])
          .addTo(map as never);
        bounds.extend([marker.coordinate!.lng, marker.coordinate!.lat]);
        markerCleanupRef.current.push(() => mapMarker.remove());
      });

      if (visibleMarkers.length === 1) {
        const marker = visibleMarkers[0];
        (map as { flyTo?: (options: unknown) => void }).flyTo?.({
          center: [marker.coordinate!.lng, marker.coordinate!.lat],
          zoom: 13,
          essential: true,
        });
      } else if (visibleMarkers.length > 1) {
        map.fitBounds?.(bounds, { padding: 60, maxZoom: 13, duration: 0 });
      }
    }

    void renderMarkers();
    return () => {
      cancelled = true;
    };
  }, [mapReady, visibleMarkers]);

  if (data.accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        U heeft geen planningrechten om kaartdata te bekijken.
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-600" />
              <h2 className="text-base font-semibold text-slate-950">Live dagkaart</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Markers, routecontext en ETA-waarschuwingen voor deze planningsdag.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{data.markers.length} werkbonnen</Badge>
            <Badge variant={data.warnings.length > 0 ? "secondary" : "outline"}>
              {data.warnings.length} waarschuwingen
            </Badge>
            <Badge variant="outline">{data.personnelRoutes.length} routes</Badge>
          </div>
        </div>

        {mapError ? (
          <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Kaart kon niet laden.</p>
                <p className="mt-1">{mapError}</p>
              </div>
            </div>
          </div>
        ) : data.markers.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Layers3 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-semibold text-slate-900">Geen kaartdata voor deze dag.</p>
            <p className="mt-1 text-sm text-slate-500">Plan werkbonnen op deze datum om markers en routes te zien.</p>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative min-h-[420px] bg-slate-100">
              <div ref={mapContainerRef} className="absolute inset-0" />
              {!mapReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                  <div className="rounded-lg border bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
                    Kaart laden...
                  </div>
                </div>
              )}
              {visibleMarkers.length === 0 && (
                <div className="absolute inset-x-4 top-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm">
                  Geen werkbonnen met bruikbare coordinaten. Gebruik object- of klantlocaties om markers te tonen.
                </div>
              )}
            </div>

            <aside className="border-t bg-slate-50 p-3 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Markers</p>
                <span className="text-xs text-slate-500">{data.missingLocationCount} zonder locatie</span>
              </div>
              <div className="mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1">
                {data.markers.map((marker) => {
                  const tone = markerTone(marker);
                  const active = marker.id === selectedMarkerId;
                  return (
                    <button
                      key={marker.id}
                      type="button"
                      onClick={() => setSelectedMarkerId(marker.id)}
                      className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-cyan-300 ${
                        active ? "ring-2 ring-cyan-300" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{marker.code} - {marker.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{marker.customerName || "Geen klant"} - {formatTimeRange(marker)}</p>
                        </div>
                        <span
                          className="h-3 w-3 rounded-full border"
                          style={{ background: tone.bg, borderColor: tone.border }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <AssignmentStatusBadge status={marker.status as never} />
                        {marker.missingLocation && <Badge variant="secondary">Geen locatie</Badge>}
                        {marker.primaryWarningCode && <Badge variant="secondary">Waarschuwing</Badge>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-cyan-600" />
            <h2 className="font-semibold text-slate-950">Routepaneel</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Per medewerker de volgorde, reistijd en afstand.</p>
          <div className="mt-4 space-y-3">
            {data.personnelRoutes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Nog geen routes beschikbaar.
              </p>
            ) : (
              data.personnelRoutes.map((route) => (
                <div key={route.personnelId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-950">{route.personnelName}</p>
                      <p className="text-xs text-slate-500">{vehicleLabel(route.vehicleType)} - {route.region ?? "Geen regio"}</p>
                    </div>
                    {route.warningCount > 0 && <Badge variant="secondary">{route.warningCount} waarschuwing</Badge>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-white p-2">
                      <p className="text-slate-500">Reistijd</p>
                      <p className="font-semibold text-slate-900">{formatDuration(route.totalTravelDurationSeconds)}</p>
                    </div>
                    <div className="rounded-md bg-white p-2">
                      <p className="text-slate-500">Afstand</p>
                      <p className="font-semibold text-slate-900">{formatDistance(route.totalTravelDistanceMeters)}</p>
                    </div>
                  </div>
                  <ol className="mt-3 space-y-2">
                    {route.stops.map((stop, index) => (
                      <li key={`${route.personnelId}-${stop.assignmentId}`} className="flex gap-2 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedMarkerId(stop.assignmentId)}
                          className="min-w-0 text-left hover:underline"
                        >
                          <span className="block truncate font-medium text-slate-900">{stop.code}</span>
                          <span className="block truncate text-xs text-slate-500">{snapStatusLabel(stop.snapStatus)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold text-slate-950">Warnings</h2>
          </div>
          {data.warnings.length === 0 ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Geen route- of locatieblokkades.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.warnings.map((warning) => (
                <button
                  key={`${warning.assignmentId}-${warning.personnelId ?? "assignment"}-${warning.warningCode}`}
                  type="button"
                  onClick={() => setSelectedMarkerId(warning.assignmentId)}
                  className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-950"
                >
                  <span className="font-semibold">{warning.code}</span>
                  <span className="mt-1 block">{warning.warningMessage}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <Sheet open={Boolean(selectedMarker)} onOpenChange={(open) => !open && setSelectedMarkerId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selectedMarker && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedMarker.code} - {selectedMarker.title}</SheetTitle>
                <SheetDescription>
                  {selectedMarker.customerName || "Geen klant"} - {formatTimeRange(selectedMarker)}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap gap-2">
                  <AssignmentStatusBadge status={selectedMarker.status as never} />
                  <AssignmentPriorityBadge priority={selectedMarker.priority as never} />
                  {selectedMarker.coordinate ? (
                    <Badge variant="outline">
                      <LocateFixed className="mr-1 h-3 w-3" />
                      {selectedMarker.coordinate.source === "object" ? "Objectlocatie" : "Klantlocatie"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Geen locatie</Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard icon={<Clock className="h-4 w-4" />} label="Planning" value={formatTimeRange(selectedMarker)} />
                  <InfoCard icon={<Navigation className="h-4 w-4" />} label="Status" value={statusLabel(selectedMarker.status as never)} />
                  <InfoCard icon={<MapPin className="h-4 w-4" />} label="Object" value={selectedMarker.objectName ?? "Geen object"} />
                  <InfoCard icon={<Car className="h-4 w-4" />} label="Regio" value={selectedMarker.requiredRegion ?? "Geen regio"} />
                </div>

                {selectedMarker.primaryWarningMessage && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Routewaarschuwing</p>
                    <p className="mt-1">{selectedMarker.primaryWarningMessage}</p>
                  </div>
                )}

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">Gekoppeld personeel</h3>
                  <div className="mt-2 space-y-2">
                    {selectedMarker.assignedPersonnel.map((person) => (
                      <div key={person.id} className="rounded-lg border bg-slate-50 p-3">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-cyan-700" />
                          <p className="font-medium text-slate-900">{person.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{vehicleLabel(person.vehicleType)} - {person.region ?? "Geen regio"}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">Routecontext</h3>
                  <div className="mt-2 space-y-2">
                    {selectedMarker.routeContexts.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">Nog geen routecontext berekend.</p>
                    ) : (
                      selectedMarker.routeContexts.map((context) => (
                        <div key={`${context.personnelId}-${context.id ?? "context"}`} className="rounded-lg border bg-white p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">{snapStatusLabel(context.snapStatus)}</p>
                              <p className="text-xs text-slate-500">
                                Buffer {context.bufferMinutes} min - {formatDuration(context.travelDurationSeconds ?? 0)} - {formatDistance(context.travelDistanceMeters ?? 0)}
                              </p>
                            </div>
                            {context.snapSuggestedStart && (
                              <Badge variant="secondary">{context.snapSuggestedStart} voorstel</Badge>
                            )}
                          </div>
                          {context.warningMessage && (
                            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">{context.warningMessage}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <Button asChild className="w-full">
                  <Link href={`/assignments/${selectedMarker.id}`}>Werkbon openen</Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
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
