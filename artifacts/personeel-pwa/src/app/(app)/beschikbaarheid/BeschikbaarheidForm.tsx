"use client";

import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteAvailabilityDay,
  saveAvailabilityDay,
  type AvailabilityCalendarData,
  type AvailabilityDayEntry,
  type AvailabilityRepeat,
} from "@/actions/availability";

const WEEKDAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const REPEAT_OPTIONS: Array<{ value: AvailabilityRepeat; label: string }> = [
  { value: "none", label: "Geen" },
  { value: "daily", label: "Dagelijks" },
  { value: "weekly", label: "Wekelijks" },
  { value: "monthly", label: "Maandelijks" },
];

type EditorState = {
  startTime: string;
  endTime: string;
  repeatType: AvailabilityRepeat;
  isEmergencyAvailable: boolean;
};

type CalendarDay = {
  key: string;
  day: number;
  inMonth: boolean;
};

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addDays(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function addMonths(
  value: string,
  months: number,
  preferredDay: number,
): string {
  const source = parseDateKey(value);
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(preferredDay, lastDay));
  return dateKey(target);
}

function buildRepeatDates(
  startDate: string,
  repeatType: AvailabilityRepeat,
  maxDate: string,
): string[] {
  const dates: string[] = [];
  const preferredDay = parseDateKey(startDate).getDate();
  let current = startDate;
  let step = 0;

  while (current <= maxDate && dates.length < 380) {
    dates.push(current);
    if (repeatType === "none") break;
    if (repeatType === "daily") current = addDays(current, 1);
    if (repeatType === "weekly") current = addDays(current, 7);
    if (repeatType === "monthly") {
      step += 1;
      current = addMonths(startDate, step, preferredDay);
    }
  }

  return dates;
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function firstOfMonth(value: string): string {
  return `${monthKey(value)}-01`;
}

function shiftMonth(value: string, direction: -1 | 1): string {
  const date = parseDateKey(firstOfMonth(value));
  date.setMonth(date.getMonth() + direction);
  return dateKey(date);
}

function monthLabel(value: string): string {
  const label = parseDateKey(firstOfMonth(value)).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullDateLabel(value: string): string {
  const label = parseDateKey(value).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function repeatLabel(value: AvailabilityRepeat): string {
  if (value === "daily") return "Dagelijks";
  if (value === "weekly") return "Wekelijks";
  if (value === "monthly") return "Maandelijks";
  return "Geen";
}

function buildCalendarDays(viewMonth: string): CalendarDay[] {
  const first = parseDateKey(firstOfMonth(viewMonth));
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      day: date.getDate(),
      inMonth: monthKey(key) === monthKey(viewMonth),
    };
  });
}

function lastOfMonth(value: string): string {
  const first = parseDateKey(firstOfMonth(value));
  return dateKey(new Date(first.getFullYear(), first.getMonth() + 1, 0));
}

function defaultEditor(entry?: AvailabilityDayEntry | null): EditorState {
  return {
    startTime: entry?.startTime ?? "09:00",
    endTime: entry?.endTime ?? "17:00",
    repeatType: entry?.repeatType ?? "none",
    isEmergencyAvailable: entry?.isEmergencyAvailable ?? false,
  };
}

