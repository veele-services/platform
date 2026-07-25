import assert from "node:assert/strict";
import test from "node:test";

import {
  isPersonnelNativeAppId,
  resolvePersonnelNativeUrl,
} from "../../artifacts/personeel-pwa/src/lib/native-navigation";

test("Veele accepts only its exact HTTPS personnel scope", () => {
  assert.equal(
    resolvePersonnelNativeUrl(
      "https://veeleservices.fieldgrid.nl/personeel/opdrachten/123?tab=rapport",
      "nl.veeleservices.personeel",
    ),
    "https://veeleservices.fieldgrid.nl/personeel/opdrachten/123?tab=rapport",
  );
  assert.equal(
    resolvePersonnelNativeUrl("/personeel", "nl.veeleservices.personeel"),
    "https://veeleservices.fieldgrid.nl/personeel",
  );
  assert.equal(
    resolvePersonnelNativeUrl(
      "https://fieldgrid.nl/personeel",
      "nl.veeleservices.personeel",
    ),
    null,
  );
});

test("Fieldgrid rejects HTTP, lookalike paths and untrusted app ids", () => {
  assert.equal(
    resolvePersonnelNativeUrl(
      "http://fieldgrid.nl/personeel",
      "nl.fieldgrid.personeel",
    ),
    null,
  );
  assert.equal(
    resolvePersonnelNativeUrl(
      "https://fieldgrid.nl/personeelXYZ",
      "nl.fieldgrid.personeel",
    ),
    null,
  );
  assert.equal(
    resolvePersonnelNativeUrl(
      "https://fieldgrid.nl/personeel",
      "nl.example.personeel",
    ),
    null,
  );
});

test("known app-id guard recognizes exactly the two prepared identities", () => {
  assert.equal(isPersonnelNativeAppId("nl.veeleservices.personeel"), true);
  assert.equal(isPersonnelNativeAppId("nl.fieldgrid.personeel"), true);
  assert.equal(isPersonnelNativeAppId("nl.fieldgrid.admin"), false);
});
