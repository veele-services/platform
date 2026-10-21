import { z } from "zod";
import { localToInstant, validDay } from "../planning/time";

export const recurrenceSchema = z.object({
  taskIds:z.array(z.uuid()).min(1).max(100).optional(),
  startsOn: z.iso.date(), endsOn: z.iso.date().or(z.literal("")).default(""),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(52).default(1),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1]),
  monthlyMode: z.enum(["date", "weekday"]).default("date"),
  monthDay: z.number().int().min(1).max(31).default(1),
  monthPosition: z.number().int().min(-1).max(5).refine(n => n !== 0).default(1),
  monthWeekday: z.number().int().min(1).max(7).default(1),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  requiredPersonnel: z.number().int().min(1).max(100).default(1),
}).refine(v => !v.endsOn || v.endsOn >= v.startsOn, { message: "Einddatum ligt vóór de startdatum", path: ["endsOn"] });

export type Recurrence = z.infer<typeof recurrenceSchema>;
const dayMs = 86_400_000;
const utcDay = (day: string) => new Date(`${day}T00:00:00Z`);
const weekday = (day: Date) => day.getUTCDay() || 7;

/** Invalid month dates are skipped; the last weekday uses position -1. */
export function matchesRecurrence(rule: Recurrence, day: string) {
  if (!validDay(day) || day < rule.startsOn || (rule.endsOn && day > rule.endsOn)) return false;
  const current = utcDay(day), anchor = utcDay(rule.startsOn);
  const distance = Math.round((current.getTime() - anchor.getTime()) / dayMs);
  if (rule.frequency === "daily") return distance % rule.interval === 0;
  if (rule.frequency === "weekly") {
    const weeks = Math.floor((distance + weekday(anchor) - 1) / 7);
    return weeks % rule.interval === 0 && rule.weekdays.includes(weekday(current));
  }
  if (rule.frequency === "yearly") {
    const years = current.getUTCFullYear() - anchor.getUTCFullYear();
    return years % rule.interval === 0 && current.getUTCMonth() === anchor.getUTCMonth() && current.getUTCDate() === anchor.getUTCDate();
  }
  const months = (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + current.getUTCMonth() - anchor.getUTCMonth();
  if (months % rule.interval !== 0) return false;
  if (rule.monthlyMode === "date") return current.getUTCDate() === rule.monthDay;
  if (weekday(current) !== rule.monthWeekday) return false;
  if (rule.monthPosition === -1) return new Date(current.getTime() + 7 * dayMs).getUTCMonth() !== current.getUTCMonth();
  return Math.floor((current.getUTCDate() - 1) / 7) + 1 === rule.monthPosition;
}

export function recurrencePreview(input: Recurrence, from: string, timezone: string, horizonWeeks = 6) {
  const rule = recurrenceSchema.parse(input);
  if (!validDay(from) || !Number.isInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 26) throw new Error("Ongeldige generatiehorizon");
  const start = utcDay(from).getTime();
  return Array.from({ length: horizonWeeks * 7 }, (_, i) => new Date(start + i * dayMs).toISOString().slice(0, 10))
    .filter(day => matchesRecurrence(rule, day))
    .map(day => {
      try {
        // PostgreSQL AT TIME ZONE also selects the later occurrence during the autumn fold.
        const endDate = rule.endsAt <= rule.startsAt ? new Date(utcDay(day).getTime() + dayMs).toISOString().slice(0, 10) : day;
        return { day, start: localToInstant(`${day}T${rule.startsAt}`, timezone, "later"), end: localToInstant(`${endDate}T${rule.endsAt}`, timezone, "later"), skipped: false };
      } catch {
        return { day, start: null, end: null, skipped: true };
      }
    });
}
