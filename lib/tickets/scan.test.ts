import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTicketBytes, ticketScanOptions } from "./scan";

const fixtures: Array<{ server: Server; dir: string }> = [];
afterEach(async () => { for (const { server, dir } of fixtures.splice(0)) { await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); } });
async function scanner(reply: string, date = new Date(), incomplete = false, stall = false) {
  const dir = await mkdtemp(join(tmpdir(), "ticket-scan-unit-")), path = join(dir, "scan.sock"), received: Buffer[] = [];
  const server = createServer(socket => {
    let buffer = Buffer.alloc(0), command = "", total = Buffer.alloc(0);
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!command) {
        const end = buffer.indexOf(0); if (end < 0) return;
        command = buffer.subarray(0, end).toString(); buffer = buffer.subarray(end + 1);
        if (command === "zVERSION") { socket.end(`ClamAV 1.5.4/28139/${date.toUTCString()}\0`); return; }
      }
      if (command !== "zINSTREAM") return;
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(); if (buffer.length < size + 4) return;
        total = Buffer.concat([total, buffer.subarray(4, 4 + size)]); buffer = buffer.subarray(4 + size);
        if (!size) { received.push(total); if (!stall) socket.end(reply + (incomplete ? "" : "\0")); return; }
      }
    });
  });
  fixtures.push({ server, dir }); await new Promise<void>(resolve => server.listen(path, resolve));
  return { options: { socketPath: path, timeoutMs: 1000, maxDatabaseAgeHours: 72 }, received };
}
describe("private scanner protocol (unit socket, not a clean production substitute)", () => {
  it("streams exact bytes with proper INSTREAM framing", async () => {
    const { options, received } = await scanner("stream: OK"), bytes = Buffer.alloc(180000, 71);
    expect((await scanTicketBytes(bytes, options)).status).toBe("clean"); expect(received).toEqual([bytes]);
  });
  it.each(["stream: Win.Test.EICAR_HDB-1 FOUND", "stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND", "stream: Heuristics.Encrypted.PDF FOUND"])("rejects scanner detection %s", async reply => {
    const { options } = await scanner(reply); expect((await scanTicketBytes(Buffer.from("fixture"), options)).status).toBe("rejected");
  });
  it.each(["stream: read failed ERROR", "INSTREAM size limit exceeded. ERROR", "OK", "stream: OK\nstream: bad FOUND"])("never treats malformed/error reply as clean: %s", async reply => {
    const { options } = await scanner(reply); await expect(scanTicketBytes(Buffer.from("fixture"), options)).rejects.toMatchObject({ code: "scan_error" });
  });
  it("rejects stale definitions before sending any file bytes", async () => {
    const { options, received } = await scanner("stream: OK", new Date(Date.now() - 80 * 3600000));
    await expect(scanTicketBytes(Buffer.from("fixture"), options)).rejects.toMatchObject({ code: "stale_database" }); expect(received).toHaveLength(0);
  });
  it("rejects a truncated scan response", async () => {
    const { options } = await scanner("stream: OK", new Date(), true); await expect(scanTicketBytes(Buffer.from("fixture"), options)).rejects.toMatchObject({ code: "incomplete_reply" });
  });
  it("bounds a scanner that receives bytes but never confirms its result", async () => {
    const { options, received } = await scanner("stream: OK", new Date(), false, true);
    await expect(scanTicketBytes(Buffer.from("fixture"), { ...options, timeoutMs: 30 })).rejects.toMatchObject({ code: "timeout" });
    expect(received).toHaveLength(1);
  });
  it("fails closed for absent or remote configuration and oversized files", async () => {
    expect(() => ticketScanOptions({})).toThrow(); expect(() => ticketScanOptions({ CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "tcp://host:3310" })).toThrow();
    const { options } = await scanner("stream: OK"); await expect(scanTicketBytes(Buffer.alloc(10485761), options)).rejects.toMatchObject({ code: "size_limit" });
  });
  it("requires the explicit switch; disabling scanning never approves uploads", () => {
    const configured = { CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl" };
    expect(ticketScanOptions(configured).socketPath).toBe(configured.CLAMAV_SOCKET);
    expect(() => ticketScanOptions({ ...configured, CLAMAV_ENABLED: "false" })).toThrow();
    expect(() => ticketScanOptions({ ...configured, CLAMAV_ENABLED: undefined })).toThrow();
  });
});
