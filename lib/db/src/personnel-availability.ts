import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./connection";
import {
  auditLogTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  personnelTable,
} from "./schema";

export type AvailabilityRepeat = "none" | "daily" | "weekly" | "monthly";
export type AvailabilityConflict = { code: "conflict"; message: string };
export type AvailabilityServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: "invalid" | "not_found" | "conflict"; message: string };

export type WeeklyAvailabilityInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type DateExceptionInput = {
  date: string;
  startTime: string;
  endTime: string;
  repeatType: AvailabilityRepeat;
  isEmergencyAvailable: boolean;
  expectedUpdatedAt?: string | null;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function todayDateKey(): string {
  return dateKey(new Date());
}
function parseDateKey(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  return dateKey(parsed) === value ? parsed : null;
}
export function addAvailabilityDays(value: string, days: number): string {
  const date = parseDateKey(value);
  if (!date) throw new Error("invalid date");
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
function addMonths(
  value: string,
  months: number,
  preferredDay: number,
): string {
  const source = parseDateKey(value)!;
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(preferredDay, lastDay));
  return dateKey(target);
}
export function buildAvailabilityRepeatDates(
  startDate: string,
  repeatType: AvailabilityRepeat,
  maxDate: string,
): string[] {
  const dates: string[] = [];
  const parsed = parseDateKey(startDate);
  if (!parsed) return dates;
  const preferredDay = parsed.getDate();
  let current = startDate;
  let step = 0;
  while (current <= maxDate && dates.length < 380) {
    dates.push(current);
    if (repeatType === "none") break;
    if (repeatType === "daily") current = addAvailabilityDays(current, 1);
    if (repeatType === "weekly") current = addAvailabilityDays(current, 7);
    if (repeatType === "monthly")
      current = addMonths(startDate, ++step, preferredDay);
  }
  return dates;
}
function normalizeTimeRange(
  startTime: string,
  endTime: string,
): { startTime: string; endTime: string } | string {
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime))
    return "Ongeldig tijdformaat (verwacht HH:MM)";
  if (startTime >= endTime) return "Begintijd moet voor eindtijd liggen";
  return { startTime, endTime };
}
function sameInstant(a?: string | null, b?: Date | string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function isValidInstant(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

export async function resolveActivePersonnelForUser(input: {
  tenantId: string;
  userId: string;
}) {
  const [person] = await db
    .select({
      id: personnelTable.id,
      tenantId: personnelTable.tenantId,
      isActive: personnelTable.isActive,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.tenantId, input.tenantId),
        eq(personnelTable.userId, input.userId),
        eq(personnelTable.isActive, true),
      ),
    )
    .limit(1);
  return person ?? null;
}

export async function saveWeeklyAvailability(input: {
  tenantId: string;
  userId: string;
  windows: WeeklyAvailabilityInput[];
  expectedVersion?: string | null;
}): Promise<AvailabilityServiceResult<{ version: string }>> {
  if (!input.tenantId)
    return { ok: false, code: "invalid", message: "Tenantcontext ontbreekt" };
  const seen = new Set<number>();
  for (const window of input.windows) {
    if (
      window.dayOfWeek < 0 ||
      window.dayOfWeek > 6 ||
      seen.has(window.dayOfWeek)
    )
      return {
        ok: false,
        code: "invalid",
        message: "Ongeldige of dubbele weekdag",
      };
    seen.add(window.dayOfWeek);
    const normalized = normalizeTimeRange(window.startTime, window.endTime);
    if (typeof normalized === "string")
      return { ok: false, code: "invalid", message: normalized };
  }
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.tenantId, input.tenantId),
          eq(personnelTable.userId, input.userId),
          eq(personnelTable.isActive, true),
        ),
      )
      .for("update")
      .limit(1);
    if (!person)
      return {
        ok: false as const,
        code: "not_found" as const,
        message: "Actief personeelsprofiel niet gevonden",
      };
    const existing = await tx
      .select()
      .from(availabilityWindowsTable)
      .where(eq(availabilityWindowsTable.personnelId, person.id))
      .for("update");
    const version =
      existing
        .map((row) => row.updatedAt ?? row.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    if (input.expectedVersion && !sameInstant(input.expectedVersion, version))
      return {
        ok: false as const,
        code: "conflict" as const,
        message: "Beschikbaarheid is gewijzigd. Vernieuw en probeer opnieuw.",
      };
    const nextDays = new Set(input.windows.map((w) => w.dayOfWeek));
    const now = new Date();
    for (const stale of existing.filter((row) => !nextDays.has(row.dayOfWeek)))
      await tx
        .delete(availabilityWindowsTable)
        .where(eq(availabilityWindowsTable.id, stale.id));
    for (const window of input.windows)
      await tx
        .insert(availabilityWindowsTable)
        .values({ personnelId: person.id, ...window, updatedAt: now })
        .onConflictDoUpdate({
          target: [
            availabilityWindowsTable.personnelId,
            availabilityWindowsTable.dayOfWeek,
          ],
          set: {
            startTime: window.startTime,
            endTime: window.endTime,
            updatedAt: now,
          },
        });
    await tx.insert(auditLogTable).values({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "availability.weekly.save",
      resource: "availability_windows",
      resourceId: person.id,
      metadata: { days: input.windows.length },
    });
    return { ok: true as const, version: now.toISOString() };
  });
}

