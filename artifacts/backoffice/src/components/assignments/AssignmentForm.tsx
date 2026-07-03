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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RegionMultiSelect } from "@/components/regions/RegionMultiSelect";
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
} from "@/app/actions/assignments";
import {
  getAssignmentRegionNames,
  getObjectRegionNames,
  syncAssignmentRequiredRegions,
  type RegionOption,
} from "@/app/actions/regions";
import { ASSIGNMENT_STATUSES, ASSIGNMENT_PRIORITIES } from "@/types/assignments";
import { priorityLabel, statusLabel } from "./AssignmentStatusBadge";

// ─── Dutch labels ─────────────────────────────────────────────────────────────

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
  requiredPersonnelCount: z.coerce
    .number()
    .int("Gebruik een heel getal")
    .min(1, "Minimaal 1 medewerker")
    .max(50, "Maximaal 50 medewerkers"),
  customerSignatureRequired: z.boolean(),
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
  requiredPersonnelCount: 1,
  customerSignatureRequired: false,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssignmentFormProps {
  mode:           "create" | "edit";
  assignmentId?:  string;
  customers:      CustomerOption[];
  regionOptions:  RegionOption[];
  defaultDate?:   string;
  onSuccess:      (id: string) => void;
  onCancel:       () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentForm({
  mode,
  assignmentId,
  customers,
  regionOptions,
  defaultDate,
  onSuccess,
  onCancel,
}: AssignmentFormProps) {
  const [loading,  setLoading]       = useState(mode === "edit");
  const [pending,  startTransition]  = useTransition();
  const [objects,  setObjects]       = useState<ObjectOption[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [regionNames, setRegionNames] = useState<string[]>([]);
  const [regionTouched, setRegionTouched] = useState(false);

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
  const signatureRequiredVal = watch("customerSignatureRequired") || false;

  const updateRegionNames = (next: string[]) => {
    setRegionTouched(true);
    setRegionNames(next);
    setValue("requiredRegion", next[0] ?? "", { shouldDirty: true });
  };

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

  useEffect(() => {
    if (mode !== "create" || regionTouched) return;
    const objectId = objectIdVal === "NONE" ? "" : objectIdVal;
    if (!objectId) return;

    getObjectRegionNames(objectId)
      .then((names) => {
        if (names.length === 0 || regionTouched) return;
        setRegionNames(names);
        setValue("requiredRegion", names[0] ?? "", { shouldDirty: true });
      })
      .catch(() => undefined);
  }, [mode, objectIdVal, regionTouched, setValue]);

  // Load existing assignment in edit mode
  useEffect(() => {
    if (mode !== "edit" || !assignmentId) return;
    setLoading(true);
    Promise.all([getAssignment(assignmentId), getAssignmentRegionNames(assignmentId)]).then(([a, linkedRegions]) => {
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
        setValue("requiredPersonnelCount", a.requiredPersonnelCount ?? 1);
        setValue("customerSignatureRequired", Boolean(a.customerSignatureRequired));
        setRegionNames(linkedRegions.length > 0 ? linkedRegions : a.requiredRegion ? [a.requiredRegion] : []);
        setRegionTouched(true);
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
        requiredRegion: regionNames[0] || undefined,
        requiredPersonnelCount: parsed.data.requiredPersonnelCount,
        customerSignatureRequired: parsed.data.customerSignatureRequired,
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

      const savedId =
        mode === "create"
          ? ((result as { success: true; data?: { id: string } }).data?.id ?? "")
          : (assignmentId ?? "");

      if (savedId) {
        const regionResult = await syncAssignmentRequiredRegions(savedId, regionNames);
        if (!regionResult.success) {
          toast.error(regionResult.message);
          return;
        }
      }

      toast.success(mode === "create" ? "Opdracht aangemaakt" : "Opdracht bijgewerkt");
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
                      {statusLabel(s)}
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
                      {priorityLabel(p)}
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
          <div className="space-y-1">
            <Label htmlFor="requiredPersonnelCount">Benodigd</Label>
            <Input
              id="requiredPersonnelCount"
              type="number"
              min={1}
              max={50}
              {...register("requiredPersonnelCount", { valueAsNumber: true })}
            />
            {errors.requiredPersonnelCount && (
              <p className="text-xs text-destructive">{errors.requiredPersonnelCount.message}</p>
            )}
          </div>
          <div className="col-span-3 space-y-1">
            <RegionMultiSelect
              value={regionNames}
              onChange={updateRegionNames}
              options={regionOptions}
              label="Regio's"
              placeholder="Selecteer of maak regio's..."
            />
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Optioneel. De eerste regio blijft leidend voor bestaande planningfilters; extra regio&apos;s worden als aanvullende eisen opgeslagen.
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
      <Separator />

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Afronding
        </p>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
          <div className="min-w-0">
            <Label htmlFor="customerSignatureRequired">Klant-handtekening verplicht</Label>
            <p className="mt-1 text-xs leading-5" style={{ color: "#64748B" }}>
              Indien actief moet de medewerker bij gereedmelden een akkoord-handtekening van de klant vastleggen.
            </p>
          </div>
          <Switch
            id="customerSignatureRequired"
            checked={signatureRequiredVal}
            onCheckedChange={(checked) => setValue("customerSignatureRequired", checked, { shouldDirty: true })}
          />
        </div>
      </section>

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
