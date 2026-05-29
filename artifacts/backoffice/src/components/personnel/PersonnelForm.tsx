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
  firstName: z.string().min(1, "First name is required").max(100, "Max 100 characters"),
  lastName:  z.string().min(1, "Last name is required").max(100, "Max 100 characters"),
  email:     z.string()
    .min(1, "Email is required")
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      "Invalid email address",
    ),
  phone:  z.string().max(50, "Max 50 characters"),
  roleId: z.string(),
  region: z.string().max(100, "Max 100 characters"),
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

      toast.success(mode === "create" ? "Personnel record created" : "Personnel record updated");
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
          Personal Info
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="firstName">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              {...register("firstName")}
              placeholder="First name"
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="lastName">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              {...register("lastName")}
              placeholder="Last name"
              aria-invalid={!!errors.lastName}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              placeholder="employee@company.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="col-span-2 space-y-1">
            <Label htmlFor="phone">Phone</Label>
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
          Role &amp; Qualifications
        </p>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="roleId">Role</Label>
            <Select
              value={roleIdValue}
              onValueChange={(val) =>
                setValue("roleId", val === "NONE" ? "" : val)
              }
            >
              <SelectTrigger id="roleId">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— No role —</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Certificates</Label>
            <TagInput
              value={certificates}
              onChange={setCertificates}
              placeholder="e.g. VCA, BHV — type and press Enter"
            />
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              Press Enter or Tab to add each certificate.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Diplomas</Label>
            <TagInput
              value={diplomas}
              onChange={setDiplomas}
              placeholder="e.g. MBO-3, HBO — type and press Enter"
            />
          </div>

          <div className="space-y-1">
            <Label>Knowledge</Label>
            <TagInput
              value={knowledge}
              onChange={setKnowledge}
              placeholder="e.g. Electrical, Plumbing — type and press Enter"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Availability & Region ─────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Availability &amp; Region
        </p>
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              {...register("region")}
              placeholder="e.g. Noord-Holland"
              aria-invalid={!!errors.region}
            />
            {errors.region && (
              <p className="text-xs text-destructive">{errors.region.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Available for Planning</p>
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                When off, this person will not appear in the planning eligibility results.
              </p>
            </div>
            <Switch
              checked={isAvailable}
              onCheckedChange={setIsAvailable}
            />
          </div>

          {mode === "edit" && (
            <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "#081D3A" }}>Active</p>
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  Inactive personnel are hidden from planning and assignment flows.
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Actions ────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Personnel" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