export async function saveDateAvailabilityExceptions(input: {
  tenantId: string;
  userId: string;
  exception: DateExceptionInput;
  maxDate: string;
}): Promise<
  AvailabilityServiceResult<{
    savedDates: string[];
    versions: Record<string, string>;
    version: string;
  }>
> {
  if (!input.tenantId)
    return { ok: false, code: "invalid", message: "Tenantcontext ontbreekt" };
  if (!parseDateKey(input.exception.date) || !parseDateKey(input.maxDate))
    return { ok: false, code: "invalid", message: "Ongeldige datum" };
  if (
    !["none", "daily", "weekly", "monthly"].includes(input.exception.repeatType)
  )
    return { ok: false, code: "invalid", message: "Ongeldige herhaling" };
  const normalized = normalizeTimeRange(
    input.exception.startTime,
    input.exception.endTime,
  );
  if (typeof normalized === "string")
    return { ok: false, code: "invalid", message: normalized };
  if (input.exception.date < todayDateKey())
    return {
      ok: false,
      code: "invalid",
      message: "Beschikbaarheid kan niet in het verleden worden aangepast",
    };
  if (input.exception.date > input.maxDate)
    return {
      ok: false,
      code: "invalid",
      message: "Datum valt buiten toegestane periode",
    };
  const dates = buildAvailabilityRepeatDates(
    input.exception.date,
    input.exception.repeatType,
    input.maxDate,
  );
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.tenantId, input.tenantId),
          eq(personnelTable.userId, input.userId),
          eq(personnelTable.isActive, true),
        ),
      )
      .for("update")
      .limit(1);
    if (!person)
      return {
        ok: false as const,
        code: "not_found" as const,
        message: "Actief personeelsprofiel niet gevonden",
      };
    const existing = await tx
      .select()
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, person.id),
          inArray(availabilityDayEntriesTable.date, dates),
        ),
      )
      .for("update");
    const selected = existing.find((row) => row.date === input.exception.date);
    if (
      input.exception.expectedUpdatedAt &&
      !sameInstant(
        input.exception.expectedUpdatedAt,
        selected?.updatedAt ?? null,
      )
    )
      return {
        ok: false as const,
        code: "conflict" as const,
        message: "Beschikbaarheid is gewijzigd. Vernieuw en probeer opnieuw.",
      };
    const now = new Date();
    const repeatGroupId =
      input.exception.repeatType === "none" ? null : randomUUID();
    const storedVersions: Record<string, string> = {};
    for (const date of dates) {
      const [stored] = await tx
        .insert(availabilityDayEntriesTable)
        .values({
          personnelId: person.id,
          date,
          startTime: input.exception.startTime,
          endTime: input.exception.endTime,
          isEmergencyAvailable: input.exception.isEmergencyAvailable,
          repeatType: input.exception.repeatType,
          repeatGroupId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            availabilityDayEntriesTable.personnelId,
            availabilityDayEntriesTable.date,
          ],
          set: {
            startTime: sql`excluded.start_time`,
            endTime: sql`excluded.end_time`,
            isEmergencyAvailable: sql`excluded.is_emergency_available`,
            repeatType: sql`excluded.repeat_type`,
            repeatGroupId: sql`excluded.repeat_group_id`,
            updatedAt: now,
          },
        })
        .returning({
          date: availabilityDayEntriesTable.date,
          updatedAt: availabilityDayEntriesTable.updatedAt,
        });
      if (!stored?.updatedAt)
        throw new Error("Opgeslagen beschikbaarheidsversie ontbreekt.");
      storedVersions[stored.date] = stored.updatedAt.toISOString();
    }
    const selectedVersion = storedVersions[input.exception.date];
    if (!selectedVersion)
      throw new Error("Opgeslagen beschikbaarheidsversie ontbreekt.");
    await tx.insert(auditLogTable).values({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "availability.exception.save",
      resource: "availability_day_entries",
      resourceId: person.id,
      metadata: { dates },
    });
    return {
      ok: true as const,
      savedDates: dates,
      versions: storedVersions,
      version: selectedVersion,
    };
  });
}

