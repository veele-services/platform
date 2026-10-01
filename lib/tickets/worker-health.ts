export function ticketWorkerHealthy(result: {
  failed: number;
  dossier: { failed: number };
  ticketDeliveries: { failed: number; uncertain: number };
  ticketScans: { failed: number };
}): boolean {
  return [result.failed, result.dossier.failed, result.ticketDeliveries.failed, result.ticketDeliveries.uncertain, result.ticketScans.failed].every(count => Number.isInteger(count) && count === 0);
}
