import "server-only";
import { lstat, readFile } from "node:fs/promises";
import { verifyTicketScanner } from "./scan-preflight";
import { ticketScanOptions } from "./scan";

export type ScannerReadiness = "ready" | "unavailable" | "disabled";
type ScannerEnvironment = { DEPLOY_TARGET: string; CLAMAV_ENABLED: string; CLAMAV_SOCKET?: string; CLAMAV_TIMEOUT_MS: number; CLAMAV_MAX_DATABASE_AGE_HOURS: number };

/** Deduplicate public health probes: no user files or unbounded scanner jobs.
 * Cache ready/failure for at most 60/5 seconds. Each real upload still checks
 * definitions and scans its own bytes, independently of this health result. */
export function createScannerReadiness(probe: (env: ScannerEnvironment) => Promise<unknown>, clock = Date.now) {
  let active: Promise<ScannerReadiness> | undefined, until = 0, identity = "";
  return (env: ScannerEnvironment): Promise<ScannerReadiness> => {
    if (env.CLAMAV_ENABLED !== "true") return Promise.resolve(env.DEPLOY_TARGET !== "local" ? "unavailable" : "disabled");
    const key = JSON.stringify(env);
    if (active && key === identity && clock() < until) return active;
    identity = key;
    until = Infinity;
    const current = Promise.resolve().then(() => probe(env)).then(() => "ready" as const, () => "unavailable" as const).then(status => {
      if (active === current) until = clock() + (status === "ready" ? 60000 : 5000);
      return status;
    });
    active = current;
    return current;
  };
}

async function probe(env: ScannerEnvironment) {
  const options = ticketScanOptions({ CLAMAV_ENABLED: env.CLAMAV_ENABLED, CLAMAV_SOCKET: env.CLAMAV_SOCKET, CLAMAV_TIMEOUT_MS: String(Math.min(env.CLAMAV_TIMEOUT_MS, 5000)), CLAMAV_MAX_DATABASE_AGE_HOURS: String(env.CLAMAV_MAX_DATABASE_AGE_HOURS) });
  if (env.DEPLOY_TARGET !== "local") {
    if (options.socketPath !== "/run/clamav/clamd.ctl") throw new Error("Invalid scanner namespace");
    const [socket, passwd, groups] = await Promise.all([lstat(options.socketPath), readFile("/etc/passwd", "utf8"), readFile("/etc/group", "utf8")]);
    const clamUid = passwd.split("\n").find(line => line.startsWith("clamav:"))?.split(":")[2];
    const appUser = env.DEPLOY_TARGET === "production" ? "fieldgrid-production" : "fieldgrid";
    const appUid = passwd.split("\n").find(line => line.startsWith(`${appUser}:`))?.split(":")[2];
    const clamGid = groups.split("\n").find(line => line.startsWith("clamav:"))?.split(":")[2];
    if (!clamUid || !appUid || !clamGid || !socket.isSocket() || (socket.mode & 0o7777) !== 0o660 || socket.uid !== Number(clamUid) || socket.gid !== Number(clamGid) || process.getuid?.() !== Number(appUid) || !process.getgroups?.().includes(Number(clamGid))) throw new Error("Scanner identity/permissions unavailable");
  }
  await verifyTicketScanner(options);
}
export const scannerReadiness = createScannerReadiness(probe);
