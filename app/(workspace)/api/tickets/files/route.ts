import { initializeTicketFile, ticketFileHeaders } from "@/lib/tickets/files";

export async function POST(request: Request) {
  try { return Response.json({ ok: true, ...await initializeTicketFile(request) }, { headers: ticketFileHeaders }); }
  catch { return Response.json({ ok: false, error: "Upload niet gestart. Controleer je toegang, bestandstype, omvang en uploadlimiet." }, { status: 400, headers: ticketFileHeaders }); }
}
