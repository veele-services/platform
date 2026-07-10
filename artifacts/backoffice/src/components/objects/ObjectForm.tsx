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
import { TagInput } from "@/components/ui/tag-input";
import { RegionMultiSelect } from "@/components/regions/RegionMultiSelect";
import { cn } from "@/lib/utils";
import {
  getObject,
  createObject,
  updateObject,
  type CustomerOption,
  type ObjectFormInput,
} from "@/app/actions/objects";
import {
  getObjectRegionNames,
  syncObjectRegions,
  type RegionOption,
} from "@/app/actions/regions";
import type { SectorOption } from "@/app/actions/customers";

// ─── Client-side Zod schema ───────────────────────────────────────────────────

const objectFormSchema = z.object({
  customerId:           z.string().min(1, "Klant is verplicht"),
  sectorId:             z.string(),
  name:                 z.string().min(1, "Naam is verplicht").max(255, "Naam mag maximaal 255 tekens bevatten"),
  address:              z.string(),
  city:                 z.string().max(100, "Stad mag maximaal 100 tekens bevatten"),
  postalCode:           z.string().max(20, "Postcode mag maximaal 20 tekens bevatten"),
  description:          z.string(),
  contactName:          z.string(),
  contactFunction:      z.string(),
  contactPhone:         z.string(),
  contactEmail:         z.string(),
  serviceType:          z.string(),
  accessInfo:           z.string(),
  keyInfo:              z.string(),
  alarmInfo:            z.string(),
  fixedInstructions:    z.string(),
  specialNotes:         z.string(),
  requiredRoles:        z.array(z.string()),
  requiredCertificates: z.array(z.string()),
});

type FormValues = z.infer<typeof objectFormSchema>;

type AddressSuggestion = {
  id: string;
  placeId?: string;
  label: string;
  mainText?: string;
  secondaryText?: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  confidence: number;
};

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

function createPlacesSessionToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ObjectFormProps {
  mode: "create" | "edit";
  objectId?: string;
  preselectedCustomerId?: string;
  sectors: SectorOption[];
  customers: CustomerOption[];
  regionOptions?: RegionOption[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

const DEFAULTS: FormValues = {
  customerId:           "",
  sectorId:             "",
  name:                 "",
  address:              "",
  city:                 "",
  postalCode:           "",
  description:          "",
  contactName:          "",
  contactFunction:      "",
  contactPhone:         "",
  contactEmail:         "",
  serviceType:          "",
  accessInfo:           "",
  keyInfo:              "",
  alarmInfo:            "",
  fixedInstructions:    "",
  specialNotes:         "",
  requiredRoles:        [],
  requiredCertificates: [],
};

export function ObjectForm({
  mode,
  objectId,
  preselectedCustomerId,
  sectors,
  customers,
  regionOptions = [],
  onSuccess,
  onCancel,
}: ObjectFormProps) {
  const [loading, setLoading]             = useState(mode === "edit");
  const [pending, startTransition]        = useTransition();
  const [customerOpen, setCustomerOpen]   = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [regionNames, setRegionNames]     = useState<string[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSessionToken, setAddressSessionToken] = useState(createPlacesSessionToken);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<SelectedGooglePlace | null>(null);

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

  const customerIdValue      = watch("customerId");
  const sectorIdValue        = watch("sectorId") || "NONE";
  const requiredRoles        = watch("requiredRoles");
  const requiredCertificates = watch("requiredCertificates");
  const addressValue         = watch("address");
  const postalCodeValue      = watch("postalCode");
  const cityValue            = watch("city");

  const selectedCustomer = customers.find((c) => c.id === customerIdValue);

  useEffect(() => {
    if (mode !== "edit" || !objectId) return;
    setLoading(true);
    Promise.all([getObject(objectId), getObjectRegionNames(objectId)])
      .then(([o, linkedRegions]) => {
        if (o) {
          setGeneratedCode(o.code ?? null);
          setValue("customerId",           o.customerId            ?? "");
          setValue("sectorId",             o.sectorId              ?? "");
          setValue("name",                 o.name                  ?? "");
          setValue("address",              o.address               ?? "");
          setValue("city",                 o.city                  ?? "");
          setValue("postalCode",           o.postalCode            ?? "");
          setValue("description",          o.description           ?? "");
          setValue("contactName",          o.contactName           ?? "");
          setValue("contactFunction",      o.contactFunction       ?? "");
          setValue("contactPhone",         o.contactPhone          ?? "");
          setValue("contactEmail",         o.contactEmail          ?? "");
          setValue("serviceType",          o.serviceType           ?? "");
          setValue("accessInfo",           o.accessInfo            ?? "");
          setValue("keyInfo",              o.keyInfo               ?? "");
          setValue("alarmInfo",            o.alarmInfo             ?? "");
          setValue("fixedInstructions",    o.fixedInstructions     ?? "");
          setValue("specialNotes",         o.specialNotes          ?? "");
          setValue("requiredRoles",        o.requiredRoles         ?? []);
          setValue("requiredCertificates", o.requiredCertificates  ?? []);
          setRegionNames(linkedRegions);
        }
      })
      .finally(() => setLoading(false));
  }, [mode, objectId, setValue]);

  useEffect(() => {
    const query = [addressValue, postalCodeValue, cityValue]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" ");

    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressLoading(true);
      try {
        const response = await fetch("/api/google-maps/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query, sessionToken: addressSessionToken, limit: 6 }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setAddressSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { suggestions?: AddressSuggestion[] };
        setAddressSuggestions(payload.suggestions ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAddressSuggestions([]);
        }
      } finally {
        setAddressLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [addressValue, postalCodeValue, cityValue, addressSessionToken]);

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    if (!suggestion.placeId) {
      setValue("address", suggestion.street ?? "");
      setValue("postalCode", suggestion.postalCode ?? "");
      setValue("city", suggestion.city ?? "");
      setAddressSuggestions([]);
      setSelectedGooglePlace(null);
      setAddressSessionToken(createPlacesSessionToken());
      return;
    }

    setAddressLoading(true);
    try {
      const response = await fetch("/api/google-maps/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: addressSessionToken,
        }),
      });
      if (!response.ok) {
        toast.error("Adresdetails konden niet worden opgehaald. Handmatige invoer blijft mogelijk.");
        return;
      }
      const payload = (await response.json()) as { place?: SelectedGooglePlace };
      if (!payload.place) return;
      const place = payload.place;
      setValue("address", place.addressLine1 ?? suggestion.mainText ?? suggestion.label);
      setValue("postalCode", place.postalCode ?? "");
      setValue("city", place.city ?? "");
      setSelectedGooglePlace(place);
      setAddressSuggestions([]);
      setAddressSessionToken(createPlacesSessionToken());
    } finally {
      setAddressLoading(false);
    }
  }

  const onSubmit = handleSubmit((data) => {
    const parsed = objectFormSchema.safeParse(data);
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
      const input: ObjectFormInput = {
        ...parsed.data,
        sectorId:             parsed.data.sectorId === "NONE" ? undefined : parsed.data.sectorId || undefined,
        contactName:          parsed.data.contactName          || undefined,
        contactFunction:      parsed.data.contactFunction      || undefined,
        contactPhone:         parsed.data.contactPhone         || undefined,
        contactEmail:         parsed.data.contactEmail         || undefined,
        serviceType:          parsed.data.serviceType          || undefined,
        accessInfo:           parsed.data.accessInfo           || undefined,
        keyInfo:              parsed.data.keyInfo              || undefined,
        alarmInfo:            parsed.data.alarmInfo            || undefined,
        fixedInstructions:    parsed.data.fixedInstructions    || undefined,
        specialNotes:         parsed.data.specialNotes         || undefined,
        googlePlace:          googlePlaceStillMatches ? selectedGooglePlace : undefined,
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

      const id =
        mode === "create" && result.data ? result.data.id : (objectId ?? "");

      if (id) {
        const regionResult = await syncObjectRegions(id, regionNames);
        if (!regionResult.success) {
          toast.error(regionResult.message);
          return;
        }
      }

      toast.success(mode === "create" ? "Object aangemaakt" : "Object bijgewerkt");
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
          <Label>
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
            <Label>
              Naam <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register("name")}
              placeholder="Objectnaam"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
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
            <Label>Sector</Label>
            <Select
              value={sectorIdValue}
              onValueChange={(val) =>
                setValue("sectorId", val === "NONE" ? "" : val)
              }
            >
              <SelectTrigger>
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

          <div className="col-span-2 space-y-1">
            <Label>Diensttype</Label>
            <Input
              {...register("serviceType")}
              placeholder="Bijv. Schoonmaak, Beveiliging, Onderhoud..."
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Regions ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Regio&apos;s
        </p>
        <RegionMultiSelect
          value={regionNames}
          onChange={setRegionNames}
          options={regionOptions}
          placeholder="Selecteer of maak regio's..."
        />
        <p className="mt-2 text-xs" style={{ color: "#94A3B8" }}>
          Objectregio&apos;s kunnen later als standaard dienen bij nieuwe opdrachten en planningfilters.
        </p>
      </section>

      <Separator />

      {/* ── Address ───────────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Adres
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative col-span-2 rounded-lg border p-3" style={{ borderColor: "#E2E8F0" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Objectadres</p>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  Wordt gebruikt voor kaartweergave en reistijd vanaf het huisadres van de medewerker.
                </p>
              </div>
              {addressLoading ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#00B7B3" }} /> : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="objectAddress">Straat &amp; huisnummer</Label>
                <Input
                  id="objectAddress"
                  {...register("address")}
                  placeholder="Hoofdstraat 1"
                  autoComplete="street-address"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="objectCity">Stad</Label>
                <Input
                  id="objectCity"
                  {...register("city")}
                  placeholder="Amsterdam"
                  autoComplete="address-level2"
                  aria-invalid={!!errors.city}
                />
                {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="objectPostalCode">Postcode</Label>
                <Input
                  id="objectPostalCode"
                  {...register("postalCode")}
                  placeholder="1234 AB"
                  autoComplete="postal-code"
                  aria-invalid={!!errors.postalCode}
                />
                {errors.postalCode && <p className="text-xs text-destructive">{errors.postalCode.message}</p>}
              </div>
            </div>
            {addressSuggestions.length > 0 ? (
              <div
                className="absolute left-3 right-3 top-[calc(100%-0.75rem)] z-[80] rounded-md border bg-white shadow-xl"
                style={{ borderColor: "#D8E8F3" }}
              >
                <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>
                  Adres aanvullen
                </p>
                <div className="max-h-44 overflow-y-auto p-1">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => { void selectAddressSuggestion(suggestion); }}
                    >
                      <span className="block font-medium" style={{ color: "#081D3A" }}>
                        {suggestion.mainText ?? suggestion.label}
                      </span>
                      <span className="text-xs" style={{ color: "#64748B" }}>
                        {suggestion.secondaryText ?? "Google Places"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Primary contact ───────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Primair contactpersoon
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Naam</Label>
            <Input {...register("contactName")} placeholder="Jan Jansen" />
          </div>
          <div className="space-y-1">
            <Label>Functie</Label>
            <Input {...register("contactFunction")} placeholder="Facilitair manager" />
          </div>
          <div className="space-y-1">
            <Label>Telefoon</Label>
            <Input {...register("contactPhone")} placeholder="+31 6 00 00 00 00" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>E-mail</Label>
            <Input {...register("contactEmail")} type="email" placeholder="jan@bedrijf.nl" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Access & security ─────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Toegang &amp; beveiliging
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Toegangsinformatie</Label>
            <Textarea {...register("accessInfo")} placeholder="Sleutelkast code, toegangspas, portiek..." rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label>Sleutelinformatie</Label>
            <Textarea {...register("keyInfo")} placeholder="Sleutelnummer, bewaarplaats, retourprocedure..." rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label>Alarmgegevens</Label>
            <Textarea {...register("alarmInfo")} placeholder="Alarmcode, contactpersoon bij alarm..." rows={2} className="resize-none" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Instructions ──────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Instructies &amp; bijzonderheden
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Vaste instructies</Label>
            <Textarea {...register("fixedInstructions")} placeholder="Vaste werkinstructies die altijd van toepassing zijn..." rows={3} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label>Bijzonderheden</Label>
            <Textarea {...register("specialNotes")} placeholder="Bijzondere omstandigheden, aandachtspunten, gevaren..." rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label>Omschrijving</Label>
            <Textarea {...register("description")} placeholder="Optionele omschrijving van dit object..." rows={2} className="resize-none" />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Qualifications ────────────────────────────── */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
          Vereiste kwalificaties
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Vereiste functies</Label>
            <TagInput
              value={requiredRoles}
              onChange={(tags) => setValue("requiredRoles", tags)}
              placeholder="Typ functie en druk Enter..."
            />
          </div>
          <div className="space-y-1">
            <Label>Vereiste certificaten</Label>
            <TagInput
              value={requiredCertificates}
              onChange={(tags) => setValue("requiredCertificates", tags)}
              placeholder="Bijv. VCA, BHV..."
            />
          </div>
        </div>
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
