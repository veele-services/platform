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
  type SectorOption,
  type PersonnelFormInput,
} from "@/app/actions/personnel";
import {
  PERSONNEL_TYPES,
  PERSONNEL_TYPE_LABELS,
  type ContractInfo,
  type CertificateEntry,
} from "@/types/personnel";

// ─── Client-side Zod schema ────────────────────────────────────────────────────

const personnelFormSchema = z.object({
  firstName:     z.string().min(1, "Voornaam is verplicht").max(100, "Max 100 tekens"),
  lastName:      z.string().min(1, "Achternaam is verplicht").max(100, "Max 100 tekens"),
  email:         z.string()
    .min(1, "E-mail is verplicht")
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      "Ongeldig e-mailadres",
    ),
  phone:              z.string().max(50, "Max 50 tekens"),
  roleId:             z.string(),
  sectorId:           z.string(),
  region:             z.string().max(100, "Max 100 tekens"),
  contractStartDate:  z.string(),
  contractEndDate:    z.string(),
  contractType:       z.string().max(100, "Max 100 tekens"),
  contractHours:      z.string(),
});

type TextFormValues = z.infer<typeof personnelFormSchema>;

// ─── Component ─────────────────────────────────────────────────────────────────

interface PersonnelFormProps {
  mode:         "create" | "edit";
  personnelId?: string;
  roles:        RoleOption[];
  sectors:      SectorOption[];
  onSuccess:    (id: string) => void;
  onCancel:     () => void;
}

const TEXT_DEFAULTS: TextFormValues = {
  firstName:         "",
  lastName:          "",
  email:             "",
  phone:             "",
  roleId:            "",
  sectorId:          "",
  region:            "",
  contractStartDate: "",
  contractEndDate:   "",
  contractType:      "",
  contractHours:     "",
};

