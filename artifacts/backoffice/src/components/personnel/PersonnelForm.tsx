"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  getPersonnel,
  createPersonnel,
  updatePersonnel,
  type RoleOption,
  type PersonnelFormInput,
} from "@/app/actions/personnel";

// ─── Client-side Zod schema ────────────────────────────────────────────────────

const personnelFormSchema = z.object({
  firstName: z.string().min(1, "Voornaam is verplicht").max(100, "Max 100 tekens"),
  lastName:  z.string().min(1, "Achternaam is verplicht").max(100, "Max 100 tekens"),
  email:     z.string()
    .min(1, "E-mail is verplicht")
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      "Ongeldig e-mailadres",
    ),
  phone:  z.string().max(50, "Max 50 tekens"),
  roleId: z.string(),
  region: z.string().max(100, "Max 100 tekens"),
});

type TextFormValues = z.infer<typeof personnelFormSchema>;

// ─── Component ─────────────────────────────────────────────────────────────────

interface PersonnelFormProps {
  mode:         "create" | "edit";
  personnelId?: string;
  roles:        RoleOption[];
  onSuccess:    (id: string) => void;
  onCancel:     () => void;
}

const TEXT_DEFAULTS: TextFormValues = {
  firstName: "",
  lastName:  "",
  email:     "",
  phone:     "",
  roleId:    "",
  region:    "",
};

export function PersonnelForm({
  mode,
  personnelId,
  roles,
  onSuccess,
  onCancel,
}: PersonnelFormProps) {
  const [loading, setLoading]      = useState(mode === "edit");
  const [pending, startTransition] = useTransition();

  // Tag arrays and boolean fields managed outside react-hook-form
  const [certificates, setCertificates] = useState<string[]>([]);
  const [diplomas,     setDiplomas]     = useState<string[]>([]);
  const [knowledge,    setKnowledge]    = useState<string[]>([]);
  const [isAvailable,  setIsAvailable]  = useState(true);
  const [isActive,     setIsActive]     = useState(true);
  // Create-mode only: send invite email immediately after creating the record
  const [autoInvite,   setAutoInvite]   = useState(false);

  const form = useForm<TextFormValues>({ defaultValues: TEXT_DEFAULTS });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const roleIdValue = watch("roleId") || "NONE";

  // Load existing record when editing
  useEffect(() => {
    if (mode !== "edit" || !personnelId) return;
    setLoading(true);
    getPersonnel(personnelId).then((p) => {
      if (p) {
        setValue("firstName", p.firstName ?? "");
        setValue("lastName",  p.lastName  ?? "");
        setValue("email",     p.email     ?? "");
        setValue("phone",     p.phone     ?? "");
        setValue("roleId",    p.roleId    ?? "");
        setValue("region",    p.region    ?? "");
        setCertificates(p.certificates ?? []);
        setDiplomas(p.diplomas         ?? []);
        setKnowledge(p.knowledge       ?? []);
        setIsAvailable(p.isAvailable);
        setIsActive(p.isActive);
      }
      setLoading(false);
    });
  }, [mode, personnelId, setValue]);

  const onSubmit = handleSubmit((data) => {
    // ── Client-side Zod validation ──────────────────
    const parsed = personnelFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".") as keyof TextFormValues;
        if (path) setError(path, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const input: PersonnelFormInput = {
        firstName:    parsed.data.firstName,
        lastName:     parsed.data.lastName,
        email:        parsed.data.email,
        phone:        parsed.data.phone     || undefined,
        roleId:       parsed.data.roleId === "NONE" ? undefined : parsed.data.roleId || undefined,
        region:       parsed.data.region   || undefined,
        certificates,
        diplomas,
        knowledge,
        isAvailable,
        isActive,
        autoInvite:   mode === "create" ? autoInvite : undefined,
      };

      const result =
        mode === "create"
          ? await createPersonnel(input)
          : await updatePersonnel(personnelId!, input);

      if (!result.success) {
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, message]) => {
            setError(field as keyof TextFormValues, { message });
          });
        }
        toast.error(result.message);
        return;
      }

      if (mode === "create" && autoInvite) {
        toast.success("Personeelsrecord aangemaakt en uitnodiging verstuurd");
      } else {
        toast.success(mode === "create" ? "Personeelsrecord aangemaakt" : "Personeelsrecord bijgewerkt");
      }

      const id =
        mode === "create" && result.data ? result.data.id : (personnelId ?? "");
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

      {/* ── Personal Info ─────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Persoonlijke gegevens
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="firstName">
              Voornaam <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              {...register("firstName")}
              placeholder="Voornaam"
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="lastName">
              Achternaam <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              {...register("lastName")}
              placeholder="Achternaam"
              aria-invalid={!!errors.lastName}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="email">
              E-mail <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              placeholder="medewerker@bedrijf.nl"
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="phone">Telefoon</Label>
            <Input
              id="phone"
              {...register("phone")}
              placeholder="+31 6 00 00 00 00"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Role & Qualifications ─────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Rol &amp; Kwalificaties
        </p>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="roleId">Rol</Label>
            <Select
              value={roleIdValue}
              onValueChange={(val) =>
                setValue("roleId", val === "NONE" ? "" : val)
              }
            >
              <SelectTrigger id="roleId">
                <SelectValue placeholder="Selecteer rol…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen rol —</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Certificaten</Label>
            <TagInput
              value={certificates}
              onChange={setCertificates}
              placeholder="bijv. VCA, BHV — typ en druk op Enter"
            />
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Druk op Enter of Tab om een certificaat toe te voegen.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Diploma&apos;s</Label>
            <TagInput
              value={diplomas}
              onChange={setDiplomas}
              placeholder="bijv. MBO-3, HBO — typ en druk op Enter"
            />
          </div>

          <div className="space-y-1">
            <Label>Kennis</Label>
            <TagInput
              value={knowledge}
              onChange={setKnowledge}
              placeholder="bijv. Elektra, Loodgieten — typ en druk op Enter"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Availability & Region ─────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Beschikbaarheid &amp; Regio
        </p>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="region">Regio</Label>
            <Input
              id="region"
              {...register("region")}
              placeholder="bijv. Noord-Holland"
              aria-invalid={!!errors.region}
            />
            {errors.region && (
              <p className="text-xs text-destructive">{errors.region.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Beschikbaar voor planning</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                Wanneer uitgeschakeld, verschijnt deze persoon niet in de planningsresultaten.
              </p>
            </div>
            <Switch
              checked={isAvailable}
              onCheckedChange={setIsAvailable}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Actief</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                Inactief personeel wordt verborgen in planning en opdrachtstromen.
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </section>

      {/* ── Auto-invite (create mode only) ───────────── */}
      {mode === "create" && (
        <>
          <Separator />
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
              Portaaltoegang
            </p>
            <div
              className="flex items-start gap-3 rounded-lg border px-4 py-3"
              style={{ borderColor: "#E2E8F0" }}
            >
              <Checkbox
                id="autoInvite"
                checked={autoInvite}
                onCheckedChange={(val) => setAutoInvite(val === true)}
                className="mt-0.5"
              />
              <div>
                <label
                  htmlFor="autoInvite"
                  className="text-sm font-medium cursor-pointer"
                  style={{ color: "#081D3A" }}
                >
                  Direct uitnodigen na aanmaken
                </label>
                <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                  Het personeelslid ontvangt direct een activatielink voor de Personeels-PWA.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── Actions ────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Annuleren
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Personeelslid aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </div>
    </form>
  );
}
