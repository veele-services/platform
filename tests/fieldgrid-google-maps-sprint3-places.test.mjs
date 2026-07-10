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
  assert.match(backofficeAutocomplete, /requireCurrentTenantId\(\)/);
  assert.match(backofficeAutocomplete, /hasPermission\("personnel",\s*"read"\)/);
  assert.match(backofficeAutocomplete, /z\.object/);
  assert.match(backofficeAutocomplete, /input\.trim\(\)\.length < 3/);
  assert.match(backofficeAutocomplete, /checkGoogleMapsRateLimit/);
  assert.match(backofficeDetails, /requireCurrentTenantId\(\)/);
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
  const personnelForm = read("artifacts/backoffice/src/components/personnel/PersonnelForm.tsx");
  const objectForm = read("artifacts/backoffice/src/components/objects/ObjectForm.tsx");
  const pwaProfileForm = read("artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx");

  for (const form of [personnelForm, objectForm, pwaProfileForm]) {
    assert.match(form, /sessionToken/);
    assert.match(form, /places\/autocomplete/);
    assert.match(form, /places\/details/);
    assert.match(form, /query\.length < 3/);
    assert.match(form, /setTimeout\(async \(\) =>/);
    assert.match(form, /AbortController/);
    assert.match(form, /selectAddressSuggestion/);
    assert.match(form, /googlePlaceId/);
    const effectBlock = form.match(/useEffect\(\(\) => \{[\s\S]*?return \(\) => \{/u)?.[0] ?? "";
    assert.doesNotMatch(effectBlock, /places\/details/);
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
