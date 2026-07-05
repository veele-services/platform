"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { requestAssignment, type RequestAssignmentInput } from "@/actions/assignments";
import type { CustomerObject, CustomerSectorOption } from "@/actions/objects";

interface Props {
  objects: CustomerObject[];
  sectors: CustomerSectorOption[];
  initialPriority?: "low" | "normal" | "high" | "urgent";
}

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high",   label: "Hoog" },
  { value: "urgent", label: "Urgent" },
] as const;

function localDateInput(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RequestAssignmentForm({ objects, sectors, initialPriority = "normal" }: Props) {
  const router = useRouter();
  const initialSectorId =
    objects.find((object) => object.isActive && object.sectorId)?.sectorId ?? sectors[0]?.id ?? "";

  const [sectorId, setSectorId] = useState(initialSectorId);
  const [objectId, setObjectId] = useState(
    () => objects.find((object) => object.isActive && object.sectorId === initialSectorId)?.id ?? "",
  );
  const [title,          setTitle]          = useState("");
  const [description,    setDescription]    = useState("");
  const [scheduledDate,  setScheduledDate]  = useState(localDateInput());
  const [scheduledStart, setScheduledStart] = useState("09:00");
  const [scheduledEnd,   setScheduledEnd]   = useState("17:00");
  const [priority,       setPriority]       = useState<"low" | "normal" | "high" | "urgent">(initialPriority);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState(false);

  const [pending, startTransition] = useTransition();

  const filteredObjects = objects.filter((object) => object.isActive && object.sectorId === sectorId);
  const selectedObject = objects.find((object) => object.id === objectId) ?? null;
  const hasObjectForSector = filteredObjects.length > 0;

  function selectSector(nextSectorId: string) {
    setSectorId(nextSectorId);
    setObjectId(objects.find((object) => object.isActive && object.sectorId === nextSectorId)?.id ?? "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sectorId || !objectId) {
      setError("Selecteer een sector en object.");
      return;
    }

    const input: RequestAssignmentInput = {
      title:          title.trim(),
      description:    description.trim(),
      objectId,
      sectorId,
      scheduledDate,
      scheduledStart,
      scheduledEnd,
      priority,
    };

    startTransition(async () => {
      const result = await requestAssignment(input);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/opdrachten"), 1400);
      } else {
        setError(result.message);
      }
    });
  }

  if (success) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <CheckCircle2 size={50} className="mb-3" style={{ color: "var(--color-success)" }} />
        <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
          Aanvraag ingediend
        </h2>
        <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--color-secondary)" }}>
          Uw aanvraag wordt beoordeeld. Daarna ontvangt u een offerte ter akkoord.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {sectors.length === 0 ? (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-secondary)" }}>
          Er zijn nog geen actieve sectoren beschikbaar voor aanvragen.
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
            Sector
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {sectors.map((sector) => (
              <button
                key={sector.id}
                type="button"
                onClick={() => selectSector(sector.id)}
                disabled={pending}
                className="rounded-2xl border p-3 text-left transition-all"
                style={{
                  borderColor: sectorId === sector.id ? "var(--color-accent)" : "var(--color-border)",
                  background:   sectorId === sector.id ? "rgba(0,183,179,0.09)" : "#fff",
                  color:        "var(--color-primary)",
                }}
              >
                <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(0,183,179,0.12)" }}>
                  <ShieldCheck size={16} style={{ color: "var(--color-accent)" }} />
                </span>
                <span className="block text-sm font-semibold">{sector.name}</span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--color-secondary)" }}>
                  {objects.filter((object) => object.isActive && object.sectorId === sector.id).length} object(en)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
          Object
        </label>
        {hasObjectForSector ? (
          <select
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
            disabled={pending}
            required
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            {filteredObjects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}{object.city ? ` - ${object.city}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
              Geen object gevonden voor deze sector.
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
              Maak eerst een object aan en koppel daar de juiste sector aan.
            </p>
            <Link
              href="/objecten/nieuw"
              className="mt-3 inline-flex rounded-xl px-4 py-2 text-xs font-semibold text-white"
              style={{ background: "var(--color-accent)" }}
            >
              Object aanmaken
            </Link>
          </div>
        )}

        {selectedObject && (
          <div className="mt-3 rounded-2xl border bg-slate-50 p-3 text-xs" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--color-primary)" }}>
              <Building2 size={14} />
              {selectedObject.name}
            </div>
            <div className="mt-1 flex items-center gap-2" style={{ color: "var(--color-secondary)" }}>
              <MapPin size={13} />
              {[selectedObject.address, selectedObject.postalCode, selectedObject.city].filter(Boolean).join(", ") || "Geen adres bekend"}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            <CalendarDays size={15} />
            Gewenste datum
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
            disabled={pending}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            <Clock3 size={15} />
            Van
          </label>
          <input
            type="time"
            value={scheduledStart}
            onChange={(e) => setScheduledStart(e.target.value)}
            required
            disabled={pending}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            <Clock3 size={15} />
            Tot
          </label>
          <input
            type="time"
            value={scheduledEnd}
            onChange={(e) => setScheduledEnd(e.target.value)}
            required
            disabled={pending}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          Korte omschrijving
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={pending}
          maxLength={255}
          placeholder="Bijv. Extra schoonmaak entreehal"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          Toelichting
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          disabled={pending}
          rows={5}
          placeholder="Beschrijf wat er nodig is, bijzonderheden op locatie, toegangsinformatie en gewenste afstemming."
          className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-primary)" }}>
          Prioriteit
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPriority(value)}
              disabled={pending}
              className="rounded-xl py-2.5 text-xs font-semibold transition-all"
              style={{
                backgroundColor: priority === value ? "var(--color-primary)" : "var(--color-muted)",
                color:           priority === value ? "#fff" : "var(--color-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          pending ||
          !sectorId ||
          !objectId ||
          !title.trim() ||
          !description.trim() ||
          !scheduledDate ||
          !scheduledStart ||
          !scheduledEnd
        }
        className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {pending ? "Aanvraag indienen..." : "Aanvraag indienen"}
      </button>
    </form>
  );
}
