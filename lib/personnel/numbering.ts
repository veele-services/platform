import { z } from "zod";

export const PERSONNEL_NUMBER_MAX = 999_999_999;

export const personnelNumberSettingsSchema = z.object({
  prefix: z.string().trim().max(20).regex(/^[A-Za-z0-9_-]*$/, "Gebruik alleen letters, cijfers, een streepje of underscore."),
  startNumber: z.coerce.number().int().min(1).max(PERSONNEL_NUMBER_MAX),
});

export function formatPersonnelNumber(prefix: string, value: number) {
  return `${prefix}${String(value).padStart(4, "0")}`;
}

export const personnelNumberInputSchema = z.object({
  employeeNumber: z.string().trim().max(80).default(""),
  employeeNumberMode: z.enum(["automatic", "manual"]).default("manual"),
}).refine((value) => value.employeeNumberMode === "automatic" || Boolean(value.employeeNumber), {
  message: "Vul een personeelsnummer in of gebruik het automatische voorstel.", path: ["employeeNumber"],
});
