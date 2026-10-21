import { z } from "zod";

export const taskUnits = { task: "taak", hour: "uur", item: "item", kilometre: "km", square_metre: "m²", room: "ruimte" } as const;
export const executionModes = { once: "Eenmaal", quantity: "Hoeveelheid", rooms: "Ruimtes / onderdelen", items: "Geregistreerde items" } as const;
export const checklistModes = { none: "Geen checklist", task: "Eenmaal voor deze taak", target: "Per gekoppelde ruimte of item" } as const;
export const taskVariantSchema = z.object({
  key: z.string().min(1).max(100), name: z.string().trim().min(1).max(120),
  itemType: z.string().max(100), model: z.string().trim().min(1).max(100),
  minutes: z.number().positive().max(1440), basis: z.number().positive().max(100000),
  comparisonKey: z.string().min(1).max(100), checklistRevisionId: z.uuid().optional(),
}).strict();
export const executionConfigSchema = z.object({
  mode: z.enum(["once", "quantity", "rooms", "items"]), normBasis: z.number().positive().max(100000),
  checklistMode: z.enum(["none", "task", "target"]), checklistRevisionId: z.uuid().optional(),
  comparisonKey: z.string().min(1).max(100), itemTypes: z.array(z.string().trim().min(1).max(100)).max(50),
  variants: z.array(taskVariantSchema).max(50), identification: z.enum(["optional", "required"]),
  photoPerTarget: z.boolean(), findingOnDeviation: z.boolean(), allowExtraTargets: z.boolean(),
  allowUnknownItems: z.boolean(), qualifications: z.array(z.string().trim().min(1).max(100)).max(50),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "once" && value.normBasis !== 1) ctx.addIssue({ code: "custom", path: ["normBasis"], message: "Een eenmalige taak heeft normbasis 1." });
  if (value.checklistMode === "target" && !["rooms", "items"].includes(value.mode)) ctx.addIssue({ code: "custom", path: ["checklistMode"], message: "Controles per doel vereisen ruimtes of items." });
  if (value.checklistMode !== "none" && !value.checklistRevisionId && !value.variants.length) ctx.addIssue({ code: "custom", path: ["checklistRevisionId"], message: "Kies een gepubliceerde checklistversie." });
  if (new Set(value.variants.map(v => v.key)).size !== value.variants.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Iedere variant heeft een eigen identiteit." });
});
export type TaskExecutionConfig = z.infer<typeof executionConfigSchema>;
export type TaskVariant = z.infer<typeof taskVariantSchema>;
export function defaultExecutionConfig(comparisonKey: string): TaskExecutionConfig {
  return { mode: "once", normBasis: 1, checklistMode: "none", comparisonKey, itemTypes: [], variants: [], identification: "optional", photoPerTarget: false, findingOnDeviation: true, allowExtraTargets: false, allowUnknownItems: false, qualifications: [] };
}
export function executionConfig(value: unknown, key: string): TaskExecutionConfig {
  return { ...defaultExecutionConfig(key), ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}) } as TaskExecutionConfig;
}
export type NormVersion = { id: string; minutes: number; basis: number; variantKey: string; effectiveOn: string; comparisonKey: string };
export function applicableNorm(minutes: number, config: TaskExecutionConfig, versions: NormVersion[], onDate: string, variantKey = "") {
  const variant = config.variants.find(v => v.key === variantKey);
  const comparison = variant?.comparisonKey ?? config.comparisonKey;
  const valid = versions.filter(n => n.effectiveOn <= onDate && n.variantKey === variantKey && n.comparisonKey === comparison).sort((a,b) => b.effectiveOn.localeCompare(a.effectiveOn))[0];
  return { minutes: valid?.minutes ?? variant?.minutes ?? minutes, basis: valid?.basis ?? variant?.basis ?? config.normBasis };
}
export function taskBudget(quantity: number, minutes: number, basis = 1) {
  if (![quantity, minutes, basis].every(Number.isFinite) || quantity < 0 || minutes <= 0 || basis <= 0) throw new Error("Ongeldige normgrondslag.");
  return quantity / basis * minutes;
}
export function normLabel(minutes: number, basis: number, unit: keyof typeof taskUnits) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(minutes)} arbeidsminuten per ${basis === 1 ? "" : `${basis} `}${taskUnits[unit]}`;
}
export const targetSelectionSchema = z.object({ itemId: z.uuid().optional(), nodeId: z.uuid().optional(), quantity: z.number().positive().max(100000).optional(), variantKey: z.string().max(100).optional() }).strict().refine(v => !!v.itemId !== !!v.nodeId, "Kies één item of ruimte.");
export type TargetSelection = z.infer<typeof targetSelectionSchema>;
