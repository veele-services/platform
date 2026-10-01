/** An account boundary invalidates work already awaiting a server response. */
export function createNotificationRequestGate() {
  let generation = 0, sequence = 0, account: string | null = null;
  return {
    reset(key: string | null) { account = key; generation += 1; sequence += 1; },
    begin(key: string) { return { key, generation, sequence: ++sequence }; },
    current(ticket: { key: string; generation: number; sequence: number }) { return account === ticket.key && generation === ticket.generation && sequence === ticket.sequence; },
  };
}
