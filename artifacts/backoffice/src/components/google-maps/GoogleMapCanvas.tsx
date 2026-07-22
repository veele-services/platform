"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, MapPinned, RotateCcw } from "lucide-react";

import { loadGoogleMapsJavaScriptApi } from "@/lib/google-maps/client-loader";
import {
  GOOGLE_MAPS_MARKER_STATUS,
  type FieldgridMarkerStatus,
} from "@/lib/google-maps/marker-status";
import { cn } from "@/lib/utils";
import { backofficePath } from "@/lib/backoffice-paths";

type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => GoogleMapInstance;
    LatLngBounds: new () => GoogleLatLngBounds;
    Polyline: new (options: Record<string, unknown>) => GooglePolyline;
    event?: {
      clearInstanceListeners?: (instance: unknown) => void;
    };
    importLibrary?: (library: string) => Promise<Record<string, unknown>>;
  };
};

type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
  setCenter: (position: GoogleMapPosition) => void;
  setZoom: (zoom: number) => void;
};

type GoogleLatLngBounds = {
  extend: (position: GoogleMapPosition) => void;
};

type GoogleAdvancedMarker = {
  map: GoogleMapInstance | null;
  position?: GoogleMapPosition;
  title?: string;
  content?: HTMLElement;
  addListener?: (eventName: string, handler: () => void) => { remove?: () => void };
};

type GooglePinElement = {
  element: HTMLElement;
};

type GooglePolyline = {
  setMap: (map: GoogleMapInstance | null) => void;
};

export type GoogleMapPosition = {
  lat: number;
  lng: number;
};

export type GoogleMapMarker = {
  id: string;
  position: GoogleMapPosition;
  status: FieldgridMarkerStatus;
  title: string;
  ariaLabel: string;
  selected?: boolean;
};

export type GoogleMapPolyline = {
  id: string;
  path: GoogleMapPosition[];
  color?: string;
};

export type GoogleMapCanvasConfig = {
  enabled: boolean;
  browserApiKey: string | null;
  mapId: string | null;
  language: string;
  region: string;
};

type GoogleMapCanvasProps = {
  config: GoogleMapCanvasConfig;
  markers: GoogleMapMarker[];
  polylines?: GoogleMapPolyline[];
  selectedMarkerId?: string | null;
  onMarkerSelect?: (markerId: string) => void;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  defaultCenter?: GoogleMapPosition;
  defaultZoom?: number;
  fitBoundsPadding?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  visible?: boolean;
};

