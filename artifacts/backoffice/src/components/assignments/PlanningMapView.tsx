"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Car,
  Clock,
  Info,
  Layers3,
  LocateFixed,
  MapPin,
  Navigation,
  UserRound,
} from "lucide-react";

import { applyRouteTimeSuggestion } from "@/app/actions/assignments";
import { AssignmentPriorityBadge, AssignmentStatusBadge, statusLabel } from "./AssignmentStatusBadge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  canApplySuggestions?: boolean;
  dateLabel?: string;
};

type PendingSuggestion = {
  marker: MapMarker;
  context: MapRouteContext;
  personnelName: string;
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
  return STATUS_COLORS[marker.status] ?? STATUS_COLORS.scheduled;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimeRange(marker: Pick<MapMarker, "scheduledStart" | "scheduledEnd">): string {
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
    car: "Auto",
    bicycle: "Fiets",
    walking: "Lopend",
    moped_or_scooter: "Scooter",
    public_transport: "OV",
  };
  return labels[value] ?? value;
}

function formatObjectAddress(marker: Pick<MapMarker, "objectAddress" | "objectPostalCode" | "objectCity">): string {
  return [
    marker.objectAddress,
    [marker.objectPostalCode, marker.objectCity].filter(Boolean).join(" "),
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ") || "Geen adres bekend";
}

function personnelSummary(marker: Pick<MapMarker, "assignedPersonnel">): string {
  return marker.assignedPersonnel.map((person) => person.name).join(", ") || "Geen personeel gekoppeld";
}

function markerPopupHtml(marker: MapMarker): string {
  return `
    <div class="text-sm" style="min-width:220px;max-width:280px">
      <p class="font-semibold text-slate-950">${escapeHtml(marker.code)} - ${escapeHtml(marker.title)}</p>
      <p class="mt-1 text-xs text-slate-500">${escapeHtml(formatTimeRange(marker))}</p>
      <div class="mt-2 space-y-1 text-xs text-slate-700">
        <p><span class="font-medium text-slate-900">Object:</span> ${escapeHtml(marker.objectName ?? "Geen object")}</p>
        <p><span class="font-medium text-slate-900">Adres:</span> ${escapeHtml(formatObjectAddress(marker))}</p>
        <p><span class="font-medium text-slate-900">Medewerkers:</span> ${escapeHtml(personnelSummary(marker))}</p>
      </div>
    </div>
  `;
}

function snapStatusLabel(value: string | null): string {
  const labels: Record<string, string> = {
    ok: "OK",
    suggested: "Voorstel",
    outside_window: "Buiten tijdvak",
    missing_location: "Locatie ontbreekt",
    provider_error: "Routeprovider",
  };
  return value ? labels[value] ?? value : "Geen route-info";
}

function routeContextCanApply(context: MapRouteContext): boolean {
  if (!context.id || !context.snapSuggestedStart) return false;
  return context.warningCode !== "missing_location" && context.warningCode !== "provider_error";
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
      <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
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
        <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0">
          {children}
        </PopoverContent>
      </div>
    </Popover>
  );
}

