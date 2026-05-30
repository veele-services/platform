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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import {
  getTaskCode,
  createTaskCode,
  updateTaskCode,
  type SectorOption,
  type RoleOption,
  type TaskCodeFormInput,
} from "@/app/actions/task-codes";

// ─── Client-side Zod schema ────────────────────────────────────────────────────

const taskCodeFormSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .max(50, "Max 50 characters")
    .refine((v) => /^[\w\-.]+$/.test(v.trim()), {
      message: "Code may only contain letters, numbers, hyphens, and underscores",
    }),
  name:            z.string().min(1, "Name is required").max(200, "Max 200 characters"),
  sectorId:        z.string(),
  description:     z.string().max(5000, "Max 5000 characters"),
  price: z
    .string()
    .refine(
      (v) => v === "" || /^\d+(\.\d{0,2})?$/.test(v.trim()),
      "Must be a valid price (e.g. 45.00)",
    ),
  durationMinutes: z
    .string()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v.trim()) && parseInt(v.trim()) > 0),
      "Must be a positive whole number",
    ),
  requiredDiploma: z.string().max(200, "Max 200 characters"),
  requiredRoleId:  z.string(),
});

type TextFormValues = z.infer<typeof taskCodeFormSchema>;

// ─── Component ─────────────────────────────────────────────────────────────────

interface TaskCodeFormProps {
  mode:         "create" | "edit";
  taskCodeId?:  string;
  sectors:      SectorOption[];
  roles:        RoleOption[];
  onSuccess:    (id: string) => void;
  onCancel:     () => void;
}

const TEXT_DEFAULTS: TextFormValues = {
  code:            "",
  name:            "",
  sectorId:        "",
  description:     "",
  price:           "",
  durationMinutes: "",
  requiredDiploma: "",
  requiredRoleId:  "",
};

