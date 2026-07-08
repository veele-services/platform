"use client";

import { useActionState } from "react";
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
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#081D3A]">
          <Home size={18} strokeWidth={2.4} className="text-[#009E9A]" />
          NAW gegevens
        </div>
        <div className="space-y-3">
          <TextField
            label="Straat en huisnummer"
            name="addressStreet"
            defaultValue={profile.addressStreet ?? ""}
            autoComplete="street-address"
          />
          <div className="grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
            <TextField
              label="Postcode"
              name="addressPostalCode"
              defaultValue={profile.addressPostalCode ?? ""}
              autoComplete="postal-code"
            />
            <TextField
              label="Plaats"
              name="addressCity"
              defaultValue={profile.addressCity ?? ""}
              autoComplete="address-level2"
              icon={<MapPin size={18} strokeWidth={2.4} />}
            />
          </div>
          <TextField
            label="Land"
            name="addressCountry"
            defaultValue={profile.addressCountry}
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
  autoComplete,
  icon,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue: string;
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
          defaultValue={defaultValue}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="min-w-0 flex-1 bg-transparent text-base font-bold text-[#081D3A] outline-none placeholder:text-slate-300"
        />
      </span>
    </label>
  );
}