export function PersonnelForm({
  mode,
  personnelId,
  roles,
  sectors,
  onSuccess,
  onCancel,
}: PersonnelFormProps) {
  const [loading, setLoading]      = useState(mode === "edit");
  const [pending, startTransition] = useTransition();

  // Tag arrays and boolean fields managed outside react-hook-form
  // CertificateEntry[] preserves expires_at on round-trip edits
  const [certEntries,       setCertEntries]       = useState<CertificateEntry[]>([]);
  const [diplomas,          setDiplomas]          = useState<string[]>([]);
  const [knowledge,         setKnowledge]         = useState<string[]>([]);
  const [preferredRegions,  setPreferredRegions]  = useState<string[]>([]);
  const [isAvailable,       setIsAvailable]       = useState(true);
  const [isActive,          setIsActive]          = useState(true);
  const [emergencyAvailable, setEmergencyAvailable] = useState(false);
  const [personnelType,     setPersonnelType]     = useState<string>("");
  // Create-mode only: send invite email immediately after creating the record
  const [autoInvite,        setAutoInvite]        = useState(false);

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
  const sectorIdValue = watch("sectorId") || "NONE";

  // Load existing record when editing
  useEffect(() => {
    if (mode !== "edit" || !personnelId) return;
    setLoading(true);
    getPersonnel(personnelId).then((p) => {
      if (p) {
        setValue("firstName",         p.firstName ?? "");
        setValue("lastName",          p.lastName  ?? "");
        setValue("email",             p.email     ?? "");
        setValue("phone",             p.phone     ?? "");
        setValue("roleId",            p.roleId    ?? "");
        setValue("sectorId",          p.sectorId  ?? "");
        setValue("region",            p.region    ?? "");
        setValue("contractStartDate", p.contractInfo?.start_date    ?? "");
        setValue("contractEndDate",   p.contractInfo?.end_date      ?? "");
        setValue("contractType",      p.contractInfo?.contract_type ?? "");
        setValue("contractHours",     p.contractInfo?.hours_per_week != null
          ? String(p.contractInfo.hours_per_week) : "");
        setCertEntries(p.certificates          ?? []);
        setDiplomas(p.diplomas                ?? []);
        setKnowledge(p.knowledge              ?? []);
        setPreferredRegions(p.preferredRegions ?? []);
        setIsAvailable(p.isAvailable);
        setIsActive(p.isActive);
        setEmergencyAvailable(p.emergencyAvailable ?? false);
        setPersonnelType(p.personnelType ?? "");
      }
      setLoading(false);
    });
  }, [mode, personnelId, setValue]);

  const onSubmit = handleSubmit((data) => {
    const parsed = personnelFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".") as keyof TextFormValues;
        if (path) setError(path, { message: issue.message });
      }
      return;
    }

    // Build contract info if any field is filled
    const hasContract = parsed.data.contractStartDate || parsed.data.contractEndDate
      || parsed.data.contractType || parsed.data.contractHours;
    const contractInfo: ContractInfo | null = hasContract ? {
      start_date:     parsed.data.contractStartDate || undefined,
      end_date:       parsed.data.contractEndDate   || undefined,
      contract_type:  parsed.data.contractType      || undefined,
      hours_per_week: parsed.data.contractHours
        ? parseFloat(parsed.data.contractHours)
        : undefined,
    } : null;

    startTransition(async () => {
      const input: PersonnelFormInput = {
        firstName:          parsed.data.firstName,
        lastName:           parsed.data.lastName,
        email:              parsed.data.email,
        phone:              parsed.data.phone     || undefined,
        roleId:             parsed.data.roleId === "NONE" ? undefined : parsed.data.roleId || undefined,
        sectorId:           parsed.data.sectorId === "NONE" ? undefined : parsed.data.sectorId || undefined,
        region:             parsed.data.region   || undefined,
        certificates: certEntries,
        diplomas,
        knowledge,
        isAvailable,
        isActive,
        autoInvite:         mode === "create" ? autoInvite : undefined,
        personnelType:      personnelType || undefined,
        emergencyAvailable,
        preferredRegions,
        contractInfo,
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
        toast.success("Personeelsrecord aangemaakt en tijdelijk wachtwoord verstuurd");
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
            <Label htmlFor="firstName">Voornaam <span className="text-destructive">*</span></Label>
            <Input id="firstName" {...register("firstName")} placeholder="Voornaam" aria-invalid={!!errors.firstName} />
            {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="lastName">Achternaam <span className="text-destructive">*</span></Label>
            <Input id="lastName" {...register("lastName")} placeholder="Achternaam" aria-invalid={!!errors.lastName} />
            {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="email">E-mail <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" {...register("email")} placeholder="medewerker@bedrijf.nl" aria-invalid={!!errors.email} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="phone">Telefoon</Label>
            <Input id="phone" {...register("phone")} placeholder="+31 6 00 00 00 00" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Employment type ────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Personeelstype
        </p>
        <div className="space-y-1">
          <Label htmlFor="personnelType">Type dienstverband</Label>
          <Select
            value={personnelType || "NONE"}
            onValueChange={(v) => setPersonnelType(v === "NONE" ? "" : v)}
          >
            <SelectTrigger id="personnelType">
              <SelectValue placeholder="Selecteer type…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Geen type —</SelectItem>
              {PERSONNEL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{PERSONNEL_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
          <div>
            <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Spoedsbeschikbaar</p>
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Beschikbaar voor urgente opdrachten buiten normale uren.
            </p>
          </div>
          <Switch checked={emergencyAvailable} onCheckedChange={setEmergencyAvailable} />
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
              onValueChange={(val) => setValue("roleId", val === "NONE" ? "" : val)}
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
            <Label htmlFor="sectorId">Sector</Label>
            <Select
              value={sectorIdValue}
              onValueChange={(val) => setValue("sectorId", val === "NONE" ? "" : val)}
            >
              <SelectTrigger id="sectorId">
                <SelectValue placeholder="Selecteer sector…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen sector —</SelectItem>
                {sectors.map((sector) => (
                  <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Certificaten</Label>
            <TagInput
              value={certEntries.map((c) => c.name)}
              onChange={(names) => {
                const prev = new Map(certEntries.map((c) => [c.name, c]));
                setCertEntries(names.map((n) => prev.get(n) ?? { name: n }));
              }}
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

      {/* ── Availability & Regions ─────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Beschikbaarheid &amp; Regio&apos;s
        </p>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="region">Primaire regio</Label>
            <Input
              id="region"
              {...register("region")}
              placeholder="bijv. Noord-Holland"
              aria-invalid={!!errors.region}
            />
            {errors.region && <p className="text-xs text-destructive">{errors.region.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Voorkeurregio&apos;s (extra)</Label>
            <TagInput
              value={preferredRegions}
              onChange={setPreferredRegions}
              placeholder="bijv. Zuid-Holland — typ en druk op Enter"
            />
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Extra regio&apos;s buiten de primaire regio waar de medewerker beschikbaar is.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Beschikbaar voor planning</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                Wanneer uitgeschakeld, verschijnt deze persoon niet in de planningsresultaten.
              </p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Actief</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                Inactief personeel wordt verborgen in planning en opdrachtstromen.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Contract info ──────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Contractgegevens
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="contractStartDate">Startdatum contract</Label>
            <Input
              id="contractStartDate"
              type="date"
              {...register("contractStartDate")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contractEndDate">Einddatum contract</Label>
            <Input
              id="contractEndDate"
              type="date"
              {...register("contractEndDate")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contractType">Contracttype</Label>
            <Input
              id="contractType"
              {...register("contractType")}
              placeholder="bijv. Onbepaalde tijd"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contractHours">Uren per week</Label>
            <Input
              id="contractHours"
              type="number"
              min="0"
              max="60"
              step="0.5"
              {...register("contractHours")}
              placeholder="bijv. 40"
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
                  Het personeelslid ontvangt direct een tijdelijk wachtwoord voor de Personeels-PWA.
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
