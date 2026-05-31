"use client";

import { useActionState, useState } from "react";
import { saveAvailabilityWindows, type AvailabilityWindow } from "@/actions/availability";

const DAYS = [
  { dow: 1, label: "Maandag" },
  { dow: 2, label: "Dinsdag" },
  { dow: 3, label: "Woensdag" },
  { dow: 4, label: "Donderdag" },
  { dow: 5, label: "Vrijdag" },
  { dow: 6, label: "Zaterdag" },
  { dow: 0, label: "Zondag" },
];

type State = { success?: boolean; error?: string } | undefined;

export function BeschikbaarheidForm({
  initialWindows,
}: {
  initialWindows: AvailabilityWindow[];
}) {
  const initialMap = Object.fromEntries(
    initialWindows.map((w) => [w.dayOfWeek, { startTime: w.startTime, endTime: w.endTime }]),
  );

  const [enabled, setEnabled] = useState<Record<number, boolean>>(
    Object.fromEntries(DAYS.map((d) => [d.dow, d.dow in initialMap])),
  );
  const [times, setTimes] = useState<Record<number, { startTime: string; endTime: string }>>(
    Object.fromEntries(
      DAYS.map((d) => [
        d.dow,
        initialMap[d.dow] ?? { startTime: "08:00", endTime: "17:00" },
      ]),
    ),
  );

  const [state, formAction, isPending] = useActionState(
    async (_prev: State, _formData: FormData): Promise<State> => {
      const windows: AvailabilityWindow[] = DAYS.filter((d) => enabled[d.dow]).map(
        (d) => ({
          dayOfWeek: d.dow,
          startTime: times[d.dow].startTime,
          endTime: times[d.dow].endTime,
        }),
      );
      return saveAvailabilityWindows(windows);
    },
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3">
      {DAYS.map((day) => (
        <div
          key={day.dow}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium" style={{ color: "var(--color-primary)" }}>
              {day.label}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled[day.dow]}
              onClick={() =>
                setEnabled((prev) => ({ ...prev, [day.dow]: !prev[day.dow] }))
              }
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{
                backgroundColor: enabled[day.dow]
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{
                  transform: enabled[day.dow] ? "translateX(22px)" : "translateX(2px)",
                }}
              />
            </button>
          </div>

          {enabled[day.dow] && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted-fg)" }}>
                  Van
                </label>
                <input
                  type="time"
                  value={times[day.dow].startTime}
                  onChange={(e) =>
                    setTimes((prev) => ({
                      ...prev,
                      [day.dow]: { ...prev[day.dow], startTime: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
              </div>
              <span className="mt-5 text-sm" style={{ color: "var(--color-secondary)" }}>–</span>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted-fg)" }}>
                  Tot
                </label>
                <input
                  type="time"
                  value={times[day.dow].endTime}
                  onChange={(e) =>
                    setTimes((prev) => ({
                      ...prev,
                      [day.dow]: { ...prev[day.dow], endTime: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {state?.error && (
        <p className="rounded-xl px-3 py-2.5 text-sm" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-xl px-3 py-2.5 text-sm font-medium" style={{ backgroundColor: "#F0FDF4", color: "#16A34A" }}>
          Beschikbaarheid opgeslagen
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl px-4 py-4 text-base font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {isPending ? "Opslaan…" : "Beschikbaarheid opslaan"}
      </button>
    </form>
  );
}