export function BeschikbaarheidForm({
  data,
}: {
  data: AvailabilityCalendarData;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<AvailabilityDayEntry[]>(data.entries);
  const [selectedDate, setSelectedDate] = useState(data.today);
  const [viewMonth, setViewMonth] = useState(firstOfMonth(data.today));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => defaultEditor(null));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const entryByDate = useMemo(
    () => new Map(entries.map((entry) => [entry.date, entry])),
    [entries],
  );
  const selectedEntry = entryByDate.get(selectedDate) ?? null;
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const canGoPrevious = monthKey(viewMonth) > monthKey(data.today);
  const canGoNext = monthKey(viewMonth) < monthKey(data.maxDate);
  const selectedIsEditable =
    selectedDate >= data.today && selectedDate <= data.maxDate;

  function selectMonth(nextMonth: string) {
    const first = firstOfMonth(nextMonth);
    const last = lastOfMonth(nextMonth);
    let nextSelected = first;
    if (data.today > last) nextSelected = data.today;
    if (first < data.today && data.today <= last) nextSelected = data.today;
    if (nextSelected > data.maxDate) nextSelected = data.maxDate;
    setViewMonth(first);
    setSelectedDate(nextSelected);
  }

  function openEditor() {
    setFeedback(null);
    setError(null);
    setEditor(defaultEditor(selectedEntry));
    setEditorOpen(true);
  }

  function applyLocalEntries(
    savedDates: string[],
    values: EditorState,
    updatedAt: string,
  ) {
    setEntries((current) => {
      const next = new Map(current.map((entry) => [entry.date, entry]));
      for (const date of savedDates) {
        const existing = next.get(date);
        next.set(date, {
          id: existing?.id ?? `local-${date}`,
          date,
          startTime: values.startTime,
          endTime: values.endTime,
          isEmergencyAvailable: values.isEmergencyAvailable,
          repeatType: values.repeatType,
          repeatGroupId: existing?.repeatGroupId ?? null,
          updatedAt,
        });
      }
      return [...next.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  function handleSave() {
    setFeedback(null);
    setError(null);
    const values = { ...editor };

    startTransition(async () => {
      const result = await saveAvailabilityDay({
        date: selectedDate,
        startTime: values.startTime,
        endTime: values.endTime,
        repeatType: values.repeatType,
        isEmergencyAvailable: values.isEmergencyAvailable,
        expectedUpdatedAt: selectedEntry?.updatedAt ?? null,
      });

      if (!result.success) {
        setError(result.error ?? "Opslaan mislukt");
        return;
      }

      const savedDates = buildRepeatDates(
        selectedDate,
        values.repeatType,
        data.maxDate,
      );
      applyLocalEntries(
        savedDates,
        values,
        result.updatedAt ?? new Date().toISOString(),
      );
      setFeedback(
        savedDates.length > 1
          ? `${savedDates.length} dagen bijgewerkt`
          : "Beschikbaarheid opgeslagen",
      );
      setEditorOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    setFeedback(null);
    setError(null);
    startTransition(async () => {
      const result = await deleteAvailabilityDay(selectedDate, {
        expectedUpdatedAt: selectedEntry?.updatedAt ?? null,
      });
      if (!result.success) {
        setError(result.error ?? "Verwijderen mislukt");
        return;
      }

      setEntries((current) =>
        current.filter((entry) => entry.date !== selectedDate),
      );
      setFeedback("Beschikbaarheid verwijderd");
      setEditorOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-[calc(6.4rem+var(--safe-bottom))] md:max-w-3xl md:pb-0">
      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              canGoPrevious && selectMonth(shiftMonth(viewMonth, -1))
            }
            disabled={!canGoPrevious}
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
            style={{ color: "var(--color-primary)" }}
            aria-label="Vorige maand"
          >
            <ChevronLeft size={21} strokeWidth={2.4} />
          </button>

          <button
            type="button"
            className="flex items-center gap-2 text-lg font-black"
            style={{ color: "var(--color-primary)" }}
          >
            {monthLabel(viewMonth)}
            <ChevronDown size={16} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => canGoNext && selectMonth(shiftMonth(viewMonth, 1))}
            disabled={!canGoNext}
            className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-30"
            style={{ color: "var(--color-primary)" }}
            aria-label="Volgende maand"
          >
            <ChevronRight size={21} strokeWidth={2.4} />
          </button>
        </div>

        <div
          className="grid grid-cols-7 text-center text-sm font-bold"
          style={{ color: "#5E6B7E" }}
        >
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-y-2.5 text-center">
          {calendarDays.map((day) => {
            const hasAvailability = entryByDate.has(day.key);
            const isSelected = day.key === selectedDate;
            const isToday = day.key === data.today;
            const isDisabled = day.key < data.today || day.key > data.maxDate;

            return (
              <button
                key={day.key}
                type="button"
                disabled={isDisabled}
                onClick={() => setSelectedDate(day.key)}
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-base font-black transition-all disabled:cursor-not-allowed"
                style={{
                  color: hasAvailability
                    ? "#FFFFFF"
                    : isDisabled
                      ? "#CBD5E1"
                      : day.inMonth
                        ? "var(--color-primary)"
                        : "#94A3B8",
                  backgroundColor: hasAvailability
                    ? "var(--color-accent-dark)"
                    : "transparent",
                  border: isSelected
                    ? "2px solid var(--color-accent)"
                    : isToday
                      ? "1.5px solid rgba(0,183,179,0.35)"
                      : "2px solid transparent",
                  boxShadow: hasAvailability
                    ? "0 8px 18px rgba(0,158,154,0.22)"
                    : "none",
                  opacity: day.inMonth ? 1 : 0.45,
                }}
              >
                {day.day}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
        <h2
          className="text-[22px] font-black leading-tight"
          style={{ color: "var(--color-primary)" }}
        >
          {fullDateLabel(selectedDate)}
        </h2>

        {selectedEntry ? (
          <div className="mt-4 space-y-3">
            <div
              className="flex items-center gap-3 rounded-2xl border px-3 py-3"
              style={{
                backgroundColor: "#ECFDFD",
                borderColor: "#BDEDEA",
                color: "#087C79",
              }}
            >
              <CheckCircle2 size={22} strokeWidth={2.4} />
              <span className="text-base font-bold">
                Beschikbaarheid ingevuld
              </span>
            </div>
            <InfoRow
              icon={<Clock3 size={21} />}
              label={`${selectedEntry.startTime} - ${selectedEntry.endTime}`}
            />
            <InfoRow
              icon={<RefreshCw size={21} />}
              label={`Herhaling: ${repeatLabel(selectedEntry.repeatType)}`}
            />
            <InfoRow
              icon={<ShieldCheck size={21} />}
              label={`Spoedbeschikbaar: ${selectedEntry.isEmergencyAvailable ? "Ja" : "Nee"}`}
            />
            <p
              className="rounded-2xl border px-3 py-2.5 text-sm font-medium"
              style={{
                borderColor: "#D8E8F3",
                backgroundColor: "#F8FBFE",
                color: "#718096",
              }}
            >
              Niet ingevulde dagen blijven leeg
            </p>
            <button
              type="button"
              onClick={openEditor}
              disabled={!selectedIsEditable}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent-dark)" }}
            >
              <PencilLine size={20} strokeWidth={2.4} />
              Beschikbaarheid bewerken
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div
              className="flex items-start gap-3 rounded-2xl border px-3 py-3"
              style={{
                backgroundColor: "#F8FBFE",
                borderColor: "#D8E8F3",
                color: "#5E6B7E",
              }}
            >
              <Info size={21} strokeWidth={2.3} />
              <p className="text-sm font-medium">
                Voor deze dag is nog geen beschikbaarheid ingevuld.
              </p>
            </div>
            <button
              type="button"
              onClick={openEditor}
              disabled={!selectedIsEditable}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-black text-white shadow-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <CalendarDays size={20} strokeWidth={2.4} />
              Vul beschikbaarheid in
            </button>
            {!selectedIsEditable ? (
              <p
                className="text-center text-xs font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Je kunt maximaal {data.advanceDays} dagen vooruit invullen.
              </p>
            ) : null}
          </div>
        )}

        {feedback ? (
          <p
            className="mt-3 rounded-2xl px-3 py-2.5 text-sm font-bold"
            style={{ backgroundColor: "#ECFDF5", color: "#047857" }}
          >
            {feedback}
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-3 rounded-2xl px-3 py-2.5 text-sm font-bold"
            style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
          >
            {error}
          </p>
        ) : null}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-[#061F44]/45 px-3 pb-[calc(0.7rem+var(--safe-bottom))] backdrop-blur-sm md:hidden">
          <div className="w-full rounded-[28px] bg-white p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-14 rounded-full bg-slate-300" />
            <EditorBody
              selectedDate={selectedDate}
              editor={editor}
              setEditor={setEditor}
              isPending={isPending}
              hasEntry={Boolean(selectedEntry)}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setEditorOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="hidden md:fixed md:inset-0 md:z-[60] md:flex md:items-center md:justify-center md:bg-[#061F44]/45 md:p-6 md:backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl">
            <EditorBody
              selectedDate={selectedDate}
              editor={editor}
              setEditor={setEditor}
              isPending={isPending}
              hasEntry={Boolean(selectedEntry)}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setEditorOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      className="flex items-center gap-3 px-1 text-base font-semibold"
      style={{ color: "#2F3A4D" }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center"
        style={{ color: "#5F6F83" }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

function EditorBody({
  selectedDate,
  editor,
  setEditor,
  isPending,
  hasEntry,
  onSave,
  onDelete,
  onClose,
}: {
  selectedDate: string;
  editor: EditorState;
  setEditor: Dispatch<SetStateAction<EditorState>>;
  isPending: boolean;
  hasEntry: boolean;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3
            className="text-xl font-black leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            {fullDateLabel(selectedDate)}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasEntry ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-50"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
              aria-label="Beschikbaarheid verwijderen"
            >
              <Trash2 size={19} strokeWidth={2.4} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 disabled:opacity-50"
            style={{ color: "var(--color-primary)" }}
            aria-label="Sluiten"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          label="Van"
          value={editor.startTime}
          onChange={(value) =>
            setEditor((current) => ({ ...current, startTime: value }))
          }
        />
        <TimeField
          label="Tot"
          value={editor.endTime}
          onChange={(value) =>
            setEditor((current) => ({ ...current, endTime: value }))
          }
        />
      </div>

      <div className="mt-5">
        <p
          className="mb-2 text-base font-black"
          style={{ color: "var(--color-primary)" }}
        >
          Herhalen
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REPEAT_OPTIONS.map((option) => {
            const active = editor.repeatType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setEditor((current) => ({
                    ...current,
                    repeatType: option.value,
                  }))
                }
                className="rounded-2xl border px-3 py-2.5 text-sm font-black"
                style={{
                  color: active ? "#087C79" : "var(--color-primary)",
                  borderColor: active
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: active ? "#ECFDFD" : "#FFFFFF",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          setEditor((current) => ({
            ...current,
            isEmergencyAvailable: !current.isEmergencyAvailable,
          }))
        }
        className="mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span
          className="flex items-center gap-3 text-base font-bold"
          style={{ color: "var(--color-primary)" }}
        >
          <Clock3 size={21} strokeWidth={2.3} />
          Spoedbeschikbaar
        </span>
        <span
          className="relative h-8 w-14 rounded-full transition-colors"
          style={{
            backgroundColor: editor.isEmergencyAvailable
              ? "var(--color-accent)"
              : "#CBD5E1",
          }}
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform"
            style={{
              transform: editor.isEmergencyAvailable
                ? "translateX(26px)"
                : "translateX(4px)",
            }}
          />
        </span>
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={isPending}
        className="mt-6 w-full rounded-2xl px-4 py-4 text-base font-black text-white shadow-lg disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {isPending ? "Opslaan..." : "Beschikbaarheid opslaan"}
      </button>

      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        className="mt-3 w-full rounded-2xl px-4 py-2.5 text-base font-black disabled:opacity-60"
        style={{ color: "#718096" }}
      >
        Annuleren
      </button>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="block rounded-2xl border px-3 py-2.5"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span
        className="block text-xs font-semibold"
        style={{ color: "#5F6F83" }}
      >
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <Clock3
          size={19}
          strokeWidth={2.4}
          style={{ color: "var(--color-primary)" }}
        />
        <input
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-lg font-black outline-none"
          style={{ color: "var(--color-primary)" }}
        />
      </span>
    </label>
  );
}
