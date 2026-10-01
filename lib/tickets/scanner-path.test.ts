import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isStagingTicketScannerPath } from "./scanner-path";

describe("staging scanner namespace contract", () => {
  it("accepts the canonical runtime socket", () => expect(isStagingTicketScannerPath("/run/clamav/clamd.ctl")).toBe(true));
  it.each(["", "/tmp/clamd.sock", "/var/tmp/clamd.sock", "/home/fieldgrid/clamd.sock", "/root/clamd.sock", "/run/user/1001/clamd.sock", "/run/clamav/../other.sock", "/run/clamav/", "/run/clamav/.hidden", "/run/clamav/folder/clamd.sock", "tcp://127.0.0.1:3310", `/run/clamav/${"x".repeat(100)}`])("rejects unavailable or unsafe path %s", path => expect(isStagingTicketScannerPath(path)).toBe(false));
  it("runner preflight validates configuration but never opens the scanner", () => {
    const source = readFileSync(new URL("../../scripts/preflight.ts", import.meta.url), "utf8");
    expect(source).toContain('import { isStagingTicketScannerPath } from "../lib/tickets/scanner-path"');
    expect(source).toContain('CLAMAV_ENABLED: z.literal("true")');
    expect(source).toContain('CLAMAV_SOCKET: z.string().refine(isStagingTicketScannerPath)');
    expect(source).not.toContain('verifyTicketScanner');
    expect(isStagingTicketScannerPath("/run/clamav/fieldgrid-staging.sock")).toBe(false);
  });
});
