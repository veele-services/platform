import { expect, it } from "vitest";
import { ticketWorkerHealthy } from "./worker-health";

const healthy = () => ({ failed: 0, dossier: { failed: 0 }, ticketDeliveries: { failed: 0, uncertain: 0 }, ticketScans: { failed: 0, rejected: 2 } });
it("treats a real malware rejection as successful fail-closed processing", () => { expect(ticketWorkerHealthy(healthy())).toBe(true); });
it("never reports a successful invocation when any pipeline failed or is uncertain", () => {
  const changes: Array<(result: ReturnType<typeof healthy>) => void> = [r => r.failed++, r => r.dossier.failed++, r => r.ticketDeliveries.failed++, r => r.ticketDeliveries.uncertain++, r => r.ticketScans.failed++];
  for (const change of changes) {
    const result = healthy(); change(result); expect(ticketWorkerHealthy(result)).toBe(false);
  }
});
it("fails closed on malformed outcome counters", () => { const result = healthy(); result.ticketScans.failed = Number.NaN; expect(ticketWorkerHealthy(result)).toBe(false); });
