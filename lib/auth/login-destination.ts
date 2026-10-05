import { safeNext } from "./safe-next";

export const OTP_COOLDOWN_SECONDS = 60;
export type LoginWorkspace = "/app" | "/staff" | "/klant" | "/platform";

/** Navigation is bounded independently from the live server-side role check. */
export function otpNext(value?: string | null): string {
  const next = safeNext(value);
  return /^\/(?:app|staff|klant|platform)(?:[/?#]|$)/.test(next) ? next : "/app";
}

export function loginWorkspace(value?: string | null): LoginWorkspace {
  return new URL(otpNext(value), "https://fieldgrid.invalid").pathname.split("/")[1] === "staff" ? "/staff"
    : new URL(otpNext(value), "https://fieldgrid.invalid").pathname.split("/")[1] === "klant" ? "/klant"
    : new URL(otpNext(value), "https://fieldgrid.invalid").pathname.split("/")[1] === "platform" ? "/platform" : "/app";
}

/** Explicit non-default requests must be authorized; the generic login home
 * may select a currently allowed workspace, never an implicit tenant. */
export function verifiedLoginDestination(value: string | undefined | null, workspaces: LoginWorkspace[]): string | null {
  const next = otpNext(value), requested = loginWorkspace(next);
  if (workspaces.includes(requested)) return next;
  return next === "/app" ? workspaces[0] ?? null : null;
}
