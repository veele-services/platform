import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const componentPaths = [
  "artifacts/backoffice/src/components/google-maps/AddressAutocomplete.tsx",
  "artifacts/personeel-pwa/src/components/google-maps/AddressAutocomplete.tsx",
  "artifacts/klant-pwa/src/components/google-maps/AddressAutocomplete.tsx",
];

test("Sprint 4 autocomplete components enforce cost-aware request UX", () => {
  for (const relativePath of componentPaths) {
    const source = read(relativePath);
    assert.match(source, /setTimeout\(async \(\) => \{[\s\S]*\},\s*350\)/);
    assert.match(source, /AbortController/);
    assert.match(source, /trimmed\.length < 3/);
    assert.match(source, /endpointBase[^]*\/autocomplete/);
    assert.match(source, /endpointBase[^]*\/details/);
    assert.match(source, /async function selectSuggestion/);
    assert.match(source, /role="combobox"/);
    assert.match(source, /role="listbox"/);
    assert.match(source, /role="option"/);
    assert.match(source, /ArrowDown/);
    assert.match(source, /ArrowUp/);
    assert.match(source, /Enter/);
    assert.match(source, /Escape/);
    assert.match(source, /Geen adressen gevonden/);
    assert.match(source, /Handmatig invullen kan altijd|handmatig in/);
    assert.doesNotMatch(source, /GOOGLE_MAPS_SERVER_API_KEY/);

    const effectBlock = source.match(/useEffect\(\(\) => \{[\s\S]*?return \(\) => \{/u)?.[0] ?? "";
    assert.doesNotMatch(effectBlock, /places\/details/);
  }
});

test("Sprint 4 address UX is shared across backoffice and PWA address forms", () => {
  const integrations = [
    "artifacts/backoffice/src/components/customers/CustomerForm.tsx",
    "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
    "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
    "artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx",
    "artifacts/klant-pwa/src/components/CustomerObjectForm.tsx",
  ];

  for (const relativePath of integrations) {
    const source = read(relativePath);
    assert.match(source, /AddressAutocomplete/);
    assert.match(source, /applyAddressSelection/);
    assert.match(source, /googlePlaceId/);
    assert.doesNotMatch(source, /places\/autocomplete[\s\S]*setTimeout\(async \(\) =>/);
  }
});

test("Sprint 4 customer portal objects save only confirmed selected Google addresses", () => {
  const form = read("artifacts/klant-pwa/src/components/CustomerObjectForm.tsx");
  const actions = read("artifacts/klant-pwa/src/actions/objects.ts");

  assert.match(form, /name="googlePlaceId"/);
  assert.match(form, /name="googleFormattedAddress"/);
  assert.match(form, /name="googleLatitude"/);
  assert.match(actions, /parseSelectedGooglePlace/);
  assert.match(actions, /googlePlaceLocationPatch/);
  assert.match(actions, /locationSource:\s*"google_places"/);
  assert.match(actions, /geocodingProvider:\s*"google_places"/);
  assert.match(actions, /\(addressLine1 \?\? ""\) !== data\.address/);
});
