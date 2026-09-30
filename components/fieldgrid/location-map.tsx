"use client";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/addresses/model";
import "maplibre-gl/dist/maplibre-gl.css";

export function LocationMap({
  point,
  onMove,
  geometry,
}: {
  point: Point;
  onMove?: (point: Point) => void;
  geometry?: { type: "LineString"; coordinates: number[][] };
}) {
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onMove);
  const [error, setError] = useState(false);
  useEffect(() => {
    callback.current = onMove;
  }, [onMove]);
  const longitude = point[0],
    latitude = point[1];
  useEffect(() => {
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    void import("maplibre-gl")
      .then((m) => {
        if (disposed || !container.current) return;
        m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        try {
          map = new m.Map({
            container: container.current,
            style: "https://tiles.openfreemap.org/styles/liberty",
            center: [longitude, latitude],
            zoom: 15,
            attributionControl: { compact: true },
          });
          map.addControl(new m.NavigationControl(), "top-right");
          const marker = new m.Marker({ draggable: Boolean(callback.current) })
            .setLngLat([longitude, latitude])
            .addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            callback.current?.([
              Number(p.lng.toFixed(6)),
              Number(p.lat.toFixed(6)),
            ]);
          });
          map.on("error", () => setError(true));
          map.on("load", () => {
            if (!map || !geometry) return;
            map.addSource("route", {
              type: "geojson",
              data: { type: "Feature", properties: {}, geometry },
            });
            map.addLayer({
              id: "route",
              type: "line",
              source: "route",
              paint: {
                "line-color": container.current
                  ? getComputedStyle(container.current)
                      .getPropertyValue("--brand-action")
                      .trim() || "#276c84"
                  : "#276c84",
                "line-width": 5,
              },
            });
            const bounds = new m.LngLatBounds();
            geometry.coordinates.forEach((c) => bounds.extend([c[0], c[1]]));
            map.fitBounds(bounds, { padding: 35, duration: 0, maxZoom: 16 });
          });
        } catch {
          setError(true);
        }
      })
      .catch(() => setError(true));
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [longitude, latitude, geometry]);
  return (
    <div className="location-map">
      <div
        ref={container}
        className="location-map-canvas"
        aria-label={
          onMove
            ? "Kaart: versleep de aankomstmarker of gebruik de coördinaatvelden"
            : "Kaart van de locatie of route"
        }
      />
      {error && (
        <p role="status">
          Kaart niet beschikbaar. De adresgegevens en coördinaatvelden blijven
          bruikbaar.
        </p>
      )}
      <small>
        Kaart: OpenFreeMap · OpenMapTiles · © OpenStreetMap-bijdragers. Geen
        live verkeer of tracking.
      </small>
    </div>
  );
}
