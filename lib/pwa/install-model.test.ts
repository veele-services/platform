import { describe, expect, it } from "vitest";
import { installOnboardingCompleted, installVisit, parseInstallPreference } from "./install-model";

const first = "a".repeat(64), next = "b".repeat(64), later = "c".repeat(64);
describe("staff app installation reminders", () => {
  it("offers onboarding separately, reminds once on a new login, and never again", () => {
    const saved = installOnboardingCompleted(first, false);
    expect(installVisit(saved, first, true, false).remind).toBe(false);
    const secondLogin = installVisit(saved, next, true, false);
    expect(secondLogin.remind).toBe(true);
    expect(installVisit(secondLogin.preference, next, true, false).remind).toBe(false);
    expect(installVisit(secondLogin.preference, later, true, false).remind).toBe(false);
  });
  it("does not prompt on incomplete onboarding, refresh, missing session or rollout of existing accounts", () => {
    expect(installVisit(null, first, false, false)).toEqual({ preference: null, remind: false });
    const rollout = installVisit(null, first, true, false);
    expect(rollout.remind).toBe(false);
    expect(installVisit(rollout.preference, first, true, false).remind).toBe(false);
    expect(installVisit(rollout.preference, null, true, false).remind).toBe(false);
  });
  it("installed apps suppress automatic reminders regardless of prior state", () => {
    const visit = installVisit(installOnboardingCompleted(first, false), next, true, true);
    expect(visit).toEqual({ preference: { version: 1, phase: "done" }, remind: false });
    expect(installOnboardingCompleted(first, true)).toEqual({ version: 1, phase: "done" });
  });
  it("rejects corrupt, unversioned and raw credential-shaped persisted data", () => {
    for (const raw of [null, "invalid", '{"phase":"done"}', '{"version":1,"phase":"waiting","session":"ey.access.token"}']) expect(parseInstallPreference(raw)).toBeNull();
    expect(parseInstallPreference(JSON.stringify(installOnboardingCompleted(first, false)))).toEqual({ version: 1, phase: "waiting", session: first });
  });
});
