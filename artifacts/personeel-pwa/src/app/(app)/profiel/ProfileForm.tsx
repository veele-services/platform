"use client";

import { useActionState, useEffect, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Home, MapPin, Phone, User } from "lucide-react";
import {
  updateMyProfile,
  type PersonnelProfile,
} from "@/actions/personnel";
import {
  PersonnelSettingsFeedback,
  PersonnelSettingsSaveBar,
} from "@/components/SettingsShell";

export function ProfileForm({ profile }: { profile: PersonnelProfile }) {
  const [state, formAction, isPending] = useActionState(
    updateMyProfile,
    undefined,
  );
  const [addressStreet, setAddressStreet] = useState(profile.addressStreet ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(profile.addressPostalCode ?? "");
  const [addressCity, setAddressCity] = useState(profile.addressCity ?? "");
  const [addressCountry, setAddressCountry] = useState(profile.addressCountry);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    const query = [addressStreet, addressPostalCode, addressCity]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");

    if (query.length < 4) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setAddressLoading(true);
      try {
        const response = await fetch(
          `/personeel/api/address-suggestions?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
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
  }, [addressStreet, addressPostalCode, addressCity]);

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
          {addressLoading ? (
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-black text-[#009E9A] shadow-sm">
              Zoeken...
            </span>
          ) : null}
        </div>
        <div className="space-y-3">
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
        {addressSuggestions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[#D8E8F3] bg-white">
            <p className="border-b border-[#E2E8F0] px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-400">
              Adres aanvullen
            </p>
            <div className="max-h-52 overflow-y-auto p-1">
              {addressSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left active:bg-[#E8FBFA]"
                  onClick={() => {
                    setAddressStreet(suggestion.street ?? "");
                    setAddressPostalCode(suggestion.postalCode ?? "");
                    setAddressCity(suggestion.city ?? "");
                    setAddressCountry(suggestion.country);
                    setAddressSuggestions([]);
                  }}
                >
                  <span className="block text-sm font-black text-[#081D3A]">
                    {suggestion.label}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    PDOK - {Math.round(suggestion.confidence)}% match
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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

type AddressSuggestion = {
  id: string;
  label: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  confidence: number;
};
