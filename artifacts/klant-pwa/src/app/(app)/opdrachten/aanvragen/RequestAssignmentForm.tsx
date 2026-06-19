"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestAssignment, type RequestAssignmentInput } from "@/actions/assignments";
import type { CustomerObject } from "@/actions/objects";
import { CheckCircle2 } from "lucide-react";

interface Props {
  objects: CustomerObject[];
}

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high",   label: "Hoog" },
  { value: "urgent", label: "Urgent" },
] as const;

export function RequestAssignmentForm({ objects }: Props) {
  const router = useRouter();

  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [objectId,    setObjectId]    = useState("");
  const [priority,    setPriority]    = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input: RequestAssignmentInput = {
      title:       title.trim(),
      description: description.trim(),
      objectId:    objectId || undefined,
      priority,
    };

    startTransition(async () => {
      const result = await requestAssignment(input);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/opdrachten"), 2000);
      } else {
        setError(result.message);
      }
    });
  }

  if (success) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <CheckCircle2 size={48} className="mb-3" style={{ color: "var(--color-success)" }} />
        <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
          Aanvraag ingediend!
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
          Wij nemen zo snel mogelijk contact met u op.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Title */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Omschrijving opdracht <span style={{ color: "var(--color-destructive)" }}>*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={pending}
          maxLength={255}
          placeholder="Bijv. Schoonmaak kantoor 3e verdieping"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      {/* Object */}
      {objects.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
            Object (optioneel)
          </label>
          <select
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
            disabled={pending}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <option value="">— Geen specifiek object —</option>
            {objects.map((obj) => (
              <option key={obj.id} value={obj.id}>
                {obj.name}{obj.city ? ` · ${obj.city}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Prioriteit
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRIORITY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPriority(value)}
              disabled={pending}
              className="rounded-xl py-2.5 text-xs font-medium transition-all"
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

      {/* Description */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-primary)" }}>
          Toelichting <span style={{ color: "var(--color-destructive)" }}>*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          disabled={pending}
          rows={5}
          placeholder="Beschrijf zo duidelijk mogelijk wat u nodig heeft, wanneer, en eventuele bijzonderheden…"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 resize-none disabled:opacity-60"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !title.trim() || !description.trim()}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {pending ? "Aanvraag indienen…" : "Aanvraag indienen"}
      </button>
    </form>
  );
}
