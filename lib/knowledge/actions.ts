"use server";
import { z } from "zod";
import { ticketRpc } from "@/lib/tickets/rpc";
import { getKnowledgeActor, knowledgeTicketSearch } from "./data";
import { knowledgeCommandSchema } from "./model";

export async function saveKnowledge(input: unknown) {
  try {
    const p = z.object({ requestId: z.uuid(), operation: knowledgeCommandSchema }).strict().parse(input), a = await getKnowledgeActor("platform");
    const result = await ticketRpc(a.db, "knowledge_command", { command: p.operation.command, payload: p.operation.payload, request_id: p.requestId });
    return { ok: true as const, slug: z.object({ slug: z.string() }).parse(result).slug };
  } catch (error) {
    const e = error as { code?: string };
    return { ok: false as const, error: e.code === "40001" ? "Dit artikel is intussen gewijzigd. Je tekst blijft in de editor staan. Kopieer je wijzigingen en open daarna de nieuwste versie." : error instanceof z.ZodError ? "Controleer titel, samenvatting, inhoud, doelgroep en artikelcode." : "Niet opgeslagen. Controleer je toegang en invoer en probeer opnieuw." };
  }
}
export async function findTicketKnowledge(input: unknown) {
  try { return { ok: true as const, data: await knowledgeTicketSearch(input) }; }
  catch { return { ok: false as const, error: "Artikelen zijn niet beschikbaar voor dit gesprek en deze zichtbaarheid." }; }
}
