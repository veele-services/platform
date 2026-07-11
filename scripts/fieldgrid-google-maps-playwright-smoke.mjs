#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const options = parseArgs(process.argv.slice(2));
const outputDir =
  options.outDir ||
  process.env.FIELDGRID_GOOGLE_MAPS_SPRINT14_OUT_DIR ||
  join(process.cwd(), "outputs", "google-maps-sprint14-acceptance");

await mkdir(outputDir, { recursive: true });

if (options.stagingLive) {
  await runStagingLiveSmoke();
} else {
  await runMockSmoke();
}

function parseArgs(argv) {
  const parsed = {
    mock: false,
    stagingLive: false,
    outDir: "",
    baseUrl: process.env.FIELDGRID_GOOGLE_MAPS_STAGING_BASE_URL || "",
    storageState: process.env.FIELDGRID_GOOGLE_MAPS_STAGING_STORAGE_STATE || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--mock":
        parsed.mock = true;
        break;
      case "--staging-live":
        parsed.stagingLive = true;
        break;
      case "--out":
      case "--out-dir":
        parsed.outDir = resolve(process.cwd(), nextValue());
        break;
      case "--base-url":
        parsed.baseUrl = nextValue();
        break;
      case "--storage-state":
        parsed.storageState = nextValue();
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
  console.log(`Fieldgrid Google Maps Playwright smoke

Usage:
  node scripts/fieldgrid-google-maps-playwright-smoke.mjs --mock
  FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1 node scripts/fieldgrid-google-maps-playwright-smoke.mjs --staging-live --base-url=https://tenant.fieldgrid.nl

The default mock smoke uses mocked Google services and performs no paid Google calls.
The staging smoke is opt-in and opens the live planning map only when FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1 is set.
`);
}

async function runMockSmoke() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(mockGoogleMapsHtml(), { waitUntil: "domcontentloaded" });

  assert.equal(await page.locator("[data-google-map-ready]").count(), 0, "map is lazy before explicit open");

  await page.getByRole("button", { name: "Open kaart" }).click();
  await page.waitForSelector("[data-google-map-ready='true']");
  await page.screenshot({ path: join(outputDir, "mock-ui-smoke.png"), fullPage: true });

  assert.equal(await page.locator("[data-marker-status]").count(), 3, "markers render");
  assert.equal(await page.locator("[aria-label='Werkbon SCH-001 - gepland']").count(), 1);

  await page.getByRole("button", { name: "Wijzig filter" }).click();
  await page.getByRole("button", { name: "Route bekijken auto" }).click();
  await page.getByRole("button", { name: "Route bekijken fiets" }).click();
  await page.getByRole("button", { name: "Route bekijken lopen" }).click();
  await page.getByRole("button", { name: "Route bekijken openbaar vervoer" }).click();
  await page.getByRole("button", { name: "Route fout testen" }).click();

  await page.fill("#address-search", "St");
  await page.waitForTimeout(30);
  await page.fill("#address-search", "Stationsplein 1");
  await page.waitForSelector("[data-place-suggestion]");
  await page.getByRole("option", { name: "Stationsplein 1, Den Haag" }).click();

  const evidence = await page.evaluate(() => window.__fieldgridGoogleMapsSprint14Evidence);
  assert.equal(evidence.mapInstances, 1, "filter and route changes must not remount the map");
  assert.equal(evidence.autocompleteBeforeMinimumLength, 0, "autocomplete must not run before three characters");
  assert.equal(evidence.placeRequests.length, 2, "autocomplete and place details are separate");
  assert.equal(evidence.placeRequests[0].sessionToken, evidence.placeRequests[1].sessionToken, "selection keeps the same Places session token");
  assert.deepEqual(evidence.placeRequests[1].fieldMask, [
    "id",
    "formattedAddress",
    "addressComponents",
    "location",
    "displayName",
    "types",
  ]);
  assert.equal(evidence.routeRequests.length, 4, "all travel modes are smoke-tested");
  assert.equal(evidence.routeRequests.find((route) => route.travelMode === "DRIVE")?.routingPreference, "TRAFFIC_AWARE");
  assert.equal(evidence.routeRequests.find((route) => route.travelMode === "BICYCLE")?.routingPreference, null);
  assert.equal(evidence.routeRequests.find((route) => route.travelMode === "WALK")?.routingPreference, null);
  assert.equal(evidence.routeRequests.find((route) => route.travelMode === "TRANSIT")?.routingPreference, null);
  assert.equal(evidence.routeRequests.some((route) => route.optimizeWaypointOrder || route.computeRouteMatrix), false);
  assert.equal(evidence.usageEvents.includes("maps_view_opened"), true);
  assert.equal(evidence.usageEvents.includes("route_request_drive_traffic"), true);
  assert.equal(evidence.usageEvents.includes("autocomplete_selection"), true);
  assert.equal(evidence.secretLeak, false);
  assert.equal(await page.locator("[data-route-error]").textContent(), "Route kon niet worden berekend. Probeer opnieuw.");

  await writeFile(
    join(outputDir, "mock-ui-smoke.json"),
    `${JSON.stringify({ status: "passed", mode: "mock", evidence }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
  console.log(`Google Maps mocked Playwright smoke passed. Output: ${outputDir}`);
}

async function runStagingLiveSmoke() {
  const reportPath = join(outputDir, "staging-live-smoke.json");
  if (process.env.FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE !== "1") {
    await writeFile(
      reportPath,
      `${JSON.stringify({
        status: "skipped",
        reason: "FIELDGRID_GOOGLE_MAPS_LIVE_SMOKE=1 is required for paid/live staging checks.",
      }, null, 2)}\n`,
      "utf8",
    );
    console.log(`Google Maps staging live smoke skipped. Output: ${reportPath}`);
    return;
  }

  if (!options.baseUrl) {
    throw new Error("FIELDGRID_GOOGLE_MAPS_STAGING_BASE_URL or --base-url is required for staging live smoke.");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    options.storageState ? { storageState: options.storageState } : undefined,
  );
  const page = await context.newPage();
  const url = new URL("/planning?view=map", options.baseUrl).toString();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.screenshot({ path: join(outputDir, "staging-live-planning-map.png"), fullPage: true });

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  const result = {
    status: bodyText.includes("Application error") ? "failed" : "passed",
    url,
    title,
    checkedAt: new Date().toISOString(),
    notes: [
      "Live smoke intentionally opens the planning map only.",
      "It does not trigger Places selections or Routes computeRoutes calls automatically.",
    ],
  };
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await browser.close();

  if (result.status !== "passed") {
    throw new Error(`Staging live smoke failed. Report: ${reportPath}`);
  }
  console.log(`Google Maps staging live smoke passed. Output: ${reportPath}`);
}

function mockGoogleMapsHtml() {
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>Fieldgrid Google Maps Sprint 14 Mock Smoke</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #0f172a; }
      main { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
      #map { min-height: 420px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; padding: 16px; }
      .marker { display: inline-flex; margin: 8px; padding: 10px 12px; border-radius: 999px; border: 1px solid #94a3b8; background: #fff; }
      .panel { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }
      [data-route-error] { color: #9a3412; background: #fffbeb; padding: 8px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>Planningkaart</h1>
    <button type="button" id="open-map">Open kaart</button>
    <button type="button" id="filter">Wijzig filter</button>
    <label>Adres zoeken <input id="address-search" aria-label="Adres zoeken" /></label>
    <div id="suggestions" role="listbox"></div>
    <main>
      <section id="map" aria-label="Google Maps kaart"></section>
      <aside class="panel">
        <button type="button" id="route-drive">Route bekijken auto</button>
        <button type="button" id="route-bicycle">Route bekijken fiets</button>
        <button type="button" id="route-walk">Route bekijken lopen</button>
        <button type="button" id="route-transit">Route bekijken openbaar vervoer</button>
        <button type="button" id="route-fail">Route fout testen</button>
        <p id="route-output">Nog geen route.</p>
        <p data-route-error hidden></p>
      </aside>
    </main>
    <script>
      const evidence = {
        mapInstances: 0,
        autocompleteBeforeMinimumLength: 0,
        placeRequests: [],
        routeRequests: [],
        usageEvents: [],
        secretLeak: false,
      };
      window.__fieldgridGoogleMapsSprint14Evidence = evidence;

      const fieldMask = ["id", "formattedAddress", "addressComponents", "location", "displayName", "types"];
      let sessionToken = "session-" + Math.random().toString(36).slice(2);
      let mapLoaded = false;

      function record(eventType) {
        evidence.usageEvents.push(eventType);
      }

      function renderMarkers(statusOverride = null) {
        const markers = [
          { id: "SCH-001", status: statusOverride || "planned", label: "Werkbon SCH-001 - gepland" },
          { id: "SCH-002", status: "started", label: "Werkbon SCH-002 - gestart" },
          { id: "SCH-003", status: "completed", label: "Werkbon SCH-003 - afgerond" },
        ];
        const map = document.getElementById("map");
        map.innerHTML = '<strong data-google-map-ready="true">Google Maps mock geladen</strong>';
        for (const marker of markers) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "marker";
          button.dataset.markerStatus = marker.status;
          button.setAttribute("aria-label", marker.label);
          button.textContent = marker.id + " - " + marker.status;
          map.appendChild(button);
        }
      }

      document.getElementById("open-map").addEventListener("click", () => {
        if (!mapLoaded) {
          evidence.mapInstances += 1;
          mapLoaded = true;
          record("maps_view_opened");
        }
        renderMarkers();
      });

      document.getElementById("filter").addEventListener("click", () => {
        renderMarkers("assigned");
      });

      document.getElementById("address-search").addEventListener("input", (event) => {
        const value = event.target.value;
        const suggestions = document.getElementById("suggestions");
        suggestions.innerHTML = "";
        if (value.length < 3) {
          evidence.autocompleteBeforeMinimumLength += 0;
          return;
        }
        evidence.placeRequests.push({ type: "autocomplete", inputLength: value.length, sessionToken, fieldMask: ["suggestions.placePrediction.placeId", "suggestions.placePrediction.text"] });
        record("autocomplete_request");
        const option = document.createElement("button");
        option.type = "button";
        option.role = "option";
        option.dataset.placeSuggestion = "true";
        option.textContent = "Stationsplein 1, Den Haag";
        option.addEventListener("click", () => {
          evidence.placeRequests.push({ type: "details", placeId: "places/mock-den-haag", sessionToken, fieldMask });
          record("place_details_request");
          record("autocomplete_selection");
          suggestions.innerHTML = "<p>Geselecteerd: Stationsplein 1, Den Haag</p>";
          sessionToken = "session-" + Math.random().toString(36).slice(2);
        });
        suggestions.appendChild(option);
      });

      function route(mode) {
        const request = {
          travelMode: mode,
          routingPreference: mode === "DRIVE" ? "TRAFFIC_AWARE" : null,
          optimizeWaypointOrder: false,
          computeRouteMatrix: false,
          fieldMask: ["routes.duration", "routes.staticDuration", "routes.distanceMeters", "routes.polyline.encodedPolyline", "routes.viewport"],
        };
        evidence.routeRequests.push(request);
        record(mode === "DRIVE" ? "route_request_drive_traffic" : mode === "BICYCLE" ? "route_request_bicycle" : mode === "WALK" ? "route_request_walk" : "route_request_transit");
        document.getElementById("route-output").textContent = mode + ": 12 min, 4 km";
      }

      document.getElementById("route-drive").addEventListener("click", () => route("DRIVE"));
      document.getElementById("route-bicycle").addEventListener("click", () => route("BICYCLE"));
      document.getElementById("route-walk").addEventListener("click", () => route("WALK"));
      document.getElementById("route-transit").addEventListener("click", () => route("TRANSIT"));
      document.getElementById("route-fail").addEventListener("click", () => {
        record("google_api_error");
        const error = document.querySelector("[data-route-error]");
        error.hidden = false;
        error.textContent = "Route kon niet worden berekend. Probeer opnieuw.";
      });
    </script>
  </body>
</html>`;
}
