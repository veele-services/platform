"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAssignment,
  createAssignment,
  updateAssignment,
  getObjectsByCustomer,
  type CustomerOption,
  type ObjectOption,
  type AssignmentFormInput,
  type AssignmentStatus,
  type AssignmentPriority,
  type ActionResult,
} from "@/app/actions/assignments";
import { ASSIGNMENT_STATUSES, ASSIGNMENT_PRIORITIES } from "@/types/assignments";

// ─── Dutch labels ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  requested:         "Aangevraagd",
  review:            "In beoordeling",
  quote_preparation: "Offerte in voorbereiding",
  awaiting_approval: "Wacht op goedkeuring",
  approved:          "Goedgekeurd",
  plannable:         "Inplanbaar",
  scheduled:         "Ingepland",
  seen:              "Gezien",
  in_progress:       "In uitvoering",
  not_completed:     "Niet afgerond",
  completed:         "Afgerond",
  report_submitted:  "Rapport ingediend",
  report_approved:   "Rapport goedgekeurd",
  invoice_ready:     "Klaar voor facturatie",
  invoiced:          "Gefactureerd",
  paid:              "Betaald",
  closed:            "Gesloten",
};

const PRIORITY_LABELS: Record<AssignmentPriority, string> = {
  low:    "Laag",
  normal: "Normaal",
  high:   "Hoog",
  urgent: "Urgent",
};

// ─── Form schema ──────────────────────────────────────────────────────────────

