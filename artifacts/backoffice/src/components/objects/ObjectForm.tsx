"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getObject,
  createObject,
  updateObject,
  type CustomerOption,
  type ObjectFormInput,
} from "@/app/actions/objects";
import type { SectorOption } from "@/app/actions/customers";

// ─── Client-side Zod schema ───────────────────────────────────────────────────

const objectFormSchema = z.object({
  customerId: z.string().min(1, "Klant is verplicht"),
  sectorId:   z.string(),
  name: z
    .string()
    .min(1, "Naam is verplicht")
    .max(255, "Naam mag maximaal 255 tekens bevatten"),
  code:        z.string().max(50, "Code mag maximaal 50 tekens bevatten"),
  address:     z.string(),
  city:        z.string().max(100, "Stad mag maximaal 100 tekens bevatten"),
  postalCode:  z.string().max(20, "Postcode mag maximaal 20 tekens bevatten"),
  description: z.string(),
});

type FormValues = z.infer<typeof objectFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface ObjectFormProps {
  mode: "create" | "edit";
  objectId?: string;
  preselectedCustomerId?: string;
  sectors: SectorOption[];
  customers: CustomerOption[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

const DEFAULTS: FormValues = {
  customerId:  "",
  sectorId:    "",
  name:        "",
  code:        "",
  address:     "",
  city:        "",
  postalCode:  "",
  description: "",
};

export function ObjectForm({
  mode,
  objectId,
  preselectedCustomerId,
  sectors,
  customers,
  onSuccess,
  onCancel,
}: ObjectFormProps) {
  const [loading, setLoading]          = useState(mode === "edit");
  const [pending, startTransition]     = useTransition();
  const [customerOpen, setCustomerOpen] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      ...DEFAULTS,
      customerId: preselectedCustomerId ?? "",
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const customerIdValue = watch("customerId");
  const sectorIdValue   = watch("sectorId") || "NONE";

  const selectedCustomer = customers.find((c) => c.id === customerIdValue);

  useEffect(() => {
    if (mode !== "edit" || !objectId) return;
    setLoading(true);
    getObject(objectId).then((o) => {
      if (o) {
        setValue("customerId",  o.customerId        ?? "");
        setValue("sectorId",    o.sectorId          ?? "");
        setValue("name",        o.name              ?? "");
        setValue("code",        o.code              ?? "");
        setValue("address",     o.address           ?? "");
        setValue("city",        o.city              ?? "");
        setValue("postalCode",  o.postalCode        ?? "");
        setValue("description", o.description       ?? "");
      }
      setLoading(false);
    });
  }, [mode, objectId, setValue]);

  const onSubmit = handleSubmit((data) => {
    // ── Client-side Zod validation ───────────────────
    const parsed = objectFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".");
        if (path) setError(path as keyof FormValues, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const input: ObjectFormInput = {
        ...parsed.data,
        sectorId: parsed.data.sectorId === "NONE" ? undefined : parsed.data.sectorId || undefined,
      };

      const result =
        mode === "create"
          ? await createObject(input)
          : await updateObject(objectId!, input);

      if (!result.success) {
        if ("fieldErrors" in result && result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, message]) => {
            setError(field as keyof FormValues, { message });
          });
        }
        toast.error(result.message);
        return;
      }

      toast.success(mode === "create" ? "Object aangemaakt" : "Object bijgewerkt");
      const id =
        mode === "create" && result.data ? result.data.id : (objectId ?? "");
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

      {/* ── Customer ──────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Klant
        </p>
        <div className="space-y-1">
          <Label htmlFor="customerId">
            Klant <span className="text-destructive">*</span>
          </Label>
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={customerOpen}
                className={cn(
                  "w-full justify-between",
                  !customerIdValue && "text-muted-foreground",
                  errors.customerId && "border-destructive",
                )}
              >
                {selectedCustomer
                  ? `${selectedCustomer.name}${selectedCustomer.code ? ` (${selectedCustomer.code})` : ""}`
                  : "Selecteer klant..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0">
              <Command>
                <CommandInput placeholder="Zoek klanten..." />
                <CommandList>
                  <CommandEmpty>Geen klanten gevonden.</CommandEmpty>
                  <CommandGroup>
                    {customers.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.code ?? ""}`}
                        onSelect={() => {
                          setValue("customerId", c.id);
                          setCustomerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            customerIdValue === c.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm">{c.name}</span>
                          {c.code && (
                            <span className="text-xs text-muted-foreground">{c.code}</span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {errors.customerId && (
            <p className="text-xs text-destructive">{errors.customerId.message}</p>
          )}
        </div>
      </section>

      <Separator />

      {/* ── General Info ──────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Algemene info
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">
              Naam <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Objectnaam"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="code">Code</Label>
            <Input id="code" {...register("code")} placeholder="bijv. OBJ-001" />
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
                <SelectValue placeholder="Selecteer sector..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen sector —</SelectItem>
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

      {/* ── Address ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Adres
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="address">Straat &amp; Huisnummer</Label>
            <Input id="address" {...register("address")} placeholder="Hoofdstraat 1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="city">Stad</Label>
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
            <Label htmlFor="postalCode">Postcode</Label>
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
        </div>
      </section>

      <Separator />

      {/* ── Description ───────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Omschrijving
        </p>
        <Textarea
          {...register("description")}
          placeholder="Optionele omschrijving van dit object..."
          rows={3}
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
          {mode === "create" ? "Object aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </div>
    </form>
  );
}
