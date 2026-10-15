import { z } from "zod";

export const crmDate = z.iso.date();
export const crmTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const crmIntakeSchema = z.object({
  idempotencyKey: z.uuid(), kind: z.enum(["trial", "appointment", "demo"]),
  name: z.string().trim().min(1).max(160), company: z.string().trim().min(1).max(180),
  email: z.email().trim().toLowerCase().max(254), phone: z.string().trim().max(40).default(""),
  sector: z.string().trim().max(120).default(""), team: z.string().trim().max(100).default(""),
  goal: z.string().trim().max(500).default(""), message: z.string().trim().max(5000).default(""),
  date: crmDate.optional(), time: crmTime.optional(),
}).strict().superRefine((p, ctx) => {
  if (p.kind !== "trial" && (!p.date || !p.time || p.phone.length < 6)) ctx.addIssue({ code: "custom", message: "Kies een moment en vul je telefoonnummer in.", path: ["phone"] });
  if (p.kind === "trial" && (p.date || p.time)) ctx.addIssue({ code: "custom", message: "Een proefaanvraag bevat geen afspraak.", path: ["date"] });
});
export const crmReceiptSchema = z.object({ ok: z.literal(true), leadId: z.uuid(), requestId: z.uuid(), appointmentId: z.uuid().optional(), notificationStatus: z.string() });
export const crmAvailabilitySchema = z.object({ date: crmDate, slots: z.array(crmTime).max(48), timezone: z.literal("Europe/Amsterdam"), durationMinutes: z.literal(30) });
export const crmQuerySchema = z.object({
  tab: z.enum(["pipeline", "requests", "agenda", "tasks", "settings"]).default("pipeline"),
  search: z.string().trim().max(160).default(""), kind: z.enum(["", "trial", "appointment", "demo"]).default(""),
  owner: z.union([z.uuid(), z.literal("")]).default(""), lead: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(50),
  from: crmDate.optional(), until: crmDate.optional(),
  taskFilter:z.enum(["open","overdue","done","all"]).default("open"),
  showCancelled:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
  mailStatus:z.enum(["all","action","pending_config","queued","sending","accepted","failed","uncertain","deferred","suppressed","cancelled","expired"]).default("all"),
  detailPage:z.coerce.number().int().min(1).max(100000).default(1),
  detailPageSize:z.coerce.number().int().min(5).max(100).default(50),
}).strict();

export function crmError(error: unknown): { status: number; error: string } {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { status: 422, error: "Controleer de ingevulde gegevens." };
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "42501") return { status: 403, error: "Je hebt geen actuele toegang tot het platform-CRM." };
  if (code === "P0002") return { status: 404, error: "Deze registratie is niet beschikbaar." };
  if (code === "P0429") return { status: 429, error: "Te veel aanvragen. Probeer het later opnieuw." };
  if (code === "23P01") return { status: 409, error: "Dit moment is niet meer beschikbaar. Kies een ander tijdslot." };
  if (["40001", "23505", "23514"].includes(code)) return { status: 409, error: "De registratie is intussen gewijzigd. Controleer de nieuwste gegevens en probeer opnieuw." };
  if (["22023", "22007", "22008", "22P02", "23502", "23503"].includes(code)) return { status: 422, error: "Controleer de ingevulde gegevens en het gekozen moment." };
  return { status: 503, error: "De registratie kon nog niet worden bevestigd. Je invoer blijft behouden; probeer dezelfde aanvraag opnieuw." };
}
