import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Sprint 5 loader is singleton, lazy and browser-key only", () => {
  const loader = read("artifacts/backoffice/src/lib/google-maps/client-loader.ts");
  const config = read("artifacts/backoffice/src/lib/google-maps/config.ts");

  assert.match(loader, /FIELDGRID_GOOGLE_MAPS_SCRIPT_ID/);
  assert.match(loader, /window\.__fieldgridGoogleMapsLoader/);
  assert.match(loader, /https:\/\/maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(loader, /script\.async = true/);
  assert.match(loader, /script\.defer = true/);
  assert.match(config, /browserApiKey: config\.browserApiKey/);
  assert.doesNotMatch(loader, /GOOGLE_MAPS_SERVER_API_KEY/);
});

test("Sprint 5 map component handles advanced markers, status semantics and fallback states", () => {
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(canvas, /IntersectionObserver/);
  assert.match(canvas, /AdvancedMarkerElement/);
  assert.match(canvas, /PinElement/);
  assert.match(canvas, /GOOGLE_MAPS_MARKER_STATUS/);
  assert.match(canvas, /fitBounds/);
  assert.match(canvas, /minZoom/);
  assert.match(canvas, /maxZoom/);
  assert.match(canvas, /LoadingState/);
  assert.match(canvas, /EmptyState/);
  assert.match(canvas, /ErrorState/);
  assert.match(canvas, /Opnieuw proberen/);
  assert.match(canvas, /aria-label/);
});

test("Sprint 5 map updates markers and polylines without recreating the map instance", () => {
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(canvas, /mapRef = useRef/);
  assert.match(canvas, /markerRefs = useRef/);
  assert.match(canvas, /polylineRefs = useRef/);
  assert.match(canvas, /markerRefs\.current\.forEach/);
  assert.match(canvas, /polylineRefs\.current\.forEach/);
  assert.match(canvas, /validMarkers\.forEach/);
  assert.match(canvas, /polylines[\s\S]*\.forEach/);
  assert.match(canvas, /loadGoogleMapsJavaScriptApi[\s\S]*retryNonce,\s*\]\);/);
});
