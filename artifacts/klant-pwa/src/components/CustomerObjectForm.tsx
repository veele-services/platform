"use client";

import { SelectAdapter } from "@workspace/shared-ui";
import { RadioGroup, RadioGroupItem } from "@workspace/shared-ui";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  createCustomerObject,
  updateCustomerObject,
  type CustomerObjectDetail,
  type CustomerSectorOption,
  type ObjectMutationState,
} from "@/actions/objects";
import {
  AddressAutocomplete,
  type AddressAutocompleteSelection,
} from "@/components/google-maps/AddressAutocomplete";

const INITIAL_STATE: ObjectMutationState = { success: false, error: "" };

type Props = {
  mode: "create" | "edit";
  sectors: CustomerSectorOption[];
  object?: CustomerObjectDetail;
};

type FieldProps = {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  defaultValue?: string | null;
  error?: string;
  autoComplete?: string;
};

function fieldClass(error?: string) {
  return [
    "w-full rounded-2xl border bg-white px-4 py-3 text-sm font-semibold outline-none transition",
    "focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/10",
    error ? "border-red-300" : "border-slate-200",
  ].join(" ");
}

function Field({
  label,
  name,
  required,
  type = "text",
  maxLength,
  placeholder,
  defaultValue,
  error,
  autoComplete,
}: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span
        className="text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: "var(--color-secondary)" }}
      >
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        autoComplete={autoComplete}
        className={fieldClass(error)}
        style={{ color: "var(--color-primary)" }}
      />
      {error ? (
        <span className="block text-xs font-bold text-red-600">{error}</span>
      ) : null}
    </label>
  );
}

function TextArea({
  label,
  name,
  rows = 4,
  maxLength,
  placeholder,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span
        className="text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: "var(--color-secondary)" }}
      >
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={`${fieldClass(error)} resize-none leading-6`}
        style={{ color: "var(--color-primary)" }}
      />
      {error ? (
        <span className="block text-xs font-bold text-red-600">{error}</span>
      ) : null}
    </label>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[24px] border bg-white p-4 shadow-sm md:p-5"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mb-5 flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA]"
          style={{ color: "var(--color-accent-accessible)" }}
        >
          {icon}
        </span>
        <span>
          <h2
            className="text-lg font-semibold leading-tight"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </h2>
          <p
            className="mt-1 text-sm font-semibold leading-5"
            style={{ color: "var(--color-secondary)" }}
          >
            {description}
          </p>
        </span>
      </div>
      {children}
    </section>
  );
}

