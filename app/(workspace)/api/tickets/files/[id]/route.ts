import { discardTicketFile, ticketFileHeaders, ticketFileResponse, uploadTicketFile } from "@/lib/tickets/files";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json({ ok: true, file: await uploadTicketFile(request, (await params).id) }, { headers: ticketFileHeaders }); }
  catch { return Response.json({ ok: false, error: "Upload niet bevestigd. Controleer je toegang of probeer hetzelfde bestand opnieuw." }, { status: 400, headers: ticketFileHeaders }); }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await ticketFileResponse(request, (await params).id); }
  catch { return Response.json({ ok: false, error: "Bestand niet beschikbaar" }, { status: 404, headers: ticketFileHeaders }); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await discardTicketFile(request, (await params).id); return Response.json({ ok: true }, { headers: ticketFileHeaders }); }
  catch { return Response.json({ ok: false, error: "Bestand kon niet worden verwijderd" }, { status: 400, headers: ticketFileHeaders }); }
}
