"use client";

import { useState, useTransition } from "react";
import { Save, Plus, Trash2, Pencil, X, AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import {
  setAvailabilityWindows,
  addLeavePeriod,
  updateLeavePeriod,
  deleteLeavePeriod,
  type AvailabilityWindow,
  type LeavePeriod,
  type LeaveType,
} from "@/app/actions/availability";
import { LEAVE_TYPES } from "@/types/availability";

// ─── Constants ────────────────────────────────────────────────────────────────

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
  for (const { dow } of DAYS) {
    const w = windows.find((w) => w.dayOfWeek === dow);
    map[dow] = w
      ? { enabled: true, startTime: w.startTime, endTime: w.endTime }
      : { enabled: false, startTime: "08:00", endTime: "17:00" };
  }
  return map;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  personnelId:  string;
  windows:      AvailabilityWindow[];
  leavePeriods: LeavePeriod[];
  canWrite:     boolean;
}

export function BeschikbaarheidView({
  personnelId,
  windows: initialWindows,
  leavePeriods: initialLeave,
  canWrite,
}: Props) {
  const [dayConfig, setDayConfig]         = useState(() => windowsToDayConfig(initialWindows));
  const [leavePeriods, setLeavePeriods]   = useState(initialLeave);
  const [showAddLeave, setShowAddLeave]   = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [leaveError, setLeaveError]       = useState<string | null>(null);

  const [schedulePending, startSchedule]  = useTransition();
  const [leavePending, startLeave]        = useTransition();

  // ─── Weekschema ────────────────────────────────────────────────────────────

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
    const wins = DAYS
      .filter((d) => dayConfig[d.dow]?.enabled)
      .map((d) => ({
        dayOfWeek: d.dow,
        startTime: dayConfig[d.dow]!.startTime,
        endTime:   dayConfig[d.dow]!.endTime,
      }));

    startSchedule(async () => {
      const result = await setAvailabilityWindows(personnelId, wins);
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
    setLeaveError(null);
    startLeave(async () => {
      const result = await deleteLeavePeriod(id, personnelId);
      if (result.success) {
        setLeavePeriods((prev) => prev.filter((l) => l.id !== id));
      } else {
        setLeaveError((result as { message?: string }).message ?? "Verwijderen mislukt.");
      }
    });
  }

  function handleLeaveAdded(period: LeavePeriod) {
    setLeavePeriods((prev) =>
      [...prev, period].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    );
    setShowAddLeave(false);
  }

  function handleLeaveUpdated(updated: LeavePeriod) {
    setLeavePeriods((prev) =>
      prev
        .map((l) => (l.id === updated.id ? updated : l))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    );
    setEditingLeaveId(null);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ── Weekschema ──────────────────────────────────────────────────── */}
      <div className="veele-card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
              Weekrooster
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
              Op welke dagen en tijden is dit personeelslid beschikbaar?
            </p>
          </div>
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
                <button
                  type="button"
                  onClick={() => canWrite && toggleDay(dow)}
                  disabled={!canWrite}
                  className="relative flex-shrink-0 rounded-full transition-colors"
                  style={{
                    width: "36px", height: "20px",
                    backgroundColor: cfg.enabled ? "#00B7B3" : "#CBD5E1",
                    cursor: canWrite ? "pointer" : "default",
                  }}
                  role="switch"
                  aria-checked={cfg.enabled}
                >
                  <span
                    className="absolute top-0.5 left-0.5 rounded-full bg-white transition-transform"
                    style={{
                      width: "16px", height: "16px",
                      transform: cfg.enabled ? "translateX(16px)" : "translateX(0)",
                    }}
                  />
                </button>

                <span
                  className="w-24 text-sm font-medium flex-shrink-0"
                  style={{ color: cfg.enabled ? "#081D3A" : "#94A3B8" }}
                >
                  {label}
                </span>

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
                <CheckCircle2 className="h-4 w-4" />Opgeslagen
              </span>
            )}
            {scheduleError && (
              <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
                <AlertCircle className="h-4 w-4" />{scheduleError}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Verlofperiodes ───────────────────────────────────────────────── */}
      <div className="veele-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
            Verlof &amp; afwezigheid
          </h2>
          {canWrite && !showAddLeave && (
            <button
              type="button"
              onClick={() => { setShowAddLeave(true); setEditingLeaveId(null); }}
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

        {showAddLeave && canWrite && (
          <LeaveForm
            personnelId={personnelId}
            isPending={leavePending}
            startTransition={startLeave}
            onCancel={() => setShowAddLeave(false)}
            onSave={handleLeaveAdded}
            onError={(msg) => setLeaveError(msg)}
          />
        )}

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
                const isPast    = lp.endDate !== null && lp.endDate < today;
                const isCurrent =
                  lp.startDate <= today &&
                  (lp.endDate === null || lp.endDate >= today);

                if (editingLeaveId === lp.id) {
                  return (
                    <tr key={lp.id}>
                      <td colSpan={5} className="py-2">
                        <LeaveForm
                          personnelId={personnelId}
                          initial={lp}
                          isPending={leavePending}
                          startTransition={startLeave}
                          onCancel={() => setEditingLeaveId(null)}
                          onSave={(updated) => handleLeaveUpdated(updated)}
                          onError={(msg) => setLeaveError(msg)}
                        />
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={lp.id} style={{ borderBottom: "1px solid #F8FAFC" }}>
                    <td className="py-2.5 pr-4" style={{ color: isPast ? "#94A3B8" : "#081D3A" }}>
                      {formatDate(lp.startDate)}
                    </td>
                    <td className="py-2.5 pr-4" style={{ color: isPast ? "#94A3B8" : "#081D3A" }}>
                      {lp.endDate ? formatDate(lp.endDate) : (
                        <span style={{ color: isCurrent ? "#EF4444" : "#94A3B8", fontStyle: "italic" }}>
                          Doorlopend
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <LeaveBadge type={lp.leaveType} isCurrent={isCurrent} />
                    </td>
                    <td className="py-2.5 pr-4 max-w-xs truncate" style={{ color: "#64748B" }}>
                      {lp.reason ?? <span style={{ color: "#CBD5E1" }}>—</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      {canWrite && !isPast && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingLeaveId(lp.id); setShowAddLeave(false); }}
                            disabled={leavePending}
                            className="rounded p-1 hover:bg-slate-100 transition-colors disabled:opacity-40"
                            title="Bewerken"
                          >
                            <Pencil className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLeave(lp.id)}
                            disabled={leavePending}
                            className="rounded p-1 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: "#EF4444" }} />
                          </button>
                        </div>
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

// ─── LeaveForm (add + edit) ───────────────────────────────────────────────────

function LeaveForm({
  personnelId,
  initial,
  isPending,
  startTransition,
  onSave,
  onCancel,
  onError,
}: {
  personnelId:     string;
  initial?:        LeavePeriod;
  isPending:       boolean;
  startTransition: (fn: () => Promise<void>) => void;
  onSave:          (period: LeavePeriod) => void;
  onCancel:        () => void;
  onError:         (msg: string) => void;
}) {
  const today   = new Date().toISOString().slice(0, 10);
  const isEdit  = !!initial;

  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate,   setEndDate]   = useState(initial?.endDate   ?? "");
  const [leaveType, setLeaveType] = useState<LeaveType>(initial?.leaveType ?? "vakantie");
  const [reason,    setReason]    = useState(initial?.reason    ?? "");
  const [error,     setError]     = useState<string | null>(null);

  const endDateRequired = leaveType !== "ziekte";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      if (isEdit) {
        const result = await updateLeavePeriod(initial!.id, personnelId, {
          startDate,
          endDate:   endDate || undefined,
          leaveType,
          reason:    reason || undefined,
        });
        if (result.success) {
          onSave({
            ...initial!,
            startDate,
            endDate:  endDate || null,
            leaveType,
            reason:   reason || null,
          });
        } else {
          const msg = (result as { message?: string }).message ?? "Bijwerken mislukt.";
          setError(msg);
          onError(msg);
        }
      } else {
        const result = await addLeavePeriod({
          personnelId,
          startDate,
          endDate:  endDate || undefined,
          leaveType,
          reason:   reason || undefined,
        });
        if (result.success && result.data) {
          onSave({
            id:          result.data.id,
            personnelId,
            startDate,
            endDate:     endDate || null,
            leaveType,
            reason:      reason || null,
            createdAt:   new Date().toISOString(),
          });
        } else {
          const msg = (result as { message?: string }).message ?? "Toevoegen mislukt.";
          setError(msg);
          onError(msg);
        }
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg p-4 space-y-3"
      style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
        {isEdit ? "Verlofperiode bewerken" : "Nieuwe verlofperiode"}
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
            Einddatum
            {endDateRequired ? <span style={{ color: "#DC2626" }}> *</span> : (
              <span style={{ color: "#94A3B8" }}> (optioneel)</span>
            )}
          </label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required={endDateRequired}
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
            onChange={(e) => {
              setLeaveType(e.target.value as LeaveType);
              if (e.target.value !== "ziekte") {
                // Keep endDate if already set; if not, don't auto-clear
              }
            }}
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

      {leaveType === "ziekte" && !endDate && (
        <p className="text-xs" style={{ color: "#D97706" }}>
          Geen einddatum ingevuld — ziekmelding wordt als doorlopend geregistreerd.
        </p>
      )}

      {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !startDate || (endDateRequired && !endDate)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#081D3A" }}
        >
          {isPending ? (isEdit ? "Bijwerken…" : "Toevoegen…") : (isEdit ? "Bijwerken" : "Toevoegen")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium border"
          style={{ borderColor: "#E2E8F0", color: "#475569" }}
        >
          <X className="h-3.5 w-3.5 inline mr-1" />
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
