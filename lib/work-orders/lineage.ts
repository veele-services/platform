import { z } from "zod";

export const followupReasons = {
  remainder: "Restwerk binnen afspraak",
  repair: "Herstel",
  warranty: "Garantie",
  paid: "Aanvullend betaald werk",
  inspection: "Controle",
} as const;

export const relatedCommandSchema = z.object({
  orderId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string().trim().min(2).max(180),
  instructions: z.string().max(2000).default(""),
  reason: z.enum(["remainder", "repair", "warranty", "paid", "inspection"]).default("remainder"),
  requestedDate: z.iso.date().or(z.literal("")).default(""),
  tasks: z.array(z.object({ id: z.uuid(), quantity: z.number().positive().max(999999999) })).max(100),
  copyTemplate: z.boolean().default(true),
  copyContacts: z.boolean().default(true),
  copyPersonnel: z.boolean().default(false),
  commercialReason: z.string().trim().max(3000).default(""),
  acceptedQuoteId: z.uuid().or(z.literal("")).default(""),
});

export type ScopeTask = {
  id: string; name: string; unit: string; planned: number; executed: number;
  transferred: number; withdrawn: number; available: number;
};
export type RelatedContext = {
  order: { id: string; number: string; title: string; version: number; status: string; signatureMode?: string; employeeSignatureRequired?: boolean };
  canManage: boolean; canFinance: boolean; canSplit: boolean;
  tasks: ScopeTask[];
  relations: Array<{ id: string; number: string; title: string; kind: string; reason: string; direction: "source" | "child" }>;
  transfers: Array<{ id: string; sourceTask: string; targetOrder: string; targetNumber: string; quantity: number; unit: string; createdAt: string }>;
  series: Array<{ id: string; title: string; version: number; definition: Record<string, unknown>; occurrences: Array<{ day: string; state: string; reason: string; orderId: string | null; number: string | null }> }>;
  materials: Array<{ id: string; description: string; quantity: number; unit: string; taskId: string | null; createdAt: string; customerVisible: boolean; unitPriceCents?: number | null; costCents?: number | null }>;
  acceptedQuotes: Array<{ id: string; number: string; title: string }>;
};

/** Quantities are work output, never multiplied by the number of employees. */
export function availableScope(task: Pick<ScopeTask, "planned" | "executed" | "transferred" | "withdrawn">) {
  return Math.max(0, Math.round((task.planned - task.executed - task.transferred - task.withdrawn) * 1000) / 1000);
}
