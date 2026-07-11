"use client";

import { useActionState, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Home, MapPin, Phone, Route, User } from "lucide-react";
import {
  updateMyProfile,
  type PersonnelProfile,
} from "@/actions/personnel";
import {
  PersonnelSettingsFeedback,
  PersonnelSettingsSaveBar,
} from "@/components/SettingsShell";
import { AddressAutocomplete, type AddressAutocompleteSelection } from "@/components/google-maps/AddressAutocomplete";

const VEHICLE_TYPE_OPTIONS = [
  { value: "DRIVE", label: "Auto" },
  { value: "BICYCLE", label: "Fiets" },
  { value: "WALK", label: "Lopen" },
  { value: "TRANSIT", label: "Openbaar vervoer" },
] as const;

export function ProfileForm({ profile }: { profile: PersonnelProfile }) {
  const [state, formAction, isPending] = useActionState(
    updateMyProfile,
    undefined,
  );
  const [addressStreet, setAddressStreet] = useState(profile.addressStreet ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(profile.addressPostalCode ?? "");
  const [addressCity, setAddressCity] = useState(profile.addressCity ?? "");
  const [addressCountry, setAddressCountry] = useState(profile.addressCountry);
  const [vehicleType, setVehicleType] = useState<string>(profile.vehicleType ?? "DRIVE");
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<SelectedGooglePlace | null>(null);

  function applyAddressSelection({ suggestion, place }: AddressAutocompleteSelection) {
    setAddressStreet(place.addressLine1 ?? suggestion.mainText ?? suggestion.label);
    setAddressPostalCode(place.postalCode ?? "");
    setAddressCity(place.city ?? "");
    setAddressCountry(place.countryCode === "NL" ? "Nederland" : place.countryCode);
    setSelectedGooglePlace(place);
  }

  const googlePlaceStillMatches = selectedGooglePlace && (
    (selectedGooglePlace.addressLine1 ?? "") === addressStreet &&
    (selectedGooglePlace.postalCode ?? "") === addressPostalCode &&
    (selectedGooglePlace.city ?? "") === addressCity
  );

  return (
    <form
      action={formAction}
      className="w-full min-w-0 overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-black text-[#081D3A]">
            Persoonsgegevens
          </h2>
          <p className="mt-1 break-words text-sm font-medium text-slate-500">
            Naam, adres en contactgegevens.
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
          <User size={21} strokeWidth={2.4} />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Voornaam"
          name="firstName"
          defaultValue={profile.firstName}
          autoComplete="given-name"
        />
        <TextField
          label="Achternaam"
          name="lastName"
          defaultValue={profile.lastName}
          autoComplete="family-name"
        />
      </div>
      {googlePlaceStillMatches ? (
        <>
          <input type="hidden" name="googlePlaceId" value={selectedGooglePlace.googlePlaceId} />
          <input type="hidden" name="formattedAddress" value={selectedGooglePlace.formattedAddress ?? ""} />
          <input type="hidden" name="addressLine1" value={selectedGooglePlace.addressLine1 ?? ""} />
          <input type="hidden" name="addressLine2" value={selectedGooglePlace.addressLine2 ?? ""} />
          <input type="hidden" name="stateOrRegion" value={selectedGooglePlace.stateOrRegion ?? ""} />
          <input type="hidden" name="countryCode" value={selectedGooglePlace.countryCode} />
          <input type="hidden" name="latitude" value={selectedGooglePlace.latitude ?? ""} />
          <input type="hidden" name="longitude" value={selectedGooglePlace.longitude ?? ""} />
        </>
      ) : null}

      <div className="mt-3">
        <TextField
          label="Telefoonnummer"
          name="phone"
          defaultValue={profile.phone ?? ""}
          autoComplete="tel"
          icon={<Phone size={18} strokeWidth={2.4} />}
          inputMode="tel"
        />
      </div>

      <label className="mt-3 block min-w-0 rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
        <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
          Standaard vervoersmiddel
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[#009E9A]">
            <Route size={18} strokeWidth={2.4} />
          </span>
          <select
            name="vehicleType"
            value={vehicleType}
            onChange={(event) => setVehicleType(event.currentTarget.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-bold text-[#081D3A] outline-none"
          >
            {VEHICLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        <span className="mt-1 block text-xs font-semibold text-slate-500">
          Gebruikt als standaard bij routeberekening; planning kan per route tijdelijk afwijken.
        </span>
      </label>

      <div className="mt-4 rounded-[20px] border border-[#D8E8F3] bg-[#F8FBFE] p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-[#081D3A]">
              <Home size={18} strokeWidth={2.4} className="text-[#009E9A]" />
              NAW gegevens
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Dit adres wordt gebruikt als vertrekpunt voor je eerste werkbon.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <AddressAutocomplete onSelect={applyAddressSelection} />
          <TextField
            label="Straat en huisnummer"
            name="addressStreet"
            value={addressStreet}
            onChange={setAddressStreet}
            autoComplete="street-address"
          />
          <div className="grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
            <TextField
              label="Postcode"
              name="addressPostalCode"
              value={addressPostalCode}
              onChange={setAddressPostalCode}
              autoComplete="postal-code"
            />
            <TextField
              label="Plaats"
              name="addressCity"
              value={addressCity}
              onChange={setAddressCity}
              autoComplete="address-level2"
              icon={<MapPin size={18} strokeWidth={2.4} />}
            />
          </div>
          <TextField
            label="Land"
            name="addressCountry"
            value={addressCountry}
            onChange={setAddressCountry}
            autoComplete="country-name"
          />
        </div>
      </div>

      {state?.error ? (
        <div className="mt-3">
          <PersonnelSettingsFeedback type="error">{state.error}</PersonnelSettingsFeedback>
        </div>
      ) : null}
      {state?.success ? (
        <div className="mt-3">
          <PersonnelSettingsFeedback type="success">
            Profiel opgeslagen
          </PersonnelSettingsFeedback>
        </div>
      ) : null}

      <PersonnelSettingsSaveBar pending={isPending} label="Profiel opslaan" />
    </form>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  autoComplete,
  icon,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  icon?: ReactNode;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block min-w-0 rounded-2xl border border-[#D8E8F3] bg-white px-3 py-2.5">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0 text-[#009E9A]">{icon}</span> : null}
        <input
          name={name}
          defaultValue={value === undefined ? defaultValue : undefined}
          value={value}
          onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-[#081D3A] outline-none placeholder:text-slate-300"
        />
      </span>
    </label>
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
