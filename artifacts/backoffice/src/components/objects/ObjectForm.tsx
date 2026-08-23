"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormActions } from "@/components/ui/form-actions";
import { FormGrid } from "@/components/ui/form-grid";
import { FormSection } from "@/components/ui/form-section";
import { useUxFormAnalytics } from "@/lib/use-ux-form-analytics";
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
import { useUnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { TagInput } from "@/components/ui/tag-input";
import { RegionMultiSelect } from "@/components/regions/RegionMultiSelect";
import {
  AddressAutocomplete,
  type AddressAutocompleteSelection,
} from "@/components/google-maps/AddressAutocomplete";
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
  customerId: z.string().min(1, "Klant is verplicht"),
  sectorId: z.string(),
  name: z
    .string()
    .min(1, "Naam is verplicht")
    .max(255, "Naam mag maximaal 255 tekens bevatten"),
  address: z.string(),
  city: z.string().max(100, "Stad mag maximaal 100 tekens bevatten"),
  postalCode: z.string().max(20, "Postcode mag maximaal 20 tekens bevatten"),
  description: z.string(),
  contactName: z.string(),
  contactFunction: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  serviceType: z.string(),
  fixedInstructions: z.string(),
  specialNotes: z.string(),
  requiredRoles: z.array(z.string()),
  requiredCertificates: z.array(z.string()),
});

