#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const options = parseArgs(process.argv.slice(2));
const outputDir =
  options.outDir ||
  process.env.FIELDGRID_GOOGLE_MAPS_SPRINT14_OUT_DIR ||
  join(process.cwd(), "outputs", "google-maps-sprint14-acceptance");

const checks = [
  checkPackageScripts(),
  checkSprintCoverage(),
  checkGoogleMapsRuntimeContract(),
  checkPlacesContract(),
  checkRoutesContract(),
  checkUsageAndRateLimitContract(),
  checkSecurityAndLegacyCleanup(),
  checkDocsContract(),
  checkPlaywrightSmokeContract(),
  checkEvidence(),
];

const failures = checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);
const warnings = checks.flatMap((check) =>
  check.warnings.map((warning) => ({ check: check.id, ...warning })),
);

const report = {
  version: "fieldgrid-google-maps-sprint14-acceptance-v1",
  createdAt: new Date().toISOString(),
  mode: options.check ? "check" : "full",
  strictEvidence: options.strictEvidence,
  status: failures.length === 0 ? "passed" : "failed",
  checks,
  warnings,
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "sprint14-acceptance.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  console.error(`Fieldgrid Google Maps sprint 14 acceptance failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Fieldgrid Google Maps sprint 14 acceptance passed. Report: ${reportPath}`);

function parseArgs(argv) {
  const parsed = {
    check: false,
    strictEvidence: false,
    outDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--check":
        parsed.check = true;
        break;
      case "--strict-evidence":
        parsed.strictEvidence = true;
        break;
      case "--out":
      case "--out-dir":
        parsed.outDir = resolve(process.cwd(), nextValue());
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Fieldgrid Google Maps sprint 14 acceptance

Usage:
  node scripts/fieldgrid-google-maps-sprint14-acceptance.mjs --check
  node scripts/fieldgrid-google-maps-playwright-smoke.mjs --mock
  node scripts/fieldgrid-google-maps-sprint14-acceptance.mjs --check --strict-evidence
`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  return existsSync(path);
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function warning(message, evidence = null) {
  return { message, evidence };
}

function check(id, label, failures, warnings = []) {
  return {
    id,
    label,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    warnings,
  };
}

function expectFileContains(path, expectations) {
  const failures = [];
  if (!fileExists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string"
      ? text.includes(expectation.pattern)
      : expectation.pattern.test(text);
    if (!found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function expectFileNotContains(path, expectations) {
  const failures = [];
  if (!fileExists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string"
      ? text.includes(expectation.pattern)
      : expectation.pattern.test(text);
    if (found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function checkPackageScripts() {
  return check("package-scripts", "Package exposes sprint 14 acceptance gates", expectFileContains("package.json", [
    { pattern: "fieldgrid:google-maps-sprint5:check", message: "Missing sprint 5 map component gate." },
    { pattern: "fieldgrid:google-maps-sprint14:check", message: "Missing sprint 14 check gate." },
    { pattern: "fieldgrid:google-maps-sprint14:strict", message: "Missing sprint 14 strict gate." },
    { pattern: "fieldgrid:google-maps-sprint14:staging-live", message: "Missing optional staging live smoke script." },
  ]));
}

function checkSprintCoverage() {
  const required = [
    "tests/fieldgrid-google-maps-sprint0-baseline.test.mjs",
    "tests/fieldgrid-google-maps-sprint1-config.test.mjs",
    "tests/fieldgrid-google-maps-sprint2-datamodel.test.mjs",
    "tests/fieldgrid-google-maps-sprint3-places.test.mjs",
    "tests/fieldgrid-google-maps-sprint4-autocomplete-ux.test.mjs",
    "tests/fieldgrid-google-maps-sprint5-map-component.test.mjs",
    "tests/fieldgrid-google-maps-sprint6-planning-map.test.mjs",
    "tests/fieldgrid-google-maps-sprint7-routes.test.mjs",
    "tests/fieldgrid-google-maps-sprint8-route-panel.test.mjs",
    "tests/fieldgrid-google-maps-sprint9-personnel-vehicle-mode.test.mjs",
    "tests/fieldgrid-google-maps-sprint10-usage-reporting.test.mjs",
    "tests/fieldgrid-google-maps-sprint11-security.test.mjs",
    "tests/fieldgrid-google-maps-sprint12-legacy-cleanup.test.mjs",
    "tests/fieldgrid-google-maps-sprint13-docs.test.mjs",
    "tests/fieldgrid-google-maps-sprint14-acceptance.test.mjs",
  ];
  return check("sprint-test-coverage", "All Google Maps sprints have regression coverage", required.filter((path) => !fileExists(path)).map((path) => failure(`Missing test: ${path}`)));
}

function checkGoogleMapsRuntimeContract() {
  return check("maps-js-runtime", "Maps JS is lazy, client-only and marker-safe", [
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/client-loader.ts", [
      { pattern: "https://maps.googleapis.com/maps/api/js", message: "Maps JS loader must use Maps JavaScript API." },
      { pattern: "FIELDGRID_GOOGLE_MAPS_SCRIPT_ID", message: "Loader must have stable script id." },
      { pattern: "__fieldgridGoogleMapsLoader", message: "Loader must be singleton." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx", [
      { pattern: "IntersectionObserver", message: "Map must lazy-load only when visible." },
      { pattern: "AdvancedMarkerElement", message: "Map must use Advanced Markers." },
      { pattern: "PinElement", message: "Markers must use central pin rendering." },
      { pattern: "fitBounds", message: "Map must fit to marker bounds." },
      { pattern: "markerRefs = useRef", message: "Marker updates must not remount the map." },
      { pattern: "polylineRefs = useRef", message: "Polyline updates must not remount the map." },
      { pattern: "Google Maps is niet geconfigureerd", message: "Config fallback state is required." },
      { pattern: "Google Maps kon niet laden", message: "Load error fallback state is required." },
      { pattern: "aria-label", message: "Markers must be accessible." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/marker-status.ts", [
      { pattern: "GOOGLE_MAPS_MARKER_STATUS", message: "Marker status mapping must be centralized." },
      { pattern: "urgent", message: "Urgent/problem status must be mapped." },
      { pattern: "cancelled", message: "Cancelled status must be mapped." },
    ]),
  ]);
}

function checkPlacesContract() {
  return check("places-new", "Places API New is server-side, session-tokened and cost-aware", [
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/places-client.ts", [
      { pattern: "fetchGooglePlacesAutocomplete", message: "Backoffice Places client must expose server-side autocomplete." },
      { pattern: "fetchGooglePlaceDetails", message: "Backoffice Places client must expose server-side details." },
      { pattern: "GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK", message: "Backoffice Places client must re-export autocomplete field mask." },
      { pattern: "GOOGLE_PLACE_DETAILS_FIELD_MASK", message: "Backoffice Places client must re-export details field mask." },
    ]),
    ...expectFileContains("lib/db/src/google-places.ts", [
      { pattern: "places.googleapis.com/v1/places:autocomplete", message: "Autocomplete must use Places API New." },
      { pattern: "places.googleapis.com/v1/places/", message: "Place details must use Places API New resource endpoint." },
      { pattern: "X-Goog-FieldMask", message: "Places calls must use field masks." },
      { pattern: "apiKey", message: "Places DB client must require an API key parameter from the server layer." },
      { pattern: "formattedAddress", message: "Place details must request formatted address." },
      { pattern: "addressComponents", message: "Place details must request address components." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/api/google-maps/places/autocomplete/route.ts", [
      { pattern: "supabase.auth.getUser", message: "Autocomplete endpoint must require auth." },
      { pattern: "requireCurrentTenantId", message: "Autocomplete endpoint must derive tenant server-side." },
      { pattern: "checkGoogleMapsRateLimit", message: "Autocomplete endpoint must rate limit." },
      { pattern: "autocomplete_session_started", message: "Autocomplete sessions must be measured." },
      { pattern: "google_api_rate_limited", message: "Rate limits must be measured." },
      { pattern: "sessionToken", message: "Autocomplete endpoint must require/use session tokens." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/api/google-maps/places/details/route.ts", [
      { pattern: "supabase.auth.getUser", message: "Details endpoint must require auth." },
      { pattern: "requireCurrentTenantId", message: "Details endpoint must derive tenant server-side." },
      { pattern: "place_details_request", message: "Place details usage must be measured." },
      { pattern: "autocomplete_selection", message: "Autocomplete selection must be measured." },
    ]),
  ]);
}

function checkRoutesContract() {
  return check("routes-api", "Routes API uses computeRoutes safely for every canon mode", [
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/routes-client.ts", [
      { pattern: "directions/v2:computeRoutes", message: "Routes client must use computeRoutes." },
      { pattern: "TRAFFIC_AWARE", message: "Drive routes must be traffic aware." },
      { pattern: "routes.staticDuration", message: "Routes field mask must include static duration." },
      { pattern: "routes.polyline.encodedPolyline", message: "Routes field mask must include encoded polyline." },
      { pattern: "GOOGLE_MAPS_SERVER_API_KEY", message: "Routes client must use server key." },
    ]),
    ...expectFileNotContains("artifacts/backoffice/src/lib/google-maps/routes-client.ts", [
      { pattern: "TRAFFIC_AWARE_OPTIMAL", message: "Routes client must not use optimized traffic." },
      { pattern: "computeRouteMatrix", message: "Routes client must not use matrix routing." },
      { pattern: "optimizeWaypointOrder", message: "Routes client must not optimize waypoint order." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/planning.ts", [
      { pattern: "calculatePlanningMapRoute", message: "Planning route action must exist." },
      { pattern: "hasPermission(\"planning\", \"read\")", message: "Route action must be planning-permission checked." },
      { pattern: "requireCurrentTenantId", message: "Route action must use server-side tenant context." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx", [
      { pattern: "Route bekijken", message: "Route calls must be explicit in UI." },
      { pattern: "Fiets- en wandelroutes kunnen onvolledige paden bevatten", message: "Bike/walk warning must be visible." },
      { pattern: "Open in Google Maps", message: "External Google Maps fallback/action must exist." },
    ]),
  ]);
}

function checkUsageAndRateLimitContract() {
  return check("usage-rate-limit", "Usage reporting and rate limiting are tenant-safe", [
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/types.ts", [
      { pattern: "maps_view_opened", message: "Maps view event missing." },
      { pattern: "autocomplete_request", message: "Autocomplete event missing." },
      { pattern: "autocomplete_session_started", message: "Autocomplete session event missing." },
      { pattern: "route_request_drive_traffic", message: "Drive traffic usage event missing." },
      { pattern: "google_api_rate_limited", message: "Rate limited event missing." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/metrics.ts", [
      { pattern: "sanitizeGoogleMapsMetricMetadata", message: "Metrics metadata must be sanitized." },
      { pattern: "address", message: "Metrics sanitizer must reject address-like metadata." },
      { pattern: "api.?key", message: "Metrics sanitizer must reject API keys." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/rate-limit.ts", [
      { pattern: "places_autocomplete", message: "Autocomplete rate limit missing." },
      { pattern: "place_details", message: "Place details rate limit missing." },
      { pattern: "route_request", message: "Route rate limit missing." },
      { pattern: "usage_event", message: "Usage event rate limit missing." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/(platform)/platform/operations/page.tsx", [
      { pattern: "GoogleMapsUsagePanel", message: "Platform operations must show Google Maps usage." },
      { pattern: "Estimated SKU", message: "Usage panel must expose estimated SKU." },
      { pattern: "Cache en dedupe", message: "Usage panel must expose cache/dedupe status." },
    ]),
  ]);
}

function checkSecurityAndLegacyCleanup() {
  const activeFiles = [
    "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
    "artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx",
    "artifacts/backoffice/src/lib/google-maps/client-loader.ts",
    "artifacts/backoffice/src/lib/google-maps/routes-client.ts",
    "artifacts/backoffice/src/lib/google-maps/places-client.ts",
  ];
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/lib/google-maps/config.ts", [
      { pattern: "assertNoGoogleMapsServerSecretLeak", message: "Secret leakage guard missing." },
      { pattern: "NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY", message: "Public server key guard missing." },
      { pattern: "browserApiKey: config.browserApiKey", message: "Client bootstrap must expose browser key only." },
    ]),
    ...expectFileContains("lib/db/migrations/20260711110000_google_maps_security_hardening.sql", [
      { pattern: "REVOKE ALL PRIVILEGES ON TABLE public.google_maps_usage_events", message: "Usage metrics grants must be closed." },
      { pattern: "ENABLE ROW LEVEL SECURITY", message: "Google Maps tables must have RLS hardening." },
    ]),
  ];

  for (const path of activeFiles) {
    failures.push(...expectFileNotContains(path, [
      { pattern: "GOOGLE_ROUTES_API_KEY", message: `${path} must not read the legacy route key.` },
      { pattern: "basemaps.cartocdn.com", message: `${path} must not use CARTO tiles.` },
      { pattern: "tile.openstreetmap.org", message: `${path} must not use OSM tiles.` },
      { pattern: "maps/api/directions", message: `${path} must not use Directions Legacy.` },
      { pattern: "maps/api/distancematrix", message: `${path} must not use Distance Matrix Legacy.` },
    ]));
  }

  return check("security-legacy-cleanup", "Secrets are guarded and legacy map systems are inactive", failures);
}

function checkDocsContract() {
  return check("docs", "Docs cover setup, privacy, costs, live smoke and rollback", [
    ...expectFileContains("docs/deployment/google-maps-platform.md", [
      { pattern: "Maps JavaScript API draait client-side", message: "Docs must state Maps JS is client-side." },
      { pattern: "Places API (New) draait alleen server-side", message: "Docs must state Places is server-side." },
      { pattern: "Routes API draait alleen server-side", message: "Docs must state Routes is server-side." },
      { pattern: "Privacy En EEA", message: "Privacy/EEA docs missing." },
      { pattern: "Usage Rapportage", message: "Usage reporting docs missing." },
      { pattern: "Operator Checklist Staging", message: "Staging checklist missing." },
      { pattern: "Operator Checklist Production", message: "Production checklist missing." },
      { pattern: "Sprint 14 Acceptatiegate", message: "Sprint 14 gate instructions missing." },
      { pattern: "FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1", message: "Optional live smoke instructions missing." },
    ]),
    ...expectFileContains("docs/google-maps-platform-integration-plan.md", [
      { pattern: "Status: Sprint 14 volledige acceptatiegate en optionele live smoke afgerond.", message: "Integration plan must record sprint 14 completion." },
    ]),
  ]);
}

function checkPlaywrightSmokeContract() {
  return check("playwright-smoke", "Playwright smoke supports mocked CI and explicit live staging", [
    ...expectFileContains("scripts/fieldgrid-google-maps-playwright-smoke.mjs", [
      { pattern: "chromium", message: "Playwright smoke must launch Chromium." },
      { pattern: "--mock", message: "Mocked CI smoke mode missing." },
      { pattern: "--staging-live", message: "Optional live staging mode missing." },
      { pattern: "FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE", message: "Live smoke must require explicit opt-in." },
      { pattern: "TRAFFIC_AWARE", message: "Mock smoke must verify drive traffic." },
      { pattern: "autocompleteBeforeMinimumLength", message: "Mock smoke must verify autocomplete minimum length." },
      { pattern: "mapInstances", message: "Mock smoke must verify no remount." },
      { pattern: "optimizeWaypointOrder", message: "Mock smoke must verify no route optimization." },
    ]),
  ]);
}

function checkEvidence() {
  const evidenceFiles = [
    "outputs/google-maps-sprint14-acceptance/mock-ui-smoke.json",
    "outputs/google-maps-sprint14-acceptance/mock-ui-smoke.png",
  ];
  const failures = [];
  const warnings = [];

  for (const path of evidenceFiles) {
    if (!fileExists(path)) {
      const item = failure(`Missing evidence file: ${path}`);
      if (options.strictEvidence) failures.push(item);
      else warnings.push(warning(item.message));
      continue;
    }
    if (statSync(path).size === 0) failures.push(failure(`Evidence file is empty: ${path}`));
  }

  if (fileExists("outputs/google-maps-sprint14-acceptance/mock-ui-smoke.json")) {
    const evidence = JSON.parse(read("outputs/google-maps-sprint14-acceptance/mock-ui-smoke.json"));
    if (evidence.status !== "passed") failures.push(failure("Mock Playwright evidence did not pass."));
  }

  return check("evidence", "Sprint 14 writes acceptance evidence output", failures, warnings);
}