const formSchema = z.object({
  title:          z.string().min(1, "Titel is verplicht").max(255, "Maximaal 255 tekens"),
  description:    z.string(),
  customerId:     z.string().min(1, "Klant is verplicht"),
  objectId:       z.string(),
  status:         z.string().min(1, "Status is verplicht"),
  priority:       z.string().min(1, "Prioriteit is verplicht"),
  scheduledDate:  z.string(),
  scheduledStart: z.string(),
  scheduledEnd:   z.string(),
  notes:          z.string(),
  requiredRegion: z.string().max(100, "Maximaal 100 tekens"),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  title:          "",
  description:    "",
  customerId:     "",
  objectId:       "",
  status:         "requested",
  priority:       "normal",
  scheduledDate:  "",
  scheduledStart: "",
  scheduledEnd:   "",
  notes:          "",
  requiredRegion: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssignmentFormProps {
  mode:           "create" | "edit";
  assignmentId?:  string;
  customers:      CustomerOption[];
  defaultDate?:   string;
  onSuccess:      (id: string) => void;
  onCancel:       () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentForm({
  mode,
  assignmentId,
  customers,
  defaultDate,
  onSuccess,
  onCancel,
}: AssignmentFormProps) {
  const [loading,  setLoading]       = useState(mode === "edit");
  const [pending,  startTransition]  = useTransition();
  const [objects,  setObjects]       = useState<ObjectOption[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: defaultDate && mode === "create"
      ? { ...DEFAULTS, scheduledDate: defaultDate }
      : DEFAULTS,
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const customerIdVal = watch("customerId");
  const objectIdVal   = watch("objectId") || "NONE";
  const statusVal     = watch("status")   || "requested";
  const priorityVal   = watch("priority") || "normal";

  // Load objects when customer changes
  useEffect(() => {
    if (!customerIdVal || customerIdVal === "NONE") {
      setObjects([]);
      setValue("objectId", "");
      return;
    }
    setLoadingObjects(true);
    getObjectsByCustomer(customerIdVal).then((opts) => {
      setObjects(opts);
      setLoadingObjects(false);
    });
  }, [customerIdVal, setValue]);

  // Load existing assignment in edit mode
  useEffect(() => {
    if (mode !== "edit" || !assignmentId) return;
    setLoading(true);
    getAssignment(assignmentId).then((a) => {
      if (a) {
        setValue("title",          a.title         ?? "");
        setValue("description",    a.description   ?? "");
        setValue("customerId",     a.customerId    ?? "");
        setValue("objectId",       a.objectId      ?? "");
        setValue("status",         a.status        ?? "requested");
        setValue("priority",       a.priority      ?? "normal");
        setValue("scheduledDate",  a.scheduledDate ?? "");
        setValue("scheduledStart", a.scheduledStart ?? "");
        setValue("scheduledEnd",   a.scheduledEnd  ?? "");
        setValue("notes",          a.notes         ?? "");
        setValue("requiredRegion", a.requiredRegion ?? "");
      }
      setLoading(false);
    });
  }, [mode, assignmentId, setValue]);

  const onSubmit = handleSubmit((data) => {
    const parsed = formSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".");
        if (path) setError(path as keyof FormValues, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const input: AssignmentFormInput = {
        title:          parsed.data.title,
        description:    parsed.data.description    || undefined,
        customerId:     parsed.data.customerId,
        objectId:       parsed.data.objectId === "NONE" ? undefined : parsed.data.objectId || undefined,
        status:         parsed.data.status    as AssignmentStatus,
        priority:       parsed.data.priority  as AssignmentPriority,
        scheduledDate:  parsed.data.scheduledDate  || undefined,
        scheduledStart: parsed.data.scheduledStart || undefined,
        scheduledEnd:   parsed.data.scheduledEnd   || undefined,
        notes:          parsed.data.notes          || undefined,
        requiredRegion: parsed.data.requiredRegion || undefined,
      };

      const result =
        mode === "create"
          ? await createAssignment(input)
          : await updateAssignment(assignmentId!, input);

      if (!result.success) {
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, message]) => {
            setError(field as keyof FormValues, { message });
          });
        }
        toast.error(result.message);
        return;
      }

      toast.success(mode === "create" ? "Opdracht aangemaakt" : "Opdracht bijgewerkt");
      const savedId =
        mode === "create"
          ? ((result as { success: true; data?: { id: string } }).data?.id ?? "")
          : (assignmentId ?? "");
      onSuccess(savedId);
    });
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00B7B3" }} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 py-4">

      {/* ── Algemene info ─────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Algemene info
        </p>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="title">
              Titel <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="Omschrijving van de opdracht"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <Select
                value={statusVal}
                onValueChange={(v) => setValue("status", v)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="priority">Prioriteit</Label>
              <Select
                value={priorityVal}
                onValueChange={(v) => setValue("priority", v)}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="customerId">
              Klant <span className="text-destructive">*</span>
            </Label>
            <Select
              value={customerIdVal || "NONE"}
              onValueChange={(v) => {
                setValue("customerId", v === "NONE" ? "" : v);
                setValue("objectId", "");
              }}
            >
              <SelectTrigger id="customerId" aria-invalid={!!errors.customerId}>
                <SelectValue placeholder="Selecteer klant..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Selecteer klant —</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customerId && (
              <p className="text-xs text-destructive">{errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="objectId">Object</Label>
            <Select
              value={objectIdVal}
              onValueChange={(v) => setValue("objectId", v === "NONE" ? "" : v)}
              disabled={!customerIdVal || loadingObjects}
            >
              <SelectTrigger id="objectId">
                <SelectValue placeholder={loadingObjects ? "Laden..." : "Selecteer object..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen object —</SelectItem>
                {objects.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Planning ──────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Planning
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 space-y-1">
            <Label htmlFor="scheduledDate">Geplande datum</Label>
            <Input
              id="scheduledDate"
              type="date"
              {...register("scheduledDate")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scheduledStart">Starttijd</Label>
            <Input
              id="scheduledStart"
              type="time"
              {...register("scheduledStart")}
              placeholder="08:00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scheduledEnd">Eindtijd</Label>
            <Input
              id="scheduledEnd"
              type="time"
              {...register("scheduledEnd")}
              placeholder="17:00"
            />
          </div>
          <div className="col-span-3 space-y-1">
            <Label htmlFor="requiredRegion">Regio</Label>
            <Input
              id="requiredRegion"
              {...register("requiredRegion")}
              placeholder="bijv. Amsterdam"
              maxLength={100}
            />
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Optioneel. Alleen medewerkers met deze regio worden als geschikt aangemerkt.
            </p>
            {errors.requiredRegion && (
              <p className="text-xs text-destructive">{errors.requiredRegion.message}</p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Beschrijving ──────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Beschrijving
        </p>
        <Textarea
          {...register("description")}
          placeholder="Beschrijving van de werkzaamheden..."
          rows={3}
          className="resize-none"
        />
      </section>

      <Separator />

      {/* ── Interne notities ──────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748B" }}>
          Interne notities
        </p>
        <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
          Alleen zichtbaar voor management.
        </p>
        <Textarea
          {...register("notes")}
          placeholder="Interne opmerkingen..."
          rows={2}
          className="resize-none"
        />
      </section>

      {/* ── Actions ───────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Annuleren
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Opdracht aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </div>
    </form>
  );
}