type FormValues = z.infer<typeof objectFormSchema>;

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
  customerId: "",
  sectorId: "",
  name: "",
  address: "",
  city: "",
  postalCode: "",
  description: "",
  contactName: "",
  contactFunction: "",
  contactPhone: "",
  contactEmail: "",
  serviceType: "",
  fixedInstructions: "",
  specialNotes: "",
  requiredRoles: [],
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
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, startTransition] = useTransition();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [regionNames, setRegionNames] = useState<string[]>([]);
  const [regionsDirty, setRegionsDirty] = useState(false);
  const [selectedGooglePlace, setSelectedGooglePlace] =
    useState<SelectedGooglePlace | null>(null);

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
    formState: { errors, isDirty },
  } = form;
  const { requestNavigation, guard } = useUnsavedChangesGuard(
    (isDirty || regionsDirty) && !pending,
  );
  const {
    start: trackFormStart,
    complete: trackFormComplete,
    mutationError: trackMutationError,
  } = useUxFormAnalytics("objects", "object");

  const customerIdValue = watch("customerId");
  const sectorIdValue = watch("sectorId") || "NONE";
  const requiredRoles = watch("requiredRoles");
  const requiredCertificates = watch("requiredCertificates");

  useEffect(() => {
    if (mode !== "edit" || !objectId) return;
    setLoading(true);
    Promise.all([getObject(objectId), getObjectRegionNames(objectId)])
      .then(([o, linkedRegions]) => {
        if (o) {
          setGeneratedCode(o.code ?? null);
          setValue("customerId", o.customerId ?? "");
          setValue("sectorId", o.sectorId ?? "");
          setValue("name", o.name ?? "");
          setValue("address", o.address ?? "");
          setValue("city", o.city ?? "");
          setValue("postalCode", o.postalCode ?? "");
          setValue("description", o.description ?? "");
          setValue("contactName", o.contactName ?? "");
          setValue("contactFunction", o.contactFunction ?? "");
          setValue("contactPhone", o.contactPhone ?? "");
          setValue("contactEmail", o.contactEmail ?? "");
          setValue("serviceType", o.serviceType ?? "");
          setValue("fixedInstructions", o.fixedInstructions ?? "");
          setValue("specialNotes", o.specialNotes ?? "");
          setValue("requiredRoles", o.requiredRoles ?? []);
          setValue("requiredCertificates", o.requiredCertificates ?? []);
          setRegionNames(linkedRegions);
          setRegionsDirty(false);
        }
      })
      .finally(() => setLoading(false));
  }, [mode, objectId, setValue]);

  function applyAddressSelection({
    suggestion,
    place,
  }: AddressAutocompleteSelection) {
    setValue(
      "address",
      place.addressLine1 ?? suggestion.mainText ?? suggestion.label,
      { shouldDirty: true, shouldValidate: true },
    );
    setValue("postalCode", place.postalCode ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("city", place.city ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setSelectedGooglePlace(place);
  }

  const onSubmit = handleSubmit((data) => {
    const parsed = objectFormSchema.safeParse(data);
    if (!parsed.success) {
      trackMutationError("validation");
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join(".");
        if (path)
          setError(path as keyof FormValues, { message: issue.message });
      }
      return;
    }

    startTransition(async () => {
      const googlePlaceStillMatches =
        selectedGooglePlace &&
        (selectedGooglePlace.addressLine1 ?? "") ===
          (parsed.data.address || "") &&
        (selectedGooglePlace.postalCode ?? "") ===
          (parsed.data.postalCode || "") &&
        (selectedGooglePlace.city ?? "") === (parsed.data.city || "");
      const input: ObjectFormInput = {
        ...parsed.data,
        sectorId:
          parsed.data.sectorId === "NONE"
            ? undefined
            : parsed.data.sectorId || undefined,
        contactName: parsed.data.contactName || undefined,
        contactFunction: parsed.data.contactFunction || undefined,
        contactPhone: parsed.data.contactPhone || undefined,
        contactEmail: parsed.data.contactEmail || undefined,
        serviceType: parsed.data.serviceType || undefined,
        fixedInstructions: parsed.data.fixedInstructions || undefined,
        specialNotes: parsed.data.specialNotes || undefined,
        googlePlace: googlePlaceStillMatches ? selectedGooglePlace : undefined,
      };

      const result =
        mode === "create"
          ? await createObject(input)
          : await updateObject(objectId!, input);

      if (!result.success) {
        trackMutationError("server");
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
          trackMutationError("server");
          toast.error(regionResult.message);
          return;
        }
      }

      toast.success(
        mode === "create" ? "Object aangemaakt" : "Object bijgewerkt",
      );
      trackFormComplete();
      onSuccess(id);
    });
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-primary motion-reduce:animate-none" />
        <span className="sr-only">Objectgegevens laden…</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocusCapture={trackFormStart}
      className="flex flex-col gap-4 py-4"
    >
      {/* ── Customer ──────────────────────────────────── */}
      <FormSection
        title="Klant"
        description="Koppel het object aan de organisatie waarvoor het werk wordt uitgevoerd."
      >
        <div className="space-y-1">
          <Label htmlFor="object-customer">
            Klant <span className="text-destructive">*</span>
          </Label>
          <Combobox
            id="object-customer"
            value={customerIdValue}
            onValueChange={(value) =>
              setValue("customerId", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
              searchValue: `${customer.name} ${customer.code ?? ""}`,
              description: customer.code || undefined,
            }))}
            placeholder="Selecteer klant…"
            searchPlaceholder="Zoek op klantnaam of code…"
            emptyLabel="Geen klanten gevonden."
            ariaLabel="Klant selecteren"
            invalid={Boolean(errors.customerId)}
            className="min-h-11"
          />
          {errors.customerId && (
            <p className="text-xs text-destructive" role="alert">
              {errors.customerId.message}
            </p>
          )}
        </div>
      </FormSection>

      {/* ── General Info ──────────────────────────────── */}
      <FormSection title="Algemene informatie">
        <FormGrid columns="two">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="object-name">
              Naam <span className="text-destructive">*</span>
            </Label>
            <Input
              id="object-name"
              {...register("name")}
              placeholder="Objectnaam"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="object-code">Code</Label>
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
            <Label htmlFor="object-sector">Sector</Label>
            <Select
              value={sectorIdValue}
              onValueChange={(val) =>
                setValue("sectorId", val === "NONE" ? "" : val, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="object-sector">
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

          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="object-service-type">Diensttype</Label>
            <Input
              id="object-service-type"
              {...register("serviceType")}
              placeholder="Bijv. Schoonmaak, Beveiliging, Onderhoud..."
            />
          </div>
        </FormGrid>
      </FormSection>

      {/* ── Regions ───────────────────────────────────── */}
      <FormSection
        title="Regio’s"
        description="Gebruik regio’s later als standaard bij nieuwe opdrachten en planningfilters."
      >
        <RegionMultiSelect
          value={regionNames}
          onChange={(nextRegions) => {
            setRegionNames(nextRegions);
            setRegionsDirty(true);
          }}
          options={regionOptions}
          placeholder="Selecteer of maak regio's..."
        />
      </FormSection>

      {/* ── Address ───────────────────────────────────── */}
      <FormSection
        title="Adres"
        description="Dit adres wordt gebruikt voor kaartweergave en reistijdberekening."
      >
        <FormGrid columns="two">
          <div className="relative rounded-lg border border-border p-3 sm:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Objectadres
                </p>
                <p className="text-xs text-muted-foreground">
                  Wordt gebruikt voor kaartweergave en reistijd vanaf het
                  huisadres van de medewerker.
                </p>
              </div>
            </div>
            <AddressAutocomplete
              className="mb-3"
              label="Adres zoeken"
              description="Kies een adres om de velden automatisch te vullen."
              onSelect={applyAddressSelection}
            />
            <FormGrid columns="two">
              <div className="space-y-1 sm:col-span-2">
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
                {errors.city && (
                  <p className="text-xs text-destructive">
                    {errors.city.message}
                  </p>
                )}
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
                {errors.postalCode && (
                  <p className="text-xs text-destructive">
                    {errors.postalCode.message}
                  </p>
                )}
              </div>
            </FormGrid>
          </div>
        </FormGrid>
      </FormSection>

      {/* ── Primary contact ───────────────────────────── */}
      <FormSection title="Primair contactpersoon">
        <FormGrid columns="two">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="object-contact-name">Naam</Label>
            <Input
              id="object-contact-name"
              {...register("contactName")}
              placeholder="Jan Jansen"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="object-contact-function">Functie</Label>
            <Input
              id="object-contact-function"
              {...register("contactFunction")}
              placeholder="Facilitair manager"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="object-contact-phone">Telefoon</Label>
            <Input
              id="object-contact-phone"
              {...register("contactPhone")}
              placeholder="+31 6 00 00 00 00"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="object-contact-email">E-mail</Label>
            <Input
              id="object-contact-email"
              {...register("contactEmail")}
              type="email"
              placeholder="jan@bedrijf.nl"
            />
          </div>
        </FormGrid>
      </FormSection>

      {/* ── Instructions ──────────────────────────────── */}
      <FormSection title="Instructies en bijzonderheden">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="object-fixed-instructions">Vaste instructies</Label>
            <Textarea
              id="object-fixed-instructions"
              {...register("fixedInstructions")}
              placeholder="Vaste werkinstructies die altijd van toepassing zijn..."
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="object-special-notes">Bijzonderheden</Label>
            <Textarea
              id="object-special-notes"
              {...register("specialNotes")}
              placeholder="Bijzondere omstandigheden, aandachtspunten, gevaren..."
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="object-description">Omschrijving</Label>
            <Textarea
              id="object-description"
              {...register("description")}
              placeholder="Optionele omschrijving van dit object..."
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
      </FormSection>

      {/* ── Qualifications ────────────────────────────── */}
      <FormSection
        title="Vereiste kwalificaties"
        description="Deze eisen worden gebruikt bij personeels- en planningscontroles."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="object-required-roles">Vereiste functies</Label>
            <TagInput
              id="object-required-roles"
              value={requiredRoles}
              onChange={(tags) =>
                setValue("requiredRoles", tags, { shouldDirty: true })
              }
              placeholder="Typ functie en druk Enter..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="object-required-certificates">
              Vereiste certificaten
            </Label>
            <TagInput
              id="object-required-certificates"
              value={requiredCertificates}
              onChange={(tags) =>
                setValue("requiredCertificates", tags, {
                  shouldDirty: true,
                })
              }
              placeholder="Bijv. VCA, BHV..."
            />
          </div>
        </div>
      </FormSection>

      {/* ── Actions ───────────────────────────────────── */}
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
          {mode === "create" ? "Object aanmaken" : "Wijzigingen opslaan"}
        </Button>
      </FormActions>
      {guard}
    </form>
  );
}
