/** The hardened staging web unit hides /tmp and homes from the runtime.
 * A runner-visible temporary socket is therefore not proof of runtime access. */
export function isStagingTicketScannerPath(value: string): boolean {
  return value === "/run/clamav/clamd.ctl";
}