export function CustomerObjectForm({ mode, sectors, object }: Props) {
  const router = useRouter();
  const action: (
    state: ObjectMutationState,
    formData: FormData,
  ) => Promise<ObjectMutationState> =
    mode === "edit" && object
      ? updateCustomerObject.bind(null, object.id)
      : createCustomerObject;

  const [state, formAction, pending] = useActionState<
    ObjectMutationState,
    FormData
  >(action, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedGooglePlace, setSelectedGooglePlace] =
    useState<SelectedGooglePlace | null>(null);

  useEffect(() => {
    if (!state.success) return;

    if (mode === "create") {
      router.push(`/objecten/${state.id}`);
      return;
    }

    router.refresh();
  }, [mode, router, state]);

  const errors = state.success ? undefined : state.fieldErrors;

  function applyAddressSelection({
    suggestion,
    place,
  }: AddressAutocompleteSelection) {
    setSelectedGooglePlace(place);
    const address = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="address"]',
    );
    const postalCode = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="postalCode"]',
    );
    const city =
      formRef.current?.querySelector<HTMLInputElement>('input[name="city"]');
    if (address)
      address.value =
        place.addressLine1 ?? suggestion.mainText ?? suggestion.label;
    if (postalCode) postalCode.value = place.postalCode ?? "";
    if (city) city.value = place.city ?? "";
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {selectedGooglePlace ? (
        <>
          <input
            type="hidden"
            name="googlePlaceId"
            value={selectedGooglePlace.googlePlaceId}
          />
          <input
            type="hidden"
            name="googleFormattedAddress"
            value={selectedGooglePlace.formattedAddress ?? ""}
          />
          <input
            type="hidden"
            name="googleAddressLine1"
            value={selectedGooglePlace.addressLine1 ?? ""}
          />
          <input
            type="hidden"
            name="googleAddressLine2"
            value={selectedGooglePlace.addressLine2 ?? ""}
          />
          <input
            type="hidden"
            name="googlePostalCode"
            value={selectedGooglePlace.postalCode ?? ""}
          />
          <input
            type="hidden"
            name="googleCity"
            value={selectedGooglePlace.city ?? ""}
          />
          <input
            type="hidden"
            name="googleStateOrRegion"
            value={selectedGooglePlace.stateOrRegion ?? ""}
          />
          <input
            type="hidden"
            name="googleCountryCode"
            value={selectedGooglePlace.countryCode}
          />
          <input
            type="hidden"
            name="googleLatitude"
            value={selectedGooglePlace.latitude ?? ""}
          />
          <input
            type="hidden"
            name="googleLongitude"
            value={selectedGooglePlace.longitude ?? ""}
          />
        </>
      ) : null}
      {mode === "create" ? (
        <Section
          icon={<ShieldCheck size={20} />}
          title="Review en activering"
          description="Kies hoe dit object na opslaan behandeld moet worden. Zo wordt een nieuwe locatie niet ongemerkt operationeel actief."
        >
          <RadioGroup
            name="reviewMode"
            defaultValue="review"
            className="grid gap-3 md:grid-cols-3"
          >
            {[
              {
                value: "concept",
                title: "Concept bewaren",
                text: "Nog niet gebruiken voor aanvragen. U kunt de gegevens later aanvullen.",
              },
              {
                value: "review",
                title: "Ter review aanbieden",
                text: "Aanbevolen. Het object blijft inactief totdat de backoffice het controleert.",
              },
              {
                value: "approved",
                title: "Direct actief gebruiken",
                text: "Alle gegevens zijn compleet en het object mag direct gebruikt worden.",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-2xl border bg-white p-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                <RadioGroupItem value={option.value} className="mt-1" />
                <span className="min-w-0">
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {option.title}
                  </span>
                  <span
                    className="mt-1 block text-xs font-semibold leading-5"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {option.text}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Section>
      ) : null}

      <Section
        icon={<Building2 size={20} />}
        title="Objectgegevens"
        description="Naam, sector en type dienstverlening voor planning en rapportages."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Objectnaam"
            name="name"
            required
            maxLength={255}
            placeholder="Bijv. Hoofdkantoor, entree of magazijn"
            defaultValue={object?.name}
            error={errors?.name}
          />
          <label className="block space-y-1.5">
            <span
              className="text-xs font-semibold uppercase tracking-[0.04em]"
              style={{ color: "var(--color-secondary)" }}
            >
              Sector
            </span>
            <SelectAdapter
              name="sectorId"
              defaultValue={object?.sectorId ?? ""}
              className={fieldClass(errors?.sectorId)}
              style={{ color: "var(--color-primary)" }}
            >
              <option value="">Geen sector geselecteerd</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </SelectAdapter>
            {errors?.sectorId ? (
              <span className="block text-xs font-bold text-red-600">
                {errors.sectorId}
              </span>
            ) : null}
          </label>
          <Field
            label="Dienstverlening"
            name="serviceType"
            maxLength={100}
            placeholder="Bijv. periodieke schoonmaak, beveiliging, facilitair"
            defaultValue={object?.serviceType}
            error={errors?.serviceType}
          />
          <TextArea
            label="Omschrijving"
            name="description"
            rows={3}
            maxLength={3500}
            placeholder="Korte omschrijving van het object of de locatie."
            defaultValue={object?.description}
            error={errors?.description}
          />
        </div>
      </Section>

      <Section
        icon={<MapPin size={20} />}
        title="Adresgegevens"
        description="Volledig bezoekadres zodat planning, personeel en rapportage hetzelfde object gebruiken."
      >
        <div className="mb-4">
          <AddressAutocomplete onSelect={applyAddressSelection} />
        </div>
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_1fr]">
          <Field
            label="Adres"
            name="address"
            required
            maxLength={500}
            placeholder="Straat en huisnummer"
            defaultValue={object?.address}
            error={errors?.address}
            autoComplete="street-address"
          />
          <Field
            label="Postcode"
            name="postalCode"
            required
            maxLength={20}
            placeholder="2511 AA"
            defaultValue={object?.postalCode}
            error={errors?.postalCode}
            autoComplete="postal-code"
          />
          <Field
            label="Plaats"
            name="city"
            required
            maxLength={100}
            placeholder="Den Haag"
            defaultValue={object?.city}
            error={errors?.city}
            autoComplete="address-level2"
          />
        </div>
      </Section>

      <Section
        icon={<UserRound size={20} />}
        title="Contactpersoon op locatie"
        description="Deze gegevens zijn zichtbaar voor planning en uitvoerend personeel."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Naam contactpersoon"
            name="contactName"
            required
            maxLength={200}
            placeholder="Voor- en achternaam"
            defaultValue={object?.contactName}
            error={errors?.contactName}
            autoComplete="name"
          />
          <Field
            label="Functie"
            name="contactFunction"
            maxLength={100}
            placeholder="Bijv. facilitair manager"
            defaultValue={object?.contactFunction}
            error={errors?.contactFunction}
          />
          <Field
            label="Telefoonnummer"
            name="contactPhone"
            required
            type="tel"
            maxLength={50}
            placeholder="06-12345678 of 070-1234567"
            defaultValue={object?.contactPhone}
            error={errors?.contactPhone}
            autoComplete="tel"
          />
          <Field
            label="E-mailadres"
            name="contactEmail"
            type="email"
            maxLength={255}
            placeholder="contact@bedrijf.nl"
            defaultValue={object?.contactEmail}
            error={errors?.contactEmail}
            autoComplete="email"
          />
        </div>
      </Section>

      <Section
        icon={<ShieldCheck size={20} />}
        title="Vaste instructies"
        description="Instructies die bij iedere aanvraag of werkbon voor dit object moeten worden meegenomen."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            label="Vaste werkinstructies"
            name="fixedInstructions"
            rows={5}
            maxLength={3500}
            placeholder="Bijv. altijd melden bij receptie, ruimtes afsluiten, foto's verplicht."
            defaultValue={object?.fixedInstructions}
            error={errors?.fixedInstructions}
          />
          <TextArea
            label="Bijzonderheden"
            name="specialNotes"
            rows={5}
            maxLength={3500}
            placeholder="Risico's, gevoelige ruimtes, huisregels of klantafspraken."
            defaultValue={object?.specialNotes}
            error={errors?.specialNotes}
          />
        </div>
      </Section>

      {!state.success && state.error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      ) : null}

      {state.success && mode === "edit" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <Check size={18} className="mt-0.5 shrink-0" />
          Objectgegevens opgeslagen.
        </div>
      ) : null}

      <div
        className="sticky bottom-[calc(5.6rem+var(--safe-bottom))] z-10 rounded-[24px] border bg-white/95 p-3 shadow-lg backdrop-blur md:static md:flex md:items-center md:justify-end md:shadow-none"
        style={{ borderColor: "var(--color-border)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 md:w-auto"
          style={{ backgroundColor: "var(--color-accent-accessible)" }}
        >
          {pending ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Check size={17} />
          )}
          {pending
            ? "Opslaan..."
            : mode === "create"
              ? "Object aanmaken"
              : "Object opslaan"}
        </button>
      </div>
    </form>
  );
}

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
