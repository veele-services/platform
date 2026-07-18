"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AddressAutocomplete, type AddressAutocompleteSelection } from "@/components/google-maps/AddressAutocomplete";
import {
  getCustomer,
  createCustomer,
  updateCustomer,
  type SectorOption,
  type CustomerTypeOption,
  type AccountManagerOption,
  type CustomerFormInput,
} from "@/app/actions/customers";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS } from "@/types/customer-status";

// ─── Client-side Zod schema ───────────────────────────────────────────────────

const customerFormSchema = z.object({
  name:                    z.string().min(1, "Naam is verplicht").max(255),
  sectorId:                z.string(),
  contactName:             z.string().max(200),
  contactEmail:            z.string().refine(
    (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    "Ongeldig e-mailadres",
  ),
  contactPhone:            z.string().max(50),
  address:                 z.string(),
  city:                    z.string().max(100),
  postalCode:              z.string().max(20),
  country:                 z.string().min(1, "Land is verplicht").max(100),
  legalEntity:             z.string().max(255),
  vatNumber:               z.string().max(50),
  chamberOfCommerceNumber: z.string().max(50),
  website:                 z.string().max(255),
  mobile:                  z.string().max(50),
  customerTypeId:          z.string(),
  status:                  z.string(),
  accountManagerId:        z.string(),
  notes:                   z.string(),
});

type FormValues = z.infer<typeof customerFormSchema>;

type SelectedGooglePlace = {
  googlePlaceId: string;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  stateOrRegion: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

interface CustomerFormProps {
  mode:            "create" | "edit";
  customerId?:     string;
  sectors:         SectorOption[];
  customerTypes:   CustomerTypeOption[];
  accountManagers: AccountManagerOption[];
  canWriteNotes:   boolean;
  onSuccess:       (id: string) => void;
  onCancel:        () => void;
}

const DEFAULTS: FormValues = {
  name:                    "",
  sectorId:                "",
  contactName:             "",
  contactEmail:            "",
  contactPhone:            "",
  address:                 "",
  city:                    "",
  postalCode:              "",
  country:                 "NL",
  legalEntity:             "",
  vatNumber:               "",
  chamberOfCommerceNumber: "",
  website:                 "",
  mobile:                  "",
  customerTypeId:          "",
  status:                  "active",
  accountManagerId:        "",
  notes:                   "",
};

export function CustomerForm({
  mode,
  customerId,
  sectors,
  customerTypes,
  accountManagers,
  canWriteNotes,
  onSuccess,
  onCancel,
}: CustomerFormProps) {
  const [loading, setLoading]         = useState(mode === "edit");
  const [pending, startTransition]    = useTransition();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [invitePortal, setInvitePortal] = useState(false);
  const [invitePortalTouched, setInvitePortalTouched] = useState(false);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<SelectedGooglePlace | null>(null);

  const form = useForm<FormValues>({ defaultValues: DEFAULTS });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  const sectorIdValue        = watch("sectorId")        || "NONE";
  const customerTypeValue    = watch("customerTypeId")   || "NONE";
  const statusValue          = watch("status")           || "active";
  const accountManagerValue  = watch("accountManagerId") || "NONE";
  const contactEmailValue    = watch("contactEmail")     || "";
  const canInvitePortal =
    mode === "create" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmailValue.trim());

  useEffect(() => {
    if (mode !== "create") return;
    if (!canInvitePortal) {
      if (invitePortal) setInvitePortal(false);
      return;
    }
    if (!invitePortalTouched) setInvitePortal(true);
  }, [canInvitePortal, invitePortal, invitePortalTouched, mode]);

  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    setLoading(true);
    getCustomer(customerId).then((c) => {
      if (c) {
        setGeneratedCode(c.code ?? null);
        setValue("name",                    c.name                    ?? "");
        setValue("sectorId",                c.sectorId                ?? "");
        setValue("contactName",             c.contactName             ?? "");
        setValue("contactEmail",            c.contactEmail            ?? "");
        setValue("contactPhone",            c.contactPhone            ?? "");
        setValue("address",                 c.address                 ?? "");
        setValue("city",                    c.city                    ?? "");
        setValue("postalCode",              c.postalCode              ?? "");
        setValue("country",                 c.country                 ?? "NL");
        setValue("legalEntity",             c.legalEntity             ?? "");
        setValue("vatNumber",               c.vatNumber               ?? "");
        setValue("chamberOfCommerceNumber", c.chamberOfCommerceNumber ?? "");
        setValue("website",                 c.website                 ?? "");
        setValue("mobile",                  c.mobile                  ?? "");
        setValue("customerTypeId",          c.customerTypeId          ?? "");
        setValue("status",                  c.status                  ?? "active");
        setValue("accountManagerId",        c.accountManagerId        ?? "");
        setValue("notes",                   c.notes                   ?? "");
      }
      setLoading(false);
    });
  }, [mode, customerId, setValue]);

  function applyAddressSelection({ suggestion, place }: AddressAutocompleteSelection) {
    setValue("address", place.addressLine1 ?? suggestion.mainText ?? suggestion.label);
    setValue("postalCode", place.postalCode ?? "");
    setValue("city", place.city ?? "");
    setValue("country", place.countryCode || "NL");
    setSelectedGooglePlace(place);
  }

  const onSubmit = handleSubmit((data) => {
    const parsed = customerFormSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".");
        if (path) setError(path as keyof FormValues, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const googlePlaceStillMatches = selectedGooglePlace && (
        (selectedGooglePlace.addressLine1 ?? "") === (parsed.data.address || "") &&
        (selectedGooglePlace.postalCode ?? "") === (parsed.data.postalCode || "") &&
        (selectedGooglePlace.city ?? "") === (parsed.data.city || "")
      );
      const input: CustomerFormInput = {
        ...parsed.data,
        sectorId:        parsed.data.sectorId        === "NONE" ? undefined : parsed.data.sectorId        || undefined,
        customerTypeId:  parsed.data.customerTypeId  === "NONE" ? undefined : parsed.data.customerTypeId  || undefined,
        accountManagerId: parsed.data.accountManagerId === "NONE" ? undefined : parsed.data.accountManagerId || undefined,
        invitePortal:    mode === "create" ? invitePortal : undefined,
        googlePlace:     googlePlaceStillMatches ? selectedGooglePlace : undefined,
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

      const id = mode === "create" && result.data ? result.data.id : (customerId ?? "");
      if (mode === "create" && result.data?.invite) {
        if (result.data.invite.sent) {
          toast.success("Klant aangemaakt en klantportaaluitnodiging verstuurd");
        } else {
          toast.warning(
            `Klant aangemaakt, maar uitnodiging niet verstuurd: ${result.data.invite.message ?? "onbekende fout"}`,
            { duration: 8000 },
          );
        }
      } else {
        toast.success(mode === "create" ? "Klant aangemaakt" : "Klant bijgewerkt");
      }
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

      {/* ── Algemene info ──────────────────────────────── */}
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
              placeholder="Klantnaam"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Code</Label>
            <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40">
              {generatedCode ? (
                <span className="font-mono text-sm">{generatedCode}</span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {mode === "edit" ? "—" : "Wordt automatisch aangemaakt"}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sectorId">Sector</Label>
            <Select value={sectorIdValue} onValueChange={(val) => setValue("sectorId", val === "NONE" ? "" : val)}>
              <SelectTrigger id="sectorId">
                <SelectValue placeholder="Selecteer sector..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen sector —</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="customerTypeId">Klanttype</Label>
            <Select value={customerTypeValue} onValueChange={(val) => setValue("customerTypeId", val === "NONE" ? "" : val)}>
              <SelectTrigger id="customerTypeId">
                <SelectValue placeholder="Selecteer type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen type —</SelectItem>
                {customerTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="status">Status</Label>
            <Select value={statusValue} onValueChange={(val) => setValue("status", val)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="accountManagerId">Accountmanager</Label>
            <Select
              value={accountManagerValue}
              onValueChange={(val) => setValue("accountManagerId", val === "NONE" ? "" : val)}
            >
              <SelectTrigger id="accountManagerId">
                <SelectValue placeholder="Selecteer accountmanager..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— Geen accountmanager —</SelectItem>
                {accountManagers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Bedrijfsgegevens ───────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Bedrijfsgegevens
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="legalEntity">Rechtsvorm</Label>
            <Input id="legalEntity" {...register("legalEntity")} placeholder="B.V., N.V., Eenmanszaak..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vatNumber">BTW-nummer</Label>
            <Input id="vatNumber" {...register("vatNumber")} placeholder="NL000000000B01" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="chamberOfCommerceNumber">KVK-nummer</Label>
            <Input id="chamberOfCommerceNumber" {...register("chamberOfCommerceNumber")} placeholder="12345678" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="website">Website</Label>
            <Input id="website" {...register("website")} placeholder="https://voorbeeld.nl" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Contact ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Primair contact
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="contactName">Contactpersoon</Label>
            <Input id="contactName" {...register("contactName")} placeholder="Volledige naam" aria-invalid={!!errors.contactName} />
            {errors.contactName && <p className="text-xs text-destructive">{errors.contactName.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactEmail">E-mail</Label>
            <Input id="contactEmail" type="email" {...register("contactEmail")} placeholder="email@voorbeeld.nl" aria-invalid={!!errors.contactEmail} />
            {errors.contactEmail && <p className="text-xs text-destructive">{errors.contactEmail.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contactPhone">Telefoon</Label>
            <Input id="contactPhone" {...register("contactPhone")} placeholder="+31 20 000 0000" />
          </div>
          {mode === "create" && (
            <div
              className="col-span-2 flex items-start gap-3 rounded-lg border px-4 py-3"
              style={{ borderColor: canInvitePortal ? "#99F6E4" : "#E2E8F0", backgroundColor: canInvitePortal ? "#F0FDFA" : "#F8FAFC" }}
            >
              <Checkbox
                id="invitePortal"
                checked={invitePortal}
                disabled={!canInvitePortal}
                onCheckedChange={(val) => {
                  setInvitePortalTouched(true);
                  setInvitePortal(val === true);
                }}
                className="mt-0.5"
              />
              <div>
                <label
                  htmlFor="invitePortal"
                  className="cursor-pointer text-sm font-medium"
                  style={{ color: canInvitePortal ? "#081D3A" : "#94A3B8" }}
                >
                  Direct uitnodigen voor klantportaal
                </label>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
                  {canInvitePortal
                    ? `Staat standaard aan. De klant ontvangt een eenmalige activatiecode op ${contactEmailValue.trim().toLowerCase()}.`
                    : "Vul eerst een geldig e-mailadres in bij primair contact."}
                </p>
              </div>
            </div>
          )}
          <div className="col-span-2 space-y-1">
            <Label htmlFor="mobile">Mobiel</Label>
            <Input id="mobile" {...register("mobile")} placeholder="+31 6 00 00 00 00" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Adres ─────────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Adres
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <AddressAutocomplete
              label="Adres zoeken"
              description="Kies een adres om de velden automatisch te vullen."
              onSelect={applyAddressSelection}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="address">Straat &amp; Huisnummer</Label>
            <Input id="address" {...register("address")} placeholder="Hoofdstraat 1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="city">Stad</Label>
            <Input id="city" {...register("city")} placeholder="Amsterdam" aria-invalid={!!errors.city} />
            {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="postalCode">Postcode</Label>
            <Input id="postalCode" {...register("postalCode")} placeholder="1234 AB" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="country">Land</Label>
            <Input id="country" {...register("country")} placeholder="NL" aria-invalid={!!errors.country} />
            {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
          </div>
        </div>
      </section>

      {/* ── Interne notities ──────────────────────────── */}
      {canWriteNotes && (
        <>
          <Separator />
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#64748B" }}>
              Interne notities
            </p>
            <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
              Alleen zichtbaar voor management
            </p>
            <Textarea {...register("notes")} placeholder="Interne notities over deze klant..." rows={3} className="resize-none" />
          </section>
        </>
      )}

      {/* ── Actions ───────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Annuleren
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Klant aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </div>
    </form>
  );
}