export function TaskCodeForm({
  mode,
  taskCodeId,
  sectors,
  roles,
  onSuccess,
  onCancel,
}: TaskCodeFormProps) {
  const [loading, setLoading]      = useState(mode === "edit");
  const [pending, startTransition] = useTransition();

  const [requiredCertificates, setRequiredCertificates] = useState<string[]>([]);
  const [requiredKnowledge,    setRequiredKnowledge]    = useState<string[]>([]);
  const [photoRequired,  setPhotoRequired]  = useState(false);
  const [reportRequired, setReportRequired] = useState(false);
  const [invoiceable,    setInvoiceable]    = useState(true);
  const [isActive,       setIsActive]       = useState(true);

  const form = useForm<TextFormValues>({ defaultValues: TEXT_DEFAULTS });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const sectorIdValue     = watch("sectorId")    || "NONE";
  const requiredRoleValue = watch("requiredRoleId") || "NONE";

  // Load existing record for edit
  useEffect(() => {
    if (mode !== "edit" || !taskCodeId) return;
    setLoading(true);
    getTaskCode(taskCodeId).then((tc) => {
      if (tc) {
        setValue("code",            tc.code            ?? "");
        setValue("name",            tc.name            ?? "");
        setValue("sectorId",        tc.sectorId        ?? "");
        setValue("description",     tc.description     ?? "");
        setValue("price",           tc.price           ?? "");
        setValue("durationMinutes", tc.durationMinutes !== null ? String(tc.durationMinutes) : "");
        setValue("requiredDiploma", tc.requiredDiploma  ?? "");
        setValue("requiredRoleId",  tc.requiredRoleId   ?? "");
        setRequiredCertificates(tc.requiredCertificates ?? []);
        setRequiredKnowledge(tc.requiredKnowledge       ?? []);
        setPhotoRequired(tc.photoRequired);
        setReportRequired(tc.reportRequired);
        setInvoiceable(tc.invoiceable);
        setIsActive(tc.isActive);
      }
      setLoading(false);
    });
  }, [mode, taskCodeId, setValue]);

  const onSubmit = handleSubmit((data) => {
    const parsed = taskCodeFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".") as keyof TextFormValues;
        if (path) setError(path, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const durationRaw = parsed.data.durationMinutes.trim();
      const priceRaw    = parsed.data.price.trim();

      const input: TaskCodeFormInput = {
        code:                 parsed.data.code,
        name:                 parsed.data.name,
        sectorId:             parsed.data.sectorId    === "NONE" ? undefined : parsed.data.sectorId    || undefined,
        requiredRoleId:       parsed.data.requiredRoleId === "NONE" ? undefined : parsed.data.requiredRoleId || undefined,
        description:          parsed.data.description  || undefined,
        price:                priceRaw                 || undefined,
        durationMinutes:      durationRaw ? parseInt(durationRaw) : undefined,
        requiredCertificates,
        requiredDiploma:      parsed.data.requiredDiploma || undefined,
        requiredKnowledge,
        photoRequired,
        reportRequired,
        invoiceable,
        isActive,
      };

      const result =
        mode === "create"
          ? await createTaskCode(input)
          : await updateTaskCode(taskCodeId!, input);

      if (!result.success) {
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, message]) => {
            setError(field as keyof TextFormValues, { message });
          });
        }
        toast.error(result.message);
        return;
      }

      toast.success(mode === "create" ? "Task code created" : "Task code updated");
      const id =
        mode === "create" && result.data ? result.data.id : (taskCodeId ?? "");
      onSuccess(id);
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

      {/* ── Identity ──────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Identity
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="code">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="code"
              {...register("code")}
              placeholder="e.g. CLEAN-01"
              className="font-mono uppercase"
              onBlur={(e) => setValue("code", e.target.value.toUpperCase())}
              aria-invalid={!!errors.code}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="sectorId">Sector</Label>
            <Select
              value={sectorIdValue}
              onValueChange={(v) => setValue("sectorId", v === "NONE" ? "" : v)}
            >
              <SelectTrigger id="sectorId">
                <SelectValue placeholder="Select sector…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— No sector —</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Descriptive task name"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Optional description of the task…"
              rows={3}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Pricing & Duration ─────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Pricing &amp; Duration
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="price">Price (€)</Label>
            <Input
              id="price"
              {...register("price")}
              placeholder="e.g. 45.00"
              aria-invalid={!!errors.price}
            />
            {errors.price && (
              <p className="text-xs text-destructive">{errors.price.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="durationMinutes">Duration (minutes)</Label>
            <Input
              id="durationMinutes"
              type="number"
              min={1}
              {...register("durationMinutes")}
              placeholder="e.g. 60"
              aria-invalid={!!errors.durationMinutes}
            />
            {errors.durationMinutes && (
              <p className="text-xs text-destructive">{errors.durationMinutes.message}</p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Planning Eligibility ───────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Planning Eligibility
        </p>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label>Required Certificates</Label>
            <TagInput
              value={requiredCertificates}
              onChange={setRequiredCertificates}
              placeholder="e.g. VCA, BHV — type and press Enter"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="requiredDiploma">Required Diploma</Label>
            <Input
              id="requiredDiploma"
              {...register("requiredDiploma")}
              placeholder="e.g. MBO-3"
            />
          </div>

          <div className="space-y-1">
            <Label>Required Knowledge</Label>
            <TagInput
              value={requiredKnowledge}
              onChange={setRequiredKnowledge}
              placeholder="e.g. Electrical, Plumbing — type and press Enter"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="requiredRoleId">Required Role</Label>
            <Select
              value={requiredRoleValue}
              onValueChange={(v) => setValue("requiredRoleId", v === "NONE" ? "" : v)}
            >
              <SelectTrigger id="requiredRoleId">
                <SelectValue placeholder="Any role…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Any role —</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Requirements & Settings ────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Requirements &amp; Settings
        </p>
        <div className="flex flex-col gap-3">
          <SwitchRow
            id="photoRequired"
            label="Photo Required"
            description="Field workers must upload photos when completing this task."
            checked={photoRequired}
            onChange={setPhotoRequired}
          />
          <SwitchRow
            id="reportRequired"
            label="Report Required"
            description="A written report must be submitted upon completion."
            checked={reportRequired}
            onChange={setReportRequired}
          />
          <SwitchRow
            id="invoiceable"
            label="Invoiceable"
            description="This task generates an invoice line when completed."
            checked={invoiceable}
            onChange={setInvoiceable}
          />
          <SwitchRow
            id="isActive"
            label="Active"
            description="Inactive task codes cannot be used in new assignments."
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
      </section>

      {/* ── Actions ────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Task Code" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

// ─── SwitchRow helper ─────────────────────────────────────────────────────────

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id:          string;
  label:       string;
  description: string;
  checked:     boolean;
  onChange:    (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg border px-4 py-3"
      style={{ borderColor: "#E2E8F0" }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: "#081D3A" }}>{label}</p>
        <p className="text-xs" style={{ color: "#94A3B8" }}>{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
