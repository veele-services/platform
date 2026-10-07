import { createConnection } from "node:net";
import { isStagingTicketScannerPath } from "./scanner-path";

export const TICKET_FILE_LIMIT = 10 * 1024 * 1024;
export type ScanOptions = { socketPath: string; timeoutMs: number; maxDatabaseAgeHours: number };
export type ScanResult = { status: "clean" | "rejected"; engine: string; databaseVersion: string; databaseAt: string };
export class ScanUnavailable extends Error {
  constructor(public readonly code: string) { super("Bestandscontrole tijdelijk niet beschikbaar"); }
}

export function ticketScanOptions(env: Record<string, string | undefined> = process.env): ScanOptions {
  if (env.CLAMAV_ENABLED !== "true") throw new ScanUnavailable("disabled");
  const socketPath = env.CLAMAV_SOCKET ?? "";
  if ((env.DEPLOY_TARGET === "staging" || env.DEPLOY_TARGET === "production") && !isStagingTicketScannerPath(socketPath)) throw new ScanUnavailable("configuration");
  const timeoutMs = Number(env.CLAMAV_TIMEOUT_MS ?? 30000);
  const maxDatabaseAgeHours = Number(env.CLAMAV_MAX_DATABASE_AGE_HOURS ?? 72);
  if (!socketPath.startsWith("/") || socketPath.includes("\0") || socketPath.length > 100 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000 || !Number.isInteger(maxDatabaseAgeHours) || maxDatabaseAgeHours < 1 || maxDatabaseAgeHours > 168) throw new ScanUnavailable("configuration");
  return { socketPath, timeoutMs, maxDatabaseAgeHours };
}

/** Local socket only: clamd TCP has neither authentication nor encryption.
 * No user controlled paths, shell execution, or diagnostic file contents. */
function command(options: ScanOptions, name: "VERSION" | "INSTREAM", bytes?: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: options.socketPath });
    let reply = Buffer.alloc(0), settled = false;
    const timer = setTimeout(() => finish(new ScanUnavailable("timeout")), options.timeoutMs);
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve(value!);
    };
    socket.on("error", () => finish(new ScanUnavailable("connection")));
    socket.on("end", () => { if (!settled) finish(new ScanUnavailable("incomplete_reply")); });
    socket.on("data", chunk => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 4096) return finish(new ScanUnavailable("invalid_reply"));
      const end = reply.indexOf(0);
      if (end !== -1) {
        if (end !== reply.length - 1) return finish(new ScanUnavailable("invalid_reply"));
        finish(undefined, reply.subarray(0, end).toString("utf8"));
      }
    });
    socket.once("connect", async () => {
      try {
        socket.write(`z${name}\0`);
        if (!bytes) return;
        for (let offset = 0; offset < bytes.length && !settled; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536), length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          if (!socket.write(chunk)) await new Promise<void>((done, fail) => {
            const drain = () => { socket.off("close", closed); done(); };
            const closed = () => { socket.off("drain", drain); fail(new ScanUnavailable("connection")); };
            socket.once("drain", drain); socket.once("close", closed);
          });
        }
        if (!settled) socket.write(Buffer.alloc(4));
      } catch { finish(new ScanUnavailable("connection")); }
    });
  });
}

export async function scannerVersion(options: ScanOptions = ticketScanOptions()): Promise<Omit<ScanResult, "status">> {
  const version = await command(options, "VERSION");
  const match = /^ClamAV ([\d.]+(?:[-\w.]*)?)\/(\d+)\/(.+)$/.exec(version);
  if (!match) throw new ScanUnavailable("unknown_engine");
  const timestamp = Date.parse(match[3]);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000 || timestamp < Date.now() - options.maxDatabaseAgeHours * 3600000) throw new ScanUnavailable("stale_database");
  return { engine: `ClamAV ${match[1]}`, databaseVersion: match[2], databaseAt: new Date(timestamp).toISOString() };
}

export async function scanTicketBytes(bytes: Uint8Array, options: ScanOptions = ticketScanOptions()): Promise<ScanResult> {
  if (!bytes.length || bytes.length > TICKET_FILE_LIMIT) throw new ScanUnavailable("size_limit");
  const version = await scannerVersion(options);
  const reply = await command(options, "INSTREAM", bytes);
  if (reply === "stream: OK") return { status: "clean", ...version };
  // Includes encrypted-content and exceeded-limit heuristics: never clean.
  if (/^stream: [^\r\n\0]{1,200} FOUND$/.test(reply)) return { status: "rejected", ...version };
  throw new ScanUnavailable("scan_error");
}
