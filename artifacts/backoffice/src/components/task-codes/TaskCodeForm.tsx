"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useUnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
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
    .min(1, "Code is verplicht")
    .max(50, "Max 50 tekens")
    .refine((v) => /^[\w\-.]+$/.test(v.trim()), {
      message: "Code mag alleen letters, cijfers, koppeltekens en underscores bevatten",
    }),
  name:            z.string().min(1, "Naam is verplicht").max(200, "Max 200 tekens"),
  sectorId:        z.string(),
  description:     z.string().max(5000, "Max 5000 tekens"),
  price: z
    .string()
    .refine(
      (v) => v === "" || /^\d+(\.\d{0,2})?$/.test(v.trim()),
      "Moet een geldig bedrag zijn (bijv. 45.00)",
    ),
  durationMinutes: z
    .string()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v.trim()) && parseInt(v.trim()) > 0),
      "Moet een positief geheel getal zijn",
    ),
  requiredDiploma: z.string().max(200, "Max 200 tekens"),
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
    formState: { errors, isDirty },
  } = form;
  const { requestNavigation, guard } = useUnsavedChangesGuard(
    isDirty && !pending,
  );

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

      toast.success(mode === "create" ? "Taakcode aangemaakt" : "Taakcode bijgewerkt");
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
          Identificatie
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="code">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="code"
              {...register("code")}
              placeholder="bijv. SCHOON-01"
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
                <SelectValue placeholder="Selecteer sector…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen sector —</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">
              Naam <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Beschrijvende taaknaam"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="description">Omschrijving</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Optionele omschrijving van de taak…"
              rows={3}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Pricing & Duration ─────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Prijs &amp; Duur
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="price">Prijs (€)</Label>
            <Input
              id="price"
              {...register("price")}
              placeholder="bijv. 45.00"
              aria-invalid={!!errors.price}
            />
            {errors.price && (
              <p className="text-xs text-destructive">{errors.price.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="durationMinutes">Duur (minuten)</Label>
            <Input
              id="durationMinutes"
              type="number"
              min={1}
              {...register("durationMinutes")}
              placeholder="bijv. 60"
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
          Planningsgeschiktheid
        </p>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label>Vereiste certificaten</Label>
            <TagInput
              value={requiredCertificates}
              onChange={setRequiredCertificates}
              placeholder="bijv. VCA, BHV — typ en druk op Enter"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="requiredDiploma">Vereist diploma</Label>
            <Input
              id="requiredDiploma"
              {...register("requiredDiploma")}
              placeholder="bijv. MBO-3"
            />
          </div>

          <div className="space-y-1">
            <Label>Vereiste kennis</Label>
            <TagInput
              value={requiredKnowledge}
              onChange={setRequiredKnowledge}
              placeholder="bijv. Elektra, Loodgieten — typ en druk op Enter"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="requiredRoleId">Vereiste rol</Label>
            <Select
              value={requiredRoleValue}
              onValueChange={(v) => setValue("requiredRoleId", v === "NONE" ? "" : v)}
            >
              <SelectTrigger id="requiredRoleId">
                <SelectValue placeholder="Elke rol…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Elke rol —</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{formatPersonnelRoleName(r.name)}</SelectItem>
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
          Vereisten &amp; Instellingen
        </p>
        <div className="flex flex-col gap-3">
          <SwitchRow
            id="photoRequired"
            label="Foto verplicht"
            description="Medewerkers moeten foto's uploaden bij het voltooien van deze taak."
            checked={photoRequired}
            onChange={setPhotoRequired}
          />
          <SwitchRow
            id="reportRequired"
            label="Rapport verplicht"
            description="Een schriftelijk rapport moet worden ingediend bij voltooiing."
            checked={reportRequired}
            onChange={setReportRequired}
          />
          <SwitchRow
            id="invoiceable"
            label="Factureerbaar"
            description="Deze taak genereert een factuurregel bij voltooiing."
            checked={invoiceable}
            onChange={setInvoiceable}
          />
          <SwitchRow
            id="isActive"
            label="Actief"
            description="Inactieve taakcodes kunnen niet worden gebruikt in nieuwe opdrachten."
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
      </section>

      {/* ── Actions ────────────────────────────────────── */}
      <FormActions status={pending ? "pending" : "idle"}>
        <Button
          type="button"
          variant="outline"
          onClick={() => requestNavigation(onCancel)}
          disabled={pending}
        >
          Annuleren
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Taakcode aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </FormActions>
      {guard}
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
