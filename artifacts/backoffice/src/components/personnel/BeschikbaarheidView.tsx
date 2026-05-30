"use client";

import { useState, useTransition } from "react";
import { Save, Plus, Trash2, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import {
  setAvailabilityWindows,
  addLeavePeriod,
  deleteLeavePeriod,
  LEAVE_TYPES,
  type AvailabilityWindow,
  type LeavePeriod,
  type LeaveType,
} from "@/app/actions/availability";

// ─── Day configuration ────────────────────────────────────────────────────────

const DAYS = [
  { dow: 1, label: "Maandag" },
  { dow: 2, label: "Dinsdag" },
  { dow: 3, label: "Woensdag" },
  { dow: 4, label: "Donderdag" },
  { dow: 5, label: "Vrijdag" },
  { dow: 6, label: "Zaterdag" },
  { dow: 0, label: "Zondag" },
] as const;

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  vakantie: "Vakantie",
  ziekte:   "Ziekte",
  overig:   "Overig",
};

type DayConfig = { enabled: boolean; startTime: string; endTime: string };

function windowsToDayConfig(windows: AvailabilityWindow[]): Record<number, DayConfig> {
  const map: Record<number, DayConfig> = {};
  for (const dow of DAYS.map((d) => d.dow)) {
    const w = windows.find((w) => w.dayOfWeek === dow);
    map[dow] = w
      ? { enabled: true, startTime: w.startTime, endTime: w.endTime }
      : { enabled: false, startTime: "08:00", endTime: "17:00" };
  }
  return map;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  personnelId:   string;
  windows:       AvailabilityWindow[];
  leavePeriods:  LeavePeriod[];
  canWrite:      boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BeschikbaarheidView({
  personnelId,
  windows: initialWindows,
  leavePeriods: initialLeave,
  canWrite,
}: Props) {
  const [dayConfig, setDayConfig] = useState(() => windowsToDayConfig(initialWindows));
  const [leavePeriods, setLeavePeriods] = useState(initialLeave);
  const [showAddLeave, setShowAddLeave] = useState(false);

  const [scheduleSaved, setScheduleSaved]   = useState(false);
  const [scheduleError, setScheduleError]   = useState<string | null>(null);
  const [leaveError, setLeaveError]         = useState<string | null>(null);

  const [schedulePending, startSchedule]    = useTransition();
  const [leavePending, startLeave]          = useTransition();

  // ─── Weekschema handlers ────────────────────────────────────────────────────

  function toggleDay(dow: number) {
    setDayConfig((prev) => ({
      ...prev,
      [dow]: { ...prev[dow]!, enabled: !prev[dow]?.enabled },
    }));
  }

  function updateTime(dow: number, field: "startTime" | "endTime", value: string) {
    setDayConfig((prev) => ({
      ...prev,
      [dow]: { ...prev[dow]!, [field]: value },
    }));
  }

  function handleSaveSchedule() {
    setScheduleError(null);
    setScheduleSaved(false);
    const windows = DAYS
      .filter((d) => dayConfig[d.dow]?.enabled)
      .map((d) => ({
        dayOfWeek: d.dow,
        startTime: dayConfig[d.dow]!.startTime,
        endTime:   dayConfig[d.dow]!.endTime,
      }));

    startSchedule(async () => {
      const result = await setAvailabilityWindows(personnelId, windows);
      if (result.success) {
        setScheduleSaved(true);
        setTimeout(() => setScheduleSaved(false), 2500);
      } else {
        setScheduleError((result as { message?: string }).message ?? "Opslaan mislukt.");
      }
    });
  }

  // ─── Leave handlers ─────────────────────────────────────────────────────────

  function handleDeleteLeave(id: string) {
    if (!confirm("Weet u zeker dat u deze verlofperiode wilt verwijderen?")) return;
    startLeave(async () => {
      const result = await deleteLeavePeriod(id, personnelId);
      if (result.success) {
        setLeavePeriods((prev) => prev.filter((l) => l.id !== id));
      } else {
        setLeaveError((result as { message?: string }).message ?? "Verwijderen mislukt.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Weekschema ────────────────────────────────────────────────────── */}
      <div className="veele-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
            Weekrooster
          </h2>
          <p className="text-xs" style={{ color: "#94A3B8" }}>
            Geef aan op welke dagen en tijden dit personeelslid beschikbaar is
          </p>
        </div>

        <div className="space-y-2">
          {DAYS.map(({ dow, label }) => {
            const cfg = dayConfig[dow]!;
            return (
              <div
                key={dow}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  backgroundColor: cfg.enabled ? "rgba(0,183,179,0.04)" : "transparent",
                  border: `1px solid ${cfg.enabled ? "rgba(0,183,179,0.2)" : "#F1F5F9"}`,
                }}
              >
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => canWrite && toggleDay(dow)}
                  disabled={!canWrite}
                  className="relative flex-shrink-0 rounded-full transition-colors focus-visible:outline-none"
                  style={{
                    width: "36px",
                    height: "20px",
                    backgroundColor: cfg.enabled ? "#00B7B3" : "#CBD5E1",
                    cursor: canWrite ? "pointer" : "default",
                  }}
                  aria-checked={cfg.enabled}
                  role="switch"
                >
                  <span
                    className="absolute top-0.5 left-0.5 rounded-full bg-white transition-transform"
                    style={{
                      width: "16px",
                      height: "16px",
                      transform: cfg.enabled ? "translateX(16px)" : "translateX(0)",
                    }}
                  />
                </button>

                {/* Day label */}
                <span
                  className="w-24 text-sm font-medium flex-shrink-0"
                  style={{ color: cfg.enabled ? "#081D3A" : "#94A3B8" }}
                >
                  {label}
                </span>

                {/* Time inputs */}
                {cfg.enabled ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={cfg.startTime}
                      onChange={(e) => updateTime(dow, "startTime", e.target.value)}
                      disabled={!canWrite}
                      className="veele-input w-28 text-sm"
                      style={{ padding: "4px 8px" }}
                    />
                    <span className="text-sm" style={{ color: "#94A3B8" }}>t/m</span>
                    <input
                      type="time"
                      value={cfg.endTime}
                      onChange={(e) => updateTime(dow, "endTime", e.target.value)}
                      disabled={!canWrite}
                      className="veele-input w-28 text-sm"
                      style={{ padding: "4px 8px" }}
                    />
                  </div>
                ) : (
                  <span className="text-sm flex-1" style={{ color: "#CBD5E1" }}>
                    Niet beschikbaar
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {canWrite && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveSchedule}
              disabled={schedulePending}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#081D3A" }}
            >
              <Save className="h-3.5 w-3.5" />
              {schedulePending ? "Opslaan…" : "Rooster opslaan"}
            </button>

            {scheduleSaved && (
              <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}>
                <CheckCircle2 className="h-4 w-4" />
                Opgeslagen
              </span>
            )}
            {scheduleError && (
              <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
                <AlertCircle className="h-4 w-4" />
                {scheduleError}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Verlofperiodes ────────────────────────────────────────────────── */}
      <div className="veele-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
            Verlof & afwezigheid
          </h2>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowAddLeave((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "#00B7B3" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Periode toevoegen
            </button>
          )}
        </div>

        {leaveError && (
          <div
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {leaveError}
          </div>
        )}

        {/* Add leave form */}
        {showAddLeave && canWrite && (
          <AddLeaveForm
            personnelId={personnelId}
            isPending={leavePending}
            onSave={(period) => {
              setLeavePeriods((prev) => [...prev, period].sort((a, b) => a.startDate.localeCompare(b.startDate)));
              setShowAddLeave(false);
            }}
            onCancel={() => setShowAddLeave(false)}
            onError={(msg) => setLeaveError(msg)}
            startTransition={startLeave}
          />
        )}

        {/* Leave table */}
        {leavePeriods.length === 0 && !showAddLeave ? (
          <div className="py-8 text-center" style={{ color: "#94A3B8" }}>
            <Calendar className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm">Geen verlofperiodes geregistreerd.</p>
          </div>
        ) : leavePeriods.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Begindatum", "Einddatum", "Type", "Reden", ""].map((h) => (
                  <th
                    key={h}
                    className="pb-2 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "#94A3B8" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leavePeriods.map((lp) => {
                const isPast = lp.endDate < new Date().toISOString().slice(0, 10);
                const isCurrent =
                  lp.startDate <= new Date().toISOString().slice(0, 10) &&
                  lp.endDate   >= new Date().toISOString().slice(0, 10);
                return (
                  <tr key={lp.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td className="py-2.5 pr-4" style={{ color: isPast ? "#94A3B8" : "#081D3A" }}>
                      {formatDate(lp.startDate)}
                    </td>
                    <td className="py-2.5 pr-4" style={{ color: isPast ? "#94A3B8" : "#081D3A" }}>
                      {formatDate(lp.endDate)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <LeaveBadge type={lp.leaveType} isCurrent={isCurrent} />
                    </td>
                    <td className="py-2.5 pr-4 max-w-xs truncate" style={{ color: "#64748B" }}>
                      {lp.reason ?? <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {canWrite && !isPast && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLeave(lp.id)}
                          disabled={leavePending}
                          className="rounded p-1 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" style={{ color: "#EF4444" }} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

// ─── Add Leave Form ───────────────────────────────────────────────────────────

function AddLeaveForm({
  personnelId,
  isPending,
  onSave,
  onCancel,
  onError,
  startTransition,
}: {
  personnelId:     string;
  isPending:       boolean;
  onSave:          (period: LeavePeriod) => void;
  onCancel:        () => void;
  onError:         (msg: string) => void;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [leaveType, setLeaveType] = useState<LeaveType>("vakantie");
  const [reason,    setReason]    = useState("");
  const [error,     setError]     = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLeavePeriod({
        personnelId,
        startDate,
        endDate,
        leaveType,
        reason: reason || undefined,
      });
      if (result.success && result.data) {
        onSave({
          id:          result.data.id,
          personnelId,
          startDate,
          endDate,
          leaveType,
          reason:      reason || null,
          createdAt:   new Date().toISOString(),
        });
      } else {
        const msg = (result as { message?: string }).message ?? "Toevoegen mislukt.";
        setError(msg);
        onError(msg);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg p-4 space-y-3"
      style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
        Nieuwe verlofperiode
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            Begindatum <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            disabled={isPending}
            className="veele-input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            Einddatum <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            disabled={isPending}
            className="veele-input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            Type <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            disabled={isPending}
            className="veele-input w-full text-sm"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            Reden
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optioneel"
            disabled={isPending}
            className="veele-input w-full text-sm"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !startDate || !endDate}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#081D3A" }}
        >
          {isPending ? "Toevoegen…" : "Toevoegen"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium border"
          style={{ borderColor: "#E2E8F0", color: "#475569" }}
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function LeaveBadge({ type, isCurrent }: { type: LeaveType; isCurrent: boolean }) {
  const styles: Record<LeaveType, { bg: string; color: string }> = {
    vakantie: { bg: "#DBEAFE", color: "#1D4ED8" },
    ziekte:   { bg: "#FEE2E2", color: "#991B1B" },
    overig:   { bg: "#F3F4F6", color: "#374151" },
  };
  const s = styles[type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {isCurrent && (
        <span
          className="inline-block rounded-full flex-shrink-0"
          style={{ width: "5px", height: "5px", backgroundColor: s.color }}
        />
      )}
      {LEAVE_TYPE_LABELS[type]}
    </span>
  );
}