type MarkerLibrary = {
  AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleAdvancedMarker;
  PinElement: new (options: Record<string, unknown>) => GooglePinElement;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const DEFAULT_CENTER = { lat: 52.1326, lng: 5.2913 };
const DEFAULT_ZOOM = 7;
const DEFAULT_MIN_ZOOM = 6;
const DEFAULT_MAX_ZOOM = 19;

function isValidPosition(position: GoogleMapPosition): boolean {
  return (
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    position.lat >= -90 &&
    position.lat <= 90 &&
    position.lng >= -180 &&
    position.lng <= 180
  );
}

function markerGlyph(status: FieldgridMarkerStatus): string {
  const definition = GOOGLE_MAPS_MARKER_STATUS[status];
  switch (definition.icon) {
    case "check":
      return "v";
    case "warning":
      return "!";
    case "triangle":
      return ">";
    case "diamond":
      return "*";
    case "square":
      return "s";
    case "circle":
    default:
      return "o";
  }
}

function createMarkerElement(
  marker: GoogleMapMarker,
  markerLibrary: MarkerLibrary,
): HTMLElement {
  const definition = GOOGLE_MAPS_MARKER_STATUS[marker.status];
  const pin = new markerLibrary.PinElement({
    background: definition.color,
    borderColor: definition.borderColor,
    glyph: markerGlyph(marker.status),
    glyphColor: "#FFFFFF",
    scale: marker.selected ? 1.2 : 1,
  });

  pin.element.setAttribute("role", "button");
  pin.element.setAttribute("tabindex", "0");
  pin.element.setAttribute("aria-label", marker.ariaLabel);
  pin.element.dataset.fieldgridMarkerStatus = marker.status;
  pin.element.dataset.fieldgridMarkerLabel = definition.label;
  return pin.element;
}

function LoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
        Google Maps laden...
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="absolute inset-4 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/90 p-6 text-center shadow-sm">
      <div>
        <MapPinned className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 font-semibold text-slate-950">{title}</p>
        <p className="mt-1 max-w-lg text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="absolute inset-4 flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-950 shadow-sm">
      <div>
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
        <p className="mt-3 font-semibold">{title}</p>
        <p className="mt-1 max-w-lg text-sm">{description}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100"
          >
            <RotateCcw className="h-4 w-4" />
            Opnieuw proberen
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function GoogleMapCanvas({
  config,
  markers,
  polylines = [],
  selectedMarkerId,
  onMarkerSelect,
  className,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = DEFAULT_ZOOM,
  fitBoundsPadding = 64,
  emptyTitle = "Geen kaartpunten",
  emptyDescription = "Er zijn geen locaties beschikbaar om op de kaart te tonen.",
  visible = true,
}: GoogleMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerLibraryRef = useRef<MarkerLibrary | null>(null);
  const markerRefs = useRef<Map<string, GoogleAdvancedMarker>>(new Map());
  const polylineRefs = useRef<Map<string, GooglePolyline>>(new Map());
  const markerListenerCleanupRef = useRef<Array<() => void>>([]);
  const usageRecordedRef = useRef(false);
  const [state, setState] = useState<LoadState>("idle");
  const [isInView, setIsInView] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const validMarkers = useMemo(
    () => markers.filter((marker) => isValidPosition(marker.position)),
    [markers],
  );
  const validPolylinePositions = useMemo(
    () =>
      polylines
        .flatMap((polyline) => polyline.path)
        .filter((position): position is GoogleMapPosition =>
          isValidPosition(position),
        ),
    [polylines],
  );

  const canLoad =
    visible &&
    isInView &&
    config.enabled &&
    Boolean(config.browserApiKey) &&
    Boolean(config.mapId);

  useEffect(() => {
    if (!visible || !containerRef.current) return;

    if (!("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
          observerRef.current?.disconnect();
          observerRef.current = null;
        }
      },
      { rootMargin: "160px" },
    );
    observerRef.current.observe(containerRef.current);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (!canLoad || !containerRef.current) return;

    let cancelled = false;
    setState("loading");

    loadGoogleMapsJavaScriptApi({
      apiKey: config.browserApiKey!,
      mapId: config.mapId,
      language: config.language,
      region: config.region,
      libraries: ["marker"],
    })
      .then(async (loadedGoogle) => {
        if (cancelled || !containerRef.current) return;
        const googleApi = loadedGoogle as GoogleMapsApi;
        const markerLibrary =
          (await googleApi.maps.importLibrary?.("marker")) as MarkerLibrary | undefined;
        if (!markerLibrary?.AdvancedMarkerElement || !markerLibrary?.PinElement) {
          throw new Error("Google Maps marker library ontbreekt.");
        }

        markerLibraryRef.current = markerLibrary;
        mapRef.current = new googleApi.maps.Map(containerRef.current, {
          center: defaultCenter,
          zoom: defaultZoom,
          minZoom,
          maxZoom,
          mapId: config.mapId,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          rotateControl: false,
          gestureHandling: "greedy",
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      markerListenerCleanupRef.current.forEach((cleanup) => cleanup());
      markerListenerCleanupRef.current = [];
      markerRefs.current.forEach((marker) => {
        marker.map = null;
      });
      markerRefs.current.clear();
      polylineRefs.current.forEach((polyline) => polyline.setMap(null));
      polylineRefs.current.clear();
      mapRef.current = null;
      markerLibraryRef.current = null;
    };
  }, [
    canLoad,
    config.browserApiKey,
    config.language,
    config.mapId,
    config.region,
    defaultCenter,
    defaultZoom,
    maxZoom,
    minZoom,
    retryNonce,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLibrary = markerLibraryRef.current;
    if (!map || !markerLibrary || state !== "ready") return;

    markerListenerCleanupRef.current.forEach((cleanup) => cleanup());
    markerListenerCleanupRef.current = [];
    markerRefs.current.forEach((marker) => {
      marker.map = null;
    });
    markerRefs.current.clear();

    validMarkers.forEach((marker) => {
      const content = createMarkerElement(
        { ...marker, selected: marker.id === selectedMarkerId },
        markerLibrary,
      );
      const advancedMarker = new markerLibrary.AdvancedMarkerElement({
        map,
        position: marker.position,
        title: marker.title,
        content,
        gmpClickable: true,
      });

      const select = () => onMarkerSelect?.(marker.id);
      const listener = advancedMarker.addListener?.("click", select);
      content.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });
      markerListenerCleanupRef.current.push(() => listener?.remove?.());
      markerRefs.current.set(marker.id, advancedMarker);
    });

    const boundsPositions = [
      ...validMarkers.map((marker) => marker.position),
      ...validPolylinePositions,
    ];

    if (boundsPositions.length > 1) {
      const bounds = new (window.google as GoogleMapsApi).maps.LatLngBounds();
      boundsPositions.forEach((position) => bounds.extend(position));
      map.fitBounds(bounds, fitBoundsPadding);
    } else if (boundsPositions.length === 1) {
      map.setCenter(boundsPositions[0]!);
      map.setZoom(Math.max(12, defaultZoom));
    } else {
      map.setCenter(defaultCenter);
      map.setZoom(defaultZoom);
    }
  }, [
    defaultCenter,
    defaultZoom,
    fitBoundsPadding,
    onMarkerSelect,
    selectedMarkerId,
    state,
    validMarkers,
    validPolylinePositions,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;

    polylineRefs.current.forEach((polyline) => polyline.setMap(null));
    polylineRefs.current.clear();

    polylines
      .filter((polyline) => polyline.path.length > 1)
      .forEach((polyline) => {
        const line = new (window.google as GoogleMapsApi).maps.Polyline({
          path: polyline.path,
          geodesic: true,
          strokeColor: polyline.color ?? "#00B7B3",
          strokeOpacity: 0.78,
          strokeWeight: 4,
          map,
        });
        polylineRefs.current.set(polyline.id, line);
      });
  }, [polylines, state]);

  useEffect(() => {
    if (state !== "ready" || usageRecordedRef.current) return;
    usageRecordedRef.current = true;
    void fetch(backofficePath("/backoffice-api/google-maps/usage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "maps_view_opened",
        estimatedSku: "maps_javascript_api_dynamic_map",
        metadata: {
          surface: "planning_map",
          markerCount: validMarkers.length,
          polylineCount: polylines.length,
        },
      }),
      keepalive: true,
    }).catch(() => {
      usageRecordedRef.current = false;
    });
  }, [polylines.length, state, validMarkers.length]);

  const showConfigError =
    visible &&
    (!config.enabled || !config.browserApiKey || !config.mapId);

  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      <div
        ref={containerRef}
        className="h-full min-h-[320px] w-full"
        data-fieldgrid-google-map="planning"
        data-google-map-lazy={isInView ? "loaded" : "waiting"}
      />

      {showConfigError ? (
        <ErrorState
          title="Google Maps is niet geconfigureerd"
          description="Controleer de browser API key en Map ID. De planningdata blijft beschikbaar in de lijsten en detailpanelen."
        />
      ) : null}

      {!showConfigError && state === "loading" ? <LoadingState /> : null}

      {!showConfigError && state === "error" ? (
        <ErrorState
          title="Google Maps kon niet laden"
          description="Controleer de netwerkverbinding of probeer opnieuw. Werkbondata blijft beschikbaar buiten de kaart."
          onRetry={() => {
            setState("idle");
            setRetryNonce((value) => value + 1);
          }}
        />
      ) : null}

      {!showConfigError && state === "ready" && validMarkers.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
    </div>
  );
}
