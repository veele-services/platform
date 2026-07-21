import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Places API New clients use server-side endpoints, minimum field masks and no expensive fields", () => {
  const placesClient = read("lib/db/src/google-places.ts");
  const backofficeAutocomplete = read("artifacts/backoffice/src/app/api/google-maps/places/autocomplete/route.ts");
  const backofficeDetails = read("artifacts/backoffice/src/app/api/google-maps/places/details/route.ts");
  const personnelAutocomplete = read("artifacts/personeel-pwa/src/app/api/google-maps/places/autocomplete/route.ts");
  const personnelDetails = read("artifacts/personeel-pwa/src/app/api/google-maps/places/details/route.ts");

  assert.match(placesClient, /places.googleapis.com\/v1\/places:autocomplete/);
  assert.match(placesClient, /places.googleapis.com\/v1\/places\//);
  assert.match(placesClient, /X-Goog-FieldMask/);
  assert.match(placesClient, /suggestions\.placePrediction\.placeId/);
  assert.match(placesClient, /id",\s*"formattedAddress",\s*"addressComponents",\s*"location",\s*"displayName",\s*"types"/s);
  for (const forbidden of [
    "reviews",
    "rating",
    "photos",
    "regularOpeningHours",
    "internationalPhoneNumber",
    "websiteUri",
  ]) {
    assert.match(placesClient, new RegExp(`GOOGLE_PLACES_FORBIDDEN_EXPENSIVE_FIELDS[\\s\\S]*${forbidden}`, "u"));
    const runtimeClient = placesClient.replace(
      /GOOGLE_PLACES_FORBIDDEN_EXPENSIVE_FIELDS[\s\S]*?\] as const;/u,
      "",
    );
    assert.doesNotMatch(runtimeClient, new RegExp(`"${forbidden}"`, "u"));
  }
  assert.match(backofficeAutocomplete, /requireCurrentTenantIdFromRequest\(request\)/);
  assert.match(backofficeAutocomplete, /hasPermissionFromRequest\(request,\s*"personnel",\s*"read"\)/);
  assert.match(backofficeAutocomplete, /z\.object/);
  assert.match(backofficeAutocomplete, /input\.trim\(\)\.length < 3/);
  assert.match(backofficeAutocomplete, /checkGoogleMapsRateLimit/);
  assert.match(backofficeDetails, /requireCurrentTenantIdFromRequest\(request\)/);
  assert.match(backofficeDetails, /checkGoogleMapsRateLimit/);
  assert.match(personnelAutocomplete, /getMyPersonnel\(\)/);
  assert.match(personnelAutocomplete, /checkPersonnelGoogleMapsRateLimit/);
  assert.match(personnelDetails, /getMyPersonnel\(\)/);
  assert.match(personnelDetails, /checkPersonnelGoogleMapsRateLimit/);
  assert.doesNotMatch(backofficeAutocomplete, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.doesNotMatch(backofficeDetails, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.doesNotMatch(personnelAutocomplete, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.doesNotMatch(personnelDetails, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/);
});

test("Address forms use autocomplete while typing and Place Details only after selection", () => {
  const backofficeComponent = read("artifacts/backoffice/src/components/google-maps/AddressAutocomplete.tsx");
  const backofficeAutocompleteBridge = read("artifacts/backoffice/src/app/backoffice-api/google-maps/places/autocomplete/route.ts");
  const backofficeDetailsBridge = read("artifacts/backoffice/src/app/backoffice-api/google-maps/places/details/route.ts");
  const apiBackofficeProxy = read("artifacts/api-server/src/routes/platform-backoffice.ts");
  const personnelComponent = read("artifacts/personeel-pwa/src/components/google-maps/AddressAutocomplete.tsx");
  const customerComponent = read("artifacts/klant-pwa/src/components/google-maps/AddressAutocomplete.tsx");
  const personnelForm = read("artifacts/backoffice/src/components/personnel/PersonnelForm.tsx");
  const objectForm = read("artifacts/backoffice/src/components/objects/ObjectForm.tsx");
  const customerForm = read("artifacts/backoffice/src/components/customers/CustomerForm.tsx");
  const pwaProfileForm = read("artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx");
  const customerObjectForm = read("artifacts/klant-pwa/src/components/CustomerObjectForm.tsx");

  for (const component of [backofficeComponent, personnelComponent, customerComponent]) {
    assert.match(component, /sessionToken/);
    assert.match(component, /endpointBase[^]*\/autocomplete/);
    assert.match(component, /endpointBase[^]*\/details/);
    assert.match(component, /trimmed\.length < 3/);
    assert.match(component, /setTimeout\(async \(\) =>/);
    assert.match(component, /AbortController/);
    assert.match(component, /selectSuggestion/);
    const effectBlock = component.match(/useEffect\(\(\) => \{[\s\S]*?return \(\) => \{/u)?.[0] ?? "";
    assert.doesNotMatch(effectBlock, /places\/details/);
  }
  assert.match(backofficeComponent, /endpointBase = "\/backoffice-api\/google-maps\/places"/u);
  assert.match(backofficeAutocompleteBridge, /@\/app\/api\/google-maps\/places\/autocomplete\/route/u);
  assert.match(backofficeDetailsBridge, /@\/app\/api\/google-maps\/places\/details\/route/u);
  assert.match(apiBackofficeProxy, /\["\/invoices", "\/quotes", "\/reports", "\/google-maps"\]/u);
  assert.match(apiBackofficeProxy, /res\.redirect\(307, target\)/u);

  for (const form of [personnelForm, objectForm, customerForm, pwaProfileForm, customerObjectForm]) {
    assert.match(form, /AddressAutocomplete/);
    assert.match(form, /googlePlaceId/);
  }
});

test("Selected Google address data is saved as confirmed Fieldgrid data without leaking server keys", () => {
  const personnelActions = read("artifacts/backoffice/src/app/actions/personnel.ts");
  const objectActions = read("artifacts/backoffice/src/app/actions/objects.ts");
  const pwaActions = read("artifacts/personeel-pwa/src/actions/personnel.ts");
  const dbPackage = read("lib/db/package.json");

  for (const source of [personnelActions, objectActions, pwaActions]) {
    assert.match(source, /googlePlaceId/);
    assert.match(source, /locationSource:\s*"google_places"/);
    assert.match(source, /locationVerifiedAt:\s*new Date\(\)/);
    assert.match(source, /addressGeocodingProvider:\s*"google_places"|geocodingProvider:\s*"google_places"/);
  }
  assert.match(dbPackage, /"\.\/google-places": "\.\/src\/google-places\.ts"/);

  for (const relativePath of [
    "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
    "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
    "artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx",
  ]) {
    assert.doesNotMatch(read(relativePath), /GOOGLE_MAPS_SERVER_API_KEY/);
  }
});
