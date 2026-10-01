import { timingSafeEqual } from "node:crypto";

/** Compatibility for the existing local systemd trigger. A loopback Host is
 * not authentication: the dedicated worker secret is mandatory here AND in
 * the worker handler. No other route or tenant request gets this exception. */
export function isAuthenticatedWorkerRequest(input: { method: string; pathname: string; search: string; host: string | null; authorization: string | null }, env: { ADMIN_API_SECRET?: string; PORT?: string; DEPLOY_TARGET?: string }): boolean {
  if (env.DEPLOY_TARGET !== "staging" || env.PORT !== "3301" || input.method !== "POST" || input.pathname !== "/api/worker" || input.search !== "" || input.host !== "127.0.0.1:3301") return false;
  if (!env.ADMIN_API_SECRET || env.ADMIN_API_SECRET.length < 32 || !input.authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(input.authorization.slice(7)), expected = Buffer.from(env.ADMIN_API_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
