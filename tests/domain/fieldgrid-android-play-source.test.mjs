import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const gradle = read("artifacts/personeel-pwa/android/app/build.gradle");
const manifest = read(
  "artifacts/personeel-pwa/android/app/src/main/AndroidManifest.xml",
);
const filePaths = read(
  "artifacts/personeel-pwa/android/app/src/main/res/xml/file_paths.xml",
);
const backupRules = read(
  "artifacts/personeel-pwa/android/app/src/main/res/xml/backup_rules.xml",
);
const extractionRules = read(
  "artifacts/personeel-pwa/android/app/src/main/res/xml/data_extraction_rules.xml",
);
const collector = read("scripts/collect-android-personnel-artifacts.mjs");
const preflight = read("scripts/preflight-android-personnel-runtime.mjs");
const runtimeBridge = read(
  "artifacts/personeel-pwa/src/components/CapacitorRuntimeBridge.tsx",
);
const tokenSync = read(
  "artifacts/personeel-pwa/src/components/NativePushTokenSync.tsx",
);
const notificationSettings = read(
  "artifacts/personeel-pwa/src/app/(app)/meldingen/NotificationSettingsForm.tsx",
);
const nativeDebug = read(
  "artifacts/personeel-pwa/src/app/(app)/debug/native/NativeDebugPanel.tsx",
);
const signOutButton = read(
  "artifacts/personeel-pwa/src/components/NativeAwareSignOutButton.tsx",
);
const pushAction = read("artifacts/personeel-pwa/src/actions/push.ts");
const fcmSender = read("artifacts/api-server/src/lib/native-push.ts");
const notificationWorker = read(
  "artifacts/api-server/src/lib/notification-worker.ts",
);
const instrumentationTest = read(
  "artifacts/personeel-pwa/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java",
);
const rootIgnore = read(".gitignore");
const androidIgnore = read("artifacts/personeel-pwa/android/.gitignore");
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
  assert.match(instrumentationTest, /BuildConfig\.APPLICATION_ID/u);
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

test("native wrapper excludes backups and scopes app links exactly", () => {
  assert.match(manifest, /android:allowBackup="false"/u);
  assert.match(manifest, /android:dataExtractionRules/u);
  assert.match(manifest, /android:fullBackupContent/u);
  assert.match(manifest, /android:usesCleartextTraffic="false"/u);
  assert.match(manifest, /android:autoVerify="true"/u);
  assert.match(manifest, /android:path="\/personeel"/u);
  assert.match(manifest, /android:pathPrefix="\/personeel\/"/u);
  assert.doesNotMatch(filePaths, /<external-path/u);
  assert.match(filePaths, /<external-files-path/u);
  assert.match(backupRules, /<exclude domain="root" path="\." \/>/u);
  assert.match(extractionRules, /<device-transfer>/u);
});

test("release signing and versioning fail closed", () => {
  assert.match(gradle, /FIELDGRID_ANDROID_SIGNING_PROPERTIES/u);
  assert.match(gradle, /\.local\/share\/fieldgrid-android\/signing/u);
  assert.match(gradle, /releaseTaskRequested/u);
  assert.match(gradle, /throw new GradleException/u);
  assert.match(gradle, /FIELDGRID_VERSION_CODE/u);
  assert.match(gradle, /FIELDGRID_VERSION_NAME/u);
  assert.match(rootIgnore, /\*\.p12/u);
  assert.match(rootIgnore, /android-signing\.properties/u);
  assert.match(androidIgnore, /\*\.keystore/u);
});

test("artifact collector verifies identity, runtime and signatures before copy", () => {
  for (const expected of [
    "aapt2",
    "apksigner",
    "jarsigner",
    "APK Signature Scheme v2",
    "capacitor.config.json",
    "targetSdk",
    "sourceCommit",
    "git",
    "status",
  ]) {
    assert.match(collector, new RegExp(expected, "u"));
  }
  assert.match(collector, /sourceDirty/u);
  assert.match(collector, /chmodSync\(target, 0o600\)/u);
});

test("native navigation handles warm links, cold links and notification taps", () => {
  assert.match(runtimeBridge, /appUrlOpen/u);
  assert.match(runtimeBridge, /getLaunchUrl/u);
  assert.match(runtimeBridge, /pushNotificationActionPerformed/u);
  assert.match(runtimeBridge, /resolvePersonnelNativeUrl/u);
  assert.match(preflight, /Cross-host redirect niet toegestaan/u);
  assert.match(preflight, /assetlinks\.json/u);
});

test("native token registration uses runtime app metadata everywhere", () => {
  assert.match(tokenSync, /getNativePushAppMetadata/u);
  assert.match(notificationSettings, /registration\.appId/u);
  assert.match(nativeDebug, /result\.appId/u);
  assert.doesNotMatch(tokenSync, /appId:\s*"nl\.veeleservices/u);
  assert.doesNotMatch(notificationSettings, /appId:\s*"nl\.veeleservices/u);
  assert.doesNotMatch(nativeDebug, /appId:\s*"nl\.veeleservices/u);
  assert.match(pushAction, /PERSONNEL_NATIVE_APP_IDS/u);
});

test("native push delivery selects credentials and channels by app identity", () => {
  assert.match(fcmSender, /FCM_\$\{prefix\}_\$\{suffix\}/u);
  assert.match(fcmSender, /fieldgrid_operations/u);
  assert.match(fcmSender, /veele_operations/u);
  assert.match(notificationWorker, /device\.appId/u);
});

test("native sign-out deactivates and unregisters the device token", () => {
  assert.match(signOutButton, /deactivateMyNativePushToken/u);
  assert.match(signOutButton, /unregisterNativePush/u);
  assert.match(signOutButton, /await signOut\(\)/u);
  assert.ok(
    signOutButton.indexOf("deactivateMyNativePushToken") <
      signOutButton.indexOf("await signOut()"),
  );
});
