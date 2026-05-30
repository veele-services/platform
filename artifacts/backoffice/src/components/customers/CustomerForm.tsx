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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  getCustomer,
  createCustomer,
  updateCustomer,
  type SectorOption,
  type CustomerFormInput,
} from "@/app/actions/customers";

// ─── Client-side Zod schema ───────────────────────────────────────────────────

const customerFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or fewer"),
  code: z.string().max(50, "Code must be 50 characters or fewer"),
  sectorId: z.string(),
  contactName: z.string().max(200, "Contact name must be 200 characters or fewer"),
  contactEmail: z
    .string()
    .refine(
      (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      "Invalid email address",
    ),
  contactPhone: z.string().max(50, "Phone must be 50 characters or fewer"),
  address: z.string(),
  city: z.string().max(100, "City must be 100 characters or fewer"),
  postalCode: z.string().max(20, "Postal code must be 20 characters or fewer"),
  country: z
    .string()
    .min(1, "Country is required")
    .max(100, "Country must be 100 characters or fewer"),
  notes: z.string(),
});

type FormValues = z.infer<typeof customerFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface CustomerFormProps {
  mode: "create" | "edit";
  customerId?: string;
  sectors: SectorOption[];
  canWriteNotes: boolean;
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

const DEFAULTS: FormValues = {
  name:         "",
  code:         "",
  sectorId:     "",
  contactName:  "",
  contactEmail: "",
  contactPhone: "",
  address:      "",
  city:         "",
  postalCode:   "",
  country:      "NL",
  notes:        "",
};

export function CustomerForm({
  mode,
  customerId,
  sectors,
  canWriteNotes,
  onSuccess,
  onCancel,
}: CustomerFormProps) {
  const [loading, setLoading]       = useState(mode === "edit");
  const [pending, startTransition]  = useTransition();

  const form = useForm<FormValues>({ defaultValues: DEFAULTS });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const sectorIdValue = watch("sectorId") || "NONE";

  // Load existing customer when editing
  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    setLoading(true);
    getCustomer(customerId).then((c) => {
      if (c) {
        setValue("name",         c.name         ?? "");
        setValue("code",         c.code         ?? "");
        setValue("sectorId",     c.sectorId     ?? "");
        setValue("contactName",  c.contactName  ?? "");
        setValue("contactEmail", c.contactEmail ?? "");
        setValue("contactPhone", c.contactPhone ?? "");
        setValue("address",      c.address      ?? "");
        setValue("city",         c.city         ?? "");
        setValue("postalCode",   c.postalCode   ?? "");
        setValue("country",      c.country      ?? "NL");
        setValue("notes",        c.notes        ?? "");
      }
      setLoading(false);
    });
  }, [mode, customerId, setValue]);

  const onSubmit = handleSubmit((data) => {
    // ── Client-side Zod validation ───────────────────
    const parsed = customerFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".");
        if (path) setError(path as keyof FormValues, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const input: CustomerFormInput = {
        ...parsed.data,
        sectorId: parsed.data.sectorId === "NONE" ? undefined : parsed.data.sectorId || undefined,
      };

      const result =
        mode === "create"
          ? await createCustomer(input)
          : await updateCustomer(customerId!, input);

      if (!result.success) {
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, message]) => {
            setError(field as keyof FormValues, { message });
          });
        }
        toast.error(result.message);
        return;
      }

      toast.success(mode === "create" ? "Customer created" : "Customer updated");
      const id =
        mode === "create" && result.data ? result.data.id : (customerId ?? "");
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

      {/* ── General Info ──────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          General Info
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Customer name"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              {...register("code")}
              placeholder="e.g. CUST-001"
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
              onValueChange={(val) =>
                setValue("sectorId", val === "NONE" ? "" : val)
              }
            >
              <SelectTrigger id="sectorId">
                <SelectValue placeholder="Select sector..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— No sector —</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Contact ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Contact
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="contactName">Contact Person</Label>
            <Input
              id="contactName"
              {...register("contactName")}
              placeholder="Full name"
              aria-invalid={!!errors.contactName}
            />
            {errors.contactName && (
              <p className="text-xs text-destructive">{errors.contactName.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactEmail">Email</Label>
            <Input
              id="contactEmail"
              type="email"
              {...register("contactEmail")}
              placeholder="email@example.com"
              aria-invalid={!!errors.contactEmail}
            />
            {errors.contactEmail && (
              <p className="text-xs text-destructive">{errors.contactEmail.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactPhone">Phone</Label>
            <Input
              id="contactPhone"
              {...register("contactPhone")}
              placeholder="+31 6 00 00 00 00"
              aria-invalid={!!errors.contactPhone}
            />
            {errors.contactPhone && (
              <p className="text-xs text-destructive">{errors.contactPhone.message}</p>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Address ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Address
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="address">Street &amp; Number</Label>
            <Input
              id="address"
              {...register("address")}
              placeholder="Hoofdstraat 1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              {...register("city")}
              placeholder="Amsterdam"
              aria-invalid={!!errors.city}
            />
            {errors.city && (
              <p className="text-xs text-destructive">{errors.city.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode">Postal Code</Label>
            <Input
              id="postalCode"
              {...register("postalCode")}
              placeholder="1234 AB"
              aria-invalid={!!errors.postalCode}
            />
            {errors.postalCode && (
              <p className="text-xs text-destructive">{errors.postalCode.message}</p>
            )}
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              {...register("country")}
              placeholder="NL"
              aria-invalid={!!errors.country}
            />
            {errors.country && (
              <p className="text-xs text-destructive">{errors.country.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Internal Notes (management only) ─────────── */}
      {canWriteNotes && (
        <>
          <Separator />
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748B" }}>
              Internal Notes
            </p>
            <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
              Only visible to management — never shown to customer portal users.
            </p>
            <Textarea
              {...register("notes")}
              placeholder="Internal notes about this customer..."
              rows={3}
              className="resize-none"
            />
          </section>
        </>
      )}

      {/* ── Actions ───────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Customer" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