export async function deleteDateAvailabilityException(input: {
  tenantId: string;
  userId: string;
  date: string;
  expectedUpdatedAt: string;
}): Promise<
  AvailabilityServiceResult<{ deleted: boolean; replayed: boolean }>
> {
  if (!input.tenantId) {
    return { ok: false, code: "invalid", message: "Tenantcontext ontbreekt" };
  }
  if (!parseDateKey(input.date)) {
    return { ok: false, code: "invalid", message: "Ongeldige datum" };
  }
  if (!input.expectedUpdatedAt || !isValidInstant(input.expectedUpdatedAt)) {
    return {
      ok: false,
      code: "invalid",
      message:
        "De versie van deze beschikbaarheid ontbreekt. Vernieuw en probeer opnieuw.",
    };
  }

  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.tenantId, input.tenantId),
          eq(personnelTable.userId, input.userId),
          eq(personnelTable.isActive, true),
        ),
      )
      .for("update")
      .limit(1);

    if (!person) {
      return {
        ok: false as const,
        code: "not_found" as const,
        message: "Actief personeelsprofiel niet gevonden",
      };
    }

    const [entry] = await tx
      .select({
        id: availabilityDayEntriesTable.id,
        updatedAt: availabilityDayEntriesTable.updatedAt,
      })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, person.id),
          eq(availabilityDayEntriesTable.date, input.date),
        ),
      )
      .for("update")
      .limit(1);

    if (!entry) {
      return { ok: true as const, deleted: false, replayed: true };
    }
    if (!sameInstant(input.expectedUpdatedAt, entry.updatedAt)) {
      return {
        ok: false as const,
        code: "conflict" as const,
        message: "Beschikbaarheid is gewijzigd. Vernieuw en probeer opnieuw.",
      };
    }

    await tx
      .delete(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.id, entry.id),
          eq(availabilityDayEntriesTable.personnelId, person.id),
        ),
      );
    await tx.insert(auditLogTable).values({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "availability.exception.delete",
      resource: "availability_day_entries",
      resourceId: entry.id,
      metadata: {
        date: input.date,
        expectedUpdatedAt: input.expectedUpdatedAt,
      },
    });

    return { ok: true as const, deleted: true, replayed: false };
  });
}
