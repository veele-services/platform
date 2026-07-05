import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertMarkers(source, markers) {
  for (const marker of markers) {
    assert.match(
      source,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"),
    );
  }
}

test("phase 15 adds coherent settings shells for customer and personnel portals", () => {
  const customerShell = read("artifacts/klant-pwa/src/components/SettingsShell.tsx");
  const personnelShell = read("artifacts/personeel-pwa/src/components/SettingsShell.tsx");

  assertMarkers(customerShell, [
    "export function CustomerSettingsShell",
    "export function CustomerSettingsFeedback",
    "export function CustomerSettingsSaveBar",
    "aria-label=\"Instellingen\"",
    "bottom-[calc(4.9rem+var(--safe-bottom))]",
  ]);

  assertMarkers(personnelShell, [
    "export function PersonnelSettingsShell",
    "export function PersonnelSettingsFeedback",
    "export function PersonnelSettingsSaveBar",
    "export function PersonnelSettingsCard",
    "bottom-[calc(5.3rem+var(--safe-bottom))]",
  ]);
});

test("phase 15 groups customer profile preferences and security in the settings shell", () => {
  const profilePage = read("artifacts/klant-pwa/src/app/(app)/profiel/page.tsx");
  const preferencesPage = read("artifacts/klant-pwa/src/app/(app)/instellingen/page.tsx");
  const securityPage = read("artifacts/klant-pwa/src/app/(app)/beveiliging/page.tsx");
  const preferencesForm = read("artifacts/klant-pwa/src/components/PortalPreferencesForm.tsx");
  const passwordForm = read("artifacts/klant-pwa/src/components/PasswordChangeForm.tsx");

  assertMarkers(profilePage, ["CustomerSettingsShell", 'active="profile"']);
  assertMarkers(preferencesPage, ["CustomerSettingsShell", 'active="preferences"']);
  assertMarkers(securityPage, ["CustomerSettingsShell", 'active="security"']);
  assertMarkers(preferencesForm, [
    "CustomerSettingsSaveBar",
    "CustomerSettingsFeedback",
    "Pushregistratie is niet actief voor deze omgeving.",
  ]);
  assertMarkers(passwordForm, ["CustomerSettingsSaveBar", "CustomerSettingsFeedback"]);
});

test("phase 15 groups personnel profile notifications and security in the settings shell", () => {
  const overviewPage = read("artifacts/personeel-pwa/src/app/(app)/instellingen/page.tsx");
  const profilePage = read("artifacts/personeel-pwa/src/app/(app)/profiel/page.tsx");
  const notificationPage = read("artifacts/personeel-pwa/src/app/(app)/instellingen/meldingen/page.tsx");
  const securityPage = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/page.tsx");
  const notificationForm = read("artifacts/personeel-pwa/src/app/(app)/meldingen/NotificationSettingsForm.tsx");
  const profileForm = read("artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx");
  const securityForm = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/SecurityPasswordForm.tsx");

  assertMarkers(overviewPage, ["PersonnelSettingsShell", 'active="overview"']);
  assertMarkers(profilePage, ["PersonnelSettingsShell", 'active="profile"']);
  assertMarkers(notificationPage, ["PersonnelSettingsShell", 'active="notifications"']);
  assertMarkers(securityPage, ["PersonnelSettingsShell", 'active="security"']);
  assertMarkers(notificationForm, ["PersonnelSettingsSaveBar", "PersonnelSettingsFeedback"]);
  assertMarkers(profileForm, ["PersonnelSettingsSaveBar", "PersonnelSettingsFeedback"]);
  assertMarkers(securityForm, ["PersonnelSettingsSaveBar", "PersonnelSettingsFeedback"]);
});

test("phase 15 keeps unfinished security functionality behind flags and production copy", () => {
  const securityPage = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/page.tsx");
  const mfaSettings = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/MfaSettings.tsx");

  assert.match(securityPage, /NEXT_PUBLIC_ENABLE_PERSONNEL_MFA === "true"/u);
  assert.match(mfaSettings, /Tweestapsverificatie is nog niet beschikbaar voor deze omgeving\./u);
  assert.doesNotMatch(mfaSettings, /MFA\/TOTP/u);
});