export function PlanningMapView({ data, canApplySuggestions = false, dateLabel }: PlanningMapViewProps) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerCleanupRef = useRef<(() => void)[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isApplyingSuggestion, startApplySuggestionTransition] = useTransition();

  const selectedMarker = data.markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const visibleMarkers = useMemo(
    () => data.markers.filter((marker) => marker.coordinate),
    [data.markers],
  );
  const routeFeatures = useMemo(
    () => createRouteFeatures(data.markers, data.personnelRoutes),
    [data.markers, data.personnelRoutes],
  );

  function personnelNameForContext(marker: MapMarker, context: MapRouteContext): string {
    return marker.assignedPersonnel.find((person) => person.id === context.personnelId)?.name ?? "Gekoppeld personeel";
  }

  function focusMarker(marker: MapMarker, options: { openDrawer?: boolean } = {}) {
    setHighlightedMarkerId(marker.id);
    if (options.openDrawer) setSelectedMarkerId(marker.id);
    if (marker.coordinate) {
      (mapRef.current as { flyTo?: (options: unknown) => void } | null)?.flyTo?.({
        center: [marker.coordinate.lng, marker.coordinate.lat],
        zoom: 15,
        essential: true,
      });
    }
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
      const result = await applyRouteTimeSuggestion({ routeContextId, assignmentId });
      if (!result.success) {
        setSuggestionMessage({ tone: "error", text: result.message });
        return;
      }
      setSuggestionMessage({
        tone: "success",
        text: result.warning ?? "Tijdvoorstel toegepast. De planning is bijgewerkt.",
      });
      setPendingSuggestion(null);
      router.refresh();
    });
  }

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
          map.resize();
          window.setTimeout(() => map.resize(), 100);
          window.setTimeout(() => map.resize(), 350);
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
          resize?: () => void;
        }
      | null;
    if (!mapReady || !map) return;
    map.resize?.();
    map.getSource?.("planning-routes")?.setData?.({
      type: "FeatureCollection",
      features: routeFeatures,
    });
  }, [mapReady, routeFeatures]);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    const map = mapRef.current as { resize?: () => void } | null;
    const resize = () => map?.resize?.();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mapContainerRef.current);
    window.setTimeout(resize, 150);
    return () => observer.disconnect();
  }, [mapReady]);

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
        const highlighted = marker.id === highlightedMarkerId;
        const node = document.createElement("button");
        node.type = "button";
        node.className =
          "planning-waypoint-marker flex h-11 w-11 items-center justify-center rounded-full transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-400";
        node.style.position = "relative";
        node.style.zIndex = "20";
        node.style.border = "0";
        node.style.background = "transparent";
        node.style.padding = "0";
        node.style.cursor = "pointer";
        node.style.transform = highlighted ? "scale(1.25)" : "scale(1)";
        node.style.filter = highlighted
          ? "drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 12px rgba(0,183,179,0.65))"
          : "drop-shadow(0 4px 8px rgba(8,29,58,0.25))";
        node.style.color = tone.color;
        node.innerHTML = `
          <svg viewBox="0 0 24 24" style="width:44px;height:44px;display:block" fill="currentColor" aria-hidden="true">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" />
            <circle cx="12" cy="9" r="3.1" fill="white" />
          </svg>
        `;
        node.setAttribute("aria-label", `${marker.code} openen`);
        node.addEventListener("click", () => focusMarker(marker, { openDrawer: true }));

        const mapMarker = new maplibre.Marker({ element: node, anchor: "bottom" })
          .setLngLat([marker.coordinate!.lng, marker.coordinate!.lat])
          .addTo(map as never);
        const popup = new maplibre.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 18,
          className: "planning-marker-popup",
        }).setHTML(markerPopupHtml(marker));
        const showPopup = () => {
          popup.setLngLat([marker.coordinate!.lng, marker.coordinate!.lat]).addTo(map as never);
        };
        node.title = `${marker.code} - ${marker.title}\n${formatObjectAddress(marker)}\n${personnelSummary(marker)}`;
        node.addEventListener("mouseenter", showPopup);
        node.addEventListener("pointerenter", showPopup);
        node.addEventListener("mouseleave", () => popup.remove());
        node.addEventListener("pointerleave", () => popup.remove());
        node.addEventListener("focus", showPopup);
        node.addEventListener("blur", () => popup.remove());
        bounds.extend([marker.coordinate!.lng, marker.coordinate!.lat]);
        markerCleanupRef.current.push(() => {
          popup.remove();
          mapMarker.remove();
        });
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
  }, [highlightedMarkerId, mapReady, visibleMarkers]);

  if (data.accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        U heeft geen planningrechten om kaartdata te bekijken.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-visible rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-600" />
              <h2 className="text-base font-semibold text-slate-950">Live dagkaart</h2>
            </div>
            {dateLabel ? (
              <p className="mt-1 text-sm font-medium capitalize text-slate-600">{dateLabel}</p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Werkbonnen, route-informatie en waarschuwingen voor deze planningsdag.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OverlayChip label="werkbonnen" count={data.markers.length}>
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">Werkbonnen deze dag</p>
                <p className="text-xs text-slate-500">Klik een werkbon om de waypoint uit te lichten.</p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {data.markers.length > 0 ? (
                  data.markers.map((marker) => (
                    <div key={marker.id} className="rounded-md p-2 hover:bg-slate-50">
                      <button
                        type="button"
                        onClick={() => focusMarker(marker)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{marker.code} - {marker.title}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{formatObjectAddress(marker)}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{personnelSummary(marker)}</p>
                          </div>
                          <span
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{ background: markerTone(marker).color }}
                          />
                        </div>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <AssignmentStatusBadge status={marker.status as never} />
                        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                          <Link href={`/assignments/${marker.id}`}>Openen</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-3 text-sm text-slate-500">Geen werkbonnen voor deze dag.</p>
                )}
              </div>
            </OverlayChip>

            <OverlayChip label="waarschuwingen" count={data.warnings.length}>
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold text-slate-950">Waarschuwingen</p>
                <p className="text-xs text-slate-500">Route- en locatieblokkades voor deze dag.</p>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {data.warnings.length > 0 ? (
                  data.warnings.map((warning) => (
                    <button
                      key={`${warning.assignmentId}-${warning.personnelId ?? "assignment"}-${warning.warningCode}`}
                      type="button"
                      onClick={() => {
                        const marker = data.markers.find((item) => item.id === warning.assignmentId);
                        if (marker) focusMarker(marker);
                      }}
                      className="block w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-950"
                    >
                      <span className="font-semibold">{warning.code}</span>
                      <span className="mt-1 block text-xs">{warning.warningMessage}</span>
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
                <p className="text-xs text-slate-500">Reistijd en afstand per medewerker.</p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {data.personnelRoutes.length > 0 ? (
                  data.personnelRoutes.map((route) => (
                    <div key={route.personnelId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
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
                      <ol className="mt-3 space-y-1.5">
                        {route.stops.map((stop, index) => (
                          <li key={`${route.personnelId}-${stop.assignmentId}`} className="flex gap-2 text-sm">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const marker = data.markers.find((item) => item.id === stop.assignmentId);
                                if (marker) focusMarker(marker);
                              }}
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
                ) : (
                  <p className="p-3 text-sm text-slate-500">Nog geen routes beschikbaar.</p>
                )}
              </div>
            </OverlayChip>
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
          <div>
            <div className="relative h-[calc(100vh-13rem)] min-h-[620px] overflow-hidden bg-slate-100">
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
                  Geen werkbonnen met bruikbare coordinaten. Vul objectlocaties aan om markers te tonen.
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
                      Objectlocatie
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
                  <h3 className="text-sm font-semibold text-slate-950">Opdrachtinformatie</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <InfoCard icon={<Info className="h-4 w-4" />} label="Titel" value={selectedMarker.title} />
                    <InfoCard icon={<Clock className="h-4 w-4" />} label="Tijdvak" value={formatTimeRange(selectedMarker)} />
                    <InfoCard icon={<Navigation className="h-4 w-4" />} label="Status" value={statusLabel(selectedMarker.status as never)} />
                    <InfoCard icon={<Car className="h-4 w-4" />} label="Prioriteit" value={selectedMarker.priority} />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-950">Adresgegevens</h3>
                  <div className="mt-2 rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-cyan-700" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{selectedMarker.objectName ?? "Geen object"}</p>
                        <p className="mt-1 text-sm text-slate-700">{formatObjectAddress(selectedMarker)}</p>
                        <p className="mt-1 text-xs text-slate-500">{selectedMarker.customerName || "Geen klant"}</p>
                      </div>
                    </div>
                  </div>
                </section>

                {selectedMarker.routeContexts.some((context) => context.snapSuggestedStart) && (
                  <section>
                    <h3 className="text-sm font-semibold text-slate-950">Tijdvoorstellen</h3>
                    <div className="mt-2 space-y-2">
                      {selectedMarker.routeContexts
                        .filter((context) => context.snapSuggestedStart)
                        .map((context) => (
                          <div key={`${context.personnelId}-${context.id ?? "context"}`} className="rounded-lg border border-cyan-100 bg-cyan-50 p-3 text-sm">
                            <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                              <div>
                                <p className="font-medium uppercase text-slate-500">Huidig</p>
                                <p className="mt-1 font-semibold text-slate-950">
                                  {formatTimeWindow(selectedMarker.scheduledStart, selectedMarker.scheduledEnd)}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium uppercase text-slate-500">Voorstel</p>
                                <p className="mt-1 font-semibold text-slate-950">
                                  {formatTimeWindow(context.snapSuggestedStart, context.snapSuggestedEnd)}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full bg-white"
                              disabled={!canApplySuggestions || !routeContextCanApply(context)}
                              onClick={() => openSuggestionDialog(selectedMarker, context)}
                            >
                              Voorstel toepassen
                            </Button>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                <Button asChild className="w-full">
                  <Link href={`/assignments/${selectedMarker.id}`}>Werkbon openen</Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(pendingSuggestion)} onOpenChange={(open) => !open && setPendingSuggestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tijdvoorstel toepassen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  Fieldgrid past routevoorstellen nooit automatisch toe. Controleer de wijziging voordat u de planning bijwerkt.
                </p>
                {pendingSuggestion && (
                  <div className="rounded-lg border bg-slate-50 p-3 text-slate-900">
                    <p className="font-semibold">{pendingSuggestion.marker.code} - {pendingSuggestion.marker.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{pendingSuggestion.personnelName}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md bg-white p-2">
                        <p className="text-xs font-medium uppercase text-slate-500">Van</p>
                        <p className="font-semibold">
                          {formatTimeWindow(pendingSuggestion.marker.scheduledStart, pendingSuggestion.marker.scheduledEnd)}
                        </p>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <p className="text-xs font-medium uppercase text-slate-500">Naar</p>
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
                  <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">{suggestionMessage.text}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingSuggestion}>Annuleren</AlertDialogCancel>
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
