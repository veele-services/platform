import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();

async function loadGooglePlacesModule() {
  const source = fs.readFileSync(
    path.join(root, "lib/db/src/google-places.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "google-places.ts",
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("Sprint 3 Places autocomplete sends the documented New API request and maps suggestions", async () => {
  const places = await loadGooglePlacesModule();
  let capturedUrl = "";
  let capturedInit;

  const result = await places.fetchGooglePlacesAutocomplete({
    input: "  Kalverstraat   1  ",
    sessionToken: "00000000-0000-4000-8000-000000000001",
    apiKey: "server-test-key",
    country: "NL",
    language: "nl",
    region: "NL",
    limit: 6,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJ-test-amsterdam",
              text: { text: "Kalverstraat 1, 1012 NX Amsterdam, Nederland" },
              structuredFormat: {
                mainText: { text: "Kalverstraat 1" },
                secondaryText: { text: "1012 NX Amsterdam, Nederland" },
              },
              types: ["street_address"],
            },
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(capturedUrl, places.GOOGLE_PLACES_AUTOCOMPLETE_URL);
  assert.equal(capturedInit.method, "POST");
  assert.equal(
    capturedInit.headers["X-Goog-FieldMask"],
    [
      "suggestions.placePrediction.placeId",
      "suggestions.placePrediction.text.text",
      "suggestions.placePrediction.structuredFormat.mainText.text",
      "suggestions.placePrediction.structuredFormat.secondaryText.text",
      "suggestions.placePrediction.types",
    ].join(","),
  );
  assert.deepEqual(JSON.parse(capturedInit.body), {
    input: "Kalverstraat 1",
    sessionToken: "00000000-0000-4000-8000-000000000001",
    languageCode: "nl",
    regionCode: "nl",
    includedRegionCodes: ["nl"],
    includeQueryPredictions: false,
  });
  assert.deepEqual(result.suggestions, [
    {
      id: "ChIJ-test-amsterdam",
      placeId: "ChIJ-test-amsterdam",
      label: "Kalverstraat 1, 1012 NX Amsterdam, Nederland",
      mainText: "Kalverstraat 1",
      secondaryText: "1012 NX Amsterdam, Nederland",
      types: ["street_address"],
      source: "google_places",
    },
  ]);
});

test("Places session tokens are capped at Google's documented 36 characters", async () => {
  const places = await loadGooglePlacesModule();
  assert.equal(
    places.normalizeGooglePlacesSessionToken("x".repeat(80)),
    "x".repeat(36),
  );
});

test("Places details reuses the session and maps a selected address for autofill", async () => {
  const places = await loadGooglePlacesModule();
  let capturedUrl = "";
  let capturedInit;

  const result = await places.fetchGooglePlaceDetails({
    placeId: "ChIJ-test-amsterdam",
    sessionToken: "00000000-0000-4000-8000-000000000002",
    apiKey: "server-test-key",
    language: "nl",
    region: "NL",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        id: "ChIJ-test-amsterdam",
        formattedAddress: "Kalverstraat 1, 1012 NX Amsterdam, Nederland",
        addressComponents: [
          { longText: "1", shortText: "1", types: ["street_number"] },
          { longText: "Kalverstraat", shortText: "Kalverstraat", types: ["route"] },
          { longText: "1012 NX", shortText: "1012 NX", types: ["postal_code"] },
          { longText: "Amsterdam", shortText: "Amsterdam", types: ["locality"] },
          { longText: "Nederland", shortText: "NL", types: ["country"] },
        ],
        location: { latitude: 52.373, longitude: 4.893 },
        displayName: { text: "Kalverstraat 1" },
        types: ["street_address"],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const url = new URL(capturedUrl);
  assert.equal(url.pathname, "/v1/places/ChIJ-test-amsterdam");
  assert.equal(url.searchParams.get("languageCode"), "nl");
  assert.equal(url.searchParams.get("regionCode"), "nl");
  assert.equal(
    url.searchParams.get("sessionToken"),
    "00000000-0000-4000-8000-000000000002",
  );
  assert.equal(
    capturedInit.headers["X-Goog-FieldMask"],
    places.GOOGLE_PLACE_DETAILS_FIELD_MASK,
  );
  assert.deepEqual(result.place, {
    googlePlaceId: "ChIJ-test-amsterdam",
    label: "Kalverstraat 1",
    formattedAddress: "Kalverstraat 1, 1012 NX Amsterdam, Nederland",
    addressLine1: "Kalverstraat 1",
    addressLine2: null,
    postalCode: "1012 NX",
    city: "Amsterdam",
    stateOrRegion: null,
    countryCode: "NL",
    latitude: 52.373,
    longitude: 4.893,
    locationSource: "google_places",
    types: ["street_address"],
  });
});

test("backoffice Places routes do not fan out request auth for alternative permissions", () => {
  const permissions = fs.readFileSync(
    path.join(root, "artifacts/backoffice/src/lib/auth/permissions.ts"),
    "utf8",
  );
  assert.match(permissions, /hasAnyPermissionForRequestContext/u);
  assert.match(permissions, /getUserPermissions\(input\.userId, input\.tenantId\)/u);

  for (const relativePath of [
    "artifacts/backoffice/src/app/api/google-maps/places/autocomplete/route.ts",
    "artifacts/backoffice/src/app/api/google-maps/places/details/route.ts",
  ]) {
    const route = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(route, /hasAnyPermissionForRequestContext/u);
    assert.doesNotMatch(route, /hasPermissionFromRequest/u);
  }
});
