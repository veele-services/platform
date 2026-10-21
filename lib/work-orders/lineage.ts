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
  tasks: z.array(z.object({ id: z.uuid(), quantity: z.number().positive().max(999999999), targetIds: z.array(z.uuid()).max(5000).optional() })).max(100),
  copyTemplate: z.boolean().default(true),
  copyContacts: z.boolean().default(true),
  copyPersonnel: z.boolean().default(false),
  commercialReason: z.string().trim().max(3000).default(""),
  acceptedQuoteId: z.uuid().or(z.literal("")).default(""),
});

export type ScopeTask = {
  id: string; name: string; unit: string; planned: number; executed: number;
  transferred: number; withdrawn: number; available: number; targeted?: boolean;
};
export type RelatedContext = {
  order: { id: string; number: string; title: string; version: number; status: string; signatureMode?: string; employeeSignatureRequired?: boolean };
  tenantAutomationEnabled: boolean;
  canManage: boolean; canFinance: boolean; canSplit: boolean;
  tasks: ScopeTask[];
  relations: Array<{ id: string; number: string; title: string; kind: string; reason: string; direction: "source" | "child" }>;
  transfers: Array<{ id: string; sourceTask: string; targetOrder: string; targetNumber: string; quantity: number; unit: string; createdAt: string }>;
  agreementOptions: Array<{ id: string; agreement: string; scope: string; objectId: string }>;
  personnelOptions: Array<{ id: string; name: string }>;
  materialCatalogue: Array<{ id: string; code: string; name: string; category: string; description: string; unit: string;
    proposedUnitPriceCents: number | null; proposedVatBasisPoints: number | null; billableDefault: boolean; version: number }>;
  series: Array<{ id: string; title: string; version: number; definition: Record<string, unknown>;
    lifecycleState: "manual" | "concept" | "active" | "paused" | "ended"; automationEnabled: boolean;
    agreementLineId: string | null; generationHorizonWeeks: number; preferredPersonnelIds: string[];
    lifecycleReason: string | null; lastGeneratedAt: string | null; lastGeneratedThrough: string | null;
    lastGenerationResult: Record<string, unknown>; failures: Array<{ day: string; message: string; attempts: number; lastFailedAt: string }>;
    occurrences: Array<{ day: string; state: string; reason: string; orderId: string | null; number: string | null;
      preferredMatches: Array<{personnelId:string;fit:{eligible:boolean;hardBlocks:string[];warnings:Array<{key:string;message:string}>;availabilityState:string}}> }> }>;
  materials: Array<{ id: string; description: string; quantity: number; unit: string; taskId: string | null; createdAt: string;
    customerVisible: boolean; materialId: string | null; materialSnapshot: Record<string, unknown>; unitPriceCents?: number | null;
    costCents?: number | null; pricingState?: "unknown" | "included" | "proposed" | "approved" | "rejected";
    commercialVersion?: number; vatBasisPoints?: number | null; agreementEvidence?: string }>;
  acceptedQuotes: Array<{ id: string; number: string; title: string }>;
};

/** Quantities are work output, never multiplied by the number of employees. */
export function availableScope(task: Pick<ScopeTask, "planned" | "executed" | "transferred" | "withdrawn">) {
  return Math.max(0, Math.round((task.planned - task.executed - task.transferred - task.withdrawn) * 1000) / 1000);
}
