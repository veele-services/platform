import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const gradle = read("artifacts/personeel-pwa/android/app/build.gradle");
const manifest = read(
  "artifacts/personeel-pwa/android/app/src/main/AndroidManifest.xml",
);
const veeleConfig = JSON.parse(
  read(
    "artifacts/personeel-pwa/android/app/src/veele/assets/capacitor.config.json",
  ),
);
const fieldgridConfig = JSON.parse(
  read(
    "artifacts/personeel-pwa/android/app/src/fieldgrid/assets/capacitor.config.json",
  ),
);

test("Android exposes separate immutable Play identities", () => {
  assert.match(gradle, /productFlavors/u);
  assert.match(gradle, /applicationId "nl\.veeleservices\.personeel"/u);
  assert.match(gradle, /applicationId "nl\.fieldgrid\.personeel"/u);
  assert.match(gradle, /targetSdkVersion rootProject\.ext\.targetSdkVersion/u);
});

test("each flavor loads its HTTPS production personnel route", () => {
  assert.equal(
    veeleConfig.server.url,
    "https://veeleservices.fieldgrid.nl/personeel",
  );
  assert.equal(fieldgridConfig.server.url, "https://fieldgrid.nl/personeel");
  assert.equal(veeleConfig.server.cleartext, false);
  assert.equal(fieldgridConfig.server.cleartext, false);
});

test("native wrapper disables backup and verifies scoped app links", () => {
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(manifest, /android:autoVerify="true"/u);
  assert.match(manifest, /android:pathPrefix="\/personeel"/u);
});

test("release signing stays outside the repository", () => {
  assert.match(gradle, /FIELDGRID_ANDROID_SIGNING_PROPERTIES/u);
  assert.match(gradle, /\.local\/share\/fieldgrid-android\/signing/u);
  assert.match(gradle, /veeleRelease/u);
  assert.match(gradle, /fieldgridRelease/u);
});
