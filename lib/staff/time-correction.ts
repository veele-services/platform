import { z } from "zod";
import { localToInstant } from "@/lib/planning/time";

const correctionBaseSchema = z.object({
  timeEntryId: z.string().uuid(),
  version: z.number().int().positive(),
  // One UUID represents one submit intent. Keep it stable across a transport
  // retry, but issue a fresh UUID when the user starts a new request.
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(3, "Geef een concrete reden op").max(2000),
});

export const staffTimeCorrectionInputSchema = z.discriminatedUnion("mode", [
  correctionBaseSchema.extend({
    mode: z.literal("times"),
    requestedStartLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Vul een geldige begintijd in"),
    requestedEndLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Vul een geldige eindtijd in"),
  }).strict(),
  correctionBaseSchema.extend({
    mode: z.literal("duration"),
    requestedDurationMinutes: z.number().int().min(1).max(600),
  }).strict(),
]);

export type StaffTimeCorrectionInput = z.input<typeof staffTimeCorrectionInputSchema>;

export function resolveStaffTimeCorrection(input: StaffTimeCorrectionInput, timezone: string) {
  const parsed = staffTimeCorrectionInputSchema.parse(input);
  if (parsed.mode === "duration") {
    return {
      ...parsed,
      requestedStartsAt: null,
      requestedEndsAt: null,
    };
  }

  const requestedStartsAt = localToInstant(parsed.requestedStartLocal, timezone);
  const requestedEndsAt = localToInstant(parsed.requestedEndLocal, timezone);
  const durationMinutes = (Date.parse(requestedEndsAt) - Date.parse(requestedStartsAt)) / 60_000;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    throw new Error("De correcte eindtijd moet 1 tot en met 600 minuten na de begintijd liggen.");
  }
  return {
    ...parsed,
    requestedDurationMinutes: null,
    requestedStartsAt,
    requestedEndsAt,
  };
}
