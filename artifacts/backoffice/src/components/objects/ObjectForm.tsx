"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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

interface ObjectFormProps {
  mode: "create" | "edit";
  objectId?: string;
  preselectedCustomerId?: string;
  sectors: SectorOption[];
  customers: CustomerOption[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

type FormValues = {
  customerId:  string;
  sectorId:    string;
  name:        string;
  code:        string;
  address:     string;
  city:        string;
  postalCode:  string;
  description: string;
};

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
  const [loading, setLoading]       = useState(mode === "edit");
  const [pending, startTransition]  = useTransition();
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
        setValue("customerId",  o.customerId       ?? "");
        setValue("sectorId",    o.sectorId         ?? "");
        setValue("name",        o.name             ?? "");
        setValue("code",        o.code             ?? "");
        setValue("address",     o.address          ?? "");
        setValue("city",        o.city             ?? "");
        setValue("postalCode",  o.postalCode       ?? "");
        setValue("description", o.description      ?? "");
      }
      setLoading(false);
    });
  }, [mode, objectId, setValue]);

  const onSubmit = handleSubmit((data) => {
    if (!data.customerId) {
      setError("customerId", { message: "Customer is required" });
      return;
    }
    startTransition(async () => {
      const input: ObjectFormInput = {
        ...data,
        sectorId: data.sectorId === "NONE" ? undefined : data.sectorId || undefined,
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

      toast.success(mode === "create" ? "Object created" : "Object updated");
      const id =
        mode === "create" && result.data
          ? result.data.id
          : (objectId ?? "");
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
          Customer
        </p>
        <div className="space-y-1">
          <Label htmlFor="customerId">
            Customer <span className="text-destructive">*</span>
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
                  : "Select customer..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0">
              <Command>
                <CommandInput placeholder="Search customers..." />
                <CommandList>
                  <CommandEmpty>No customers found.</CommandEmpty>
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
          General Info
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register("name", { required: "Name is required" })}
              placeholder="Object name"
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
              placeholder="e.g. OBJ-001"
            />
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
            <Input id="city" {...register("city")} placeholder="Amsterdam" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode">Postal Code</Label>
            <Input id="postalCode" {...register("postalCode")} placeholder="1234 AB" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Description ───────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Description
        </p>
        <Textarea
          {...register("description")}
          placeholder="Optional description of this object..."
          rows={3}
          className="resize-none"
        />
      </section>

      {/* ── Actions ───────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create Object" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
