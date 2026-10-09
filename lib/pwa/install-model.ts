/** Per-device presentation preference, never an authorization decision. */
export type StaffInstallPreference = { version: 1; phase: "waiting"; session: string } | { version: 1; phase: "done" };

export function parseInstallPreference(raw: string | null): StaffInstallPreference | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1) return null;
    if (value.phase === "done") return { version: 1, phase: "done" };
    if (value.phase === "waiting" && typeof value.session === "string" && /^[a-f0-9]{64}$/.test(value.session)) return { version: 1, phase: "waiting", session: value.session };
  } catch { /* Missing/old/corrupt preferences are harmless. */ }
  return null;
}

export function installVisit(preference: StaffInstallPreference | null, session: string | null, onboarded: boolean, installed: boolean): { preference: StaffInstallPreference | null; remind: boolean } {
  if (installed) return { preference: { version: 1, phase: "done" }, remind: false };
  if (!onboarded || !session || !/^[a-f0-9]{64}$/.test(session)) return { preference, remind: false };
  // Existing accounts get a baseline at rollout. Reloads/token refreshes are
  // not a new login. Only a new independently verified auth session qualifies.
  if (!preference) return { preference: { version: 1, phase: "waiting", session }, remind: false };
  if (preference.phase === "waiting" && preference.session !== session) return { preference: { version: 1, phase: "done" }, remind: true };
  return { preference, remind: false };
}

export function installOnboardingCompleted(session: string | null, installed: boolean): StaffInstallPreference {
  return installed || !session || !/^[a-f0-9]{64}$/.test(session)
    ? { version: 1, phase: "done" }
    : { version: 1, phase: "waiting", session };
}
