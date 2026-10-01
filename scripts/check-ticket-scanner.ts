import { verifyTicketScanner } from "../lib/tickets/scan-preflight";

void verifyTicketScanner().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error("Ticket-scanner niet gereed. Controleer lokale socket, actuele virusdefinities en fail-closed scannerbeleid. Geen bestandsinhoud of credentials gelogd."); process.exitCode = 1;
});
