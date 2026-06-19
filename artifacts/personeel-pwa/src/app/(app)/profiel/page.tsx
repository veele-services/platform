export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import {
  Award,
  BriefcaseBusiness,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { ProfileForm } from "./ProfileForm";

export default async function ProfielPage() {
  const profile = await getMyPersonnel();

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-4.2rem)] bg-[#F4F7FB] px-4 py-10">
        <p className="text-center text-sm font-semibold text-slate-500">
          Geen profielgegevens gevonden.
        </p>
      </div>
    );
  }

  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`;
  const workFields = [
    { label: "E-mail", value: profile.email, Icon: Mail },
    { label: "Rol", value: profile.roleName, Icon: ShieldCheck },
    { label: "Sector", value: profile.sectorName, Icon: BriefcaseBusiness },
    { label: "Regio", value: profile.region, Icon: MapPin },
  ].filter((field) => field.value);
  const hasQualifications =
    profile.certificates.length > 0 ||
    profile.diplomas.length > 0 ||
    profile.knowledge.length > 0;

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Mijn profiel
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Beheer je gegevens en profielfoto
        </p>
      </section>

      <section className="rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
            <AvatarUploadForm
              avatarUrl={profile.avatarUrl}
              initials={initials}
              fullName={`${profile.firstName} ${profile.lastName}`}
              subtitle={`${profile.roleName ?? "Medewerker"}${profile.sectorName ? ` · ${profile.sectorName}` : ""}`}
            />
          </section>

          <ProfileForm profile={profile} />

          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
            <h2 className="text-lg font-black text-[#081D3A]">Werkgegevens</h2>
            <div className="mt-3 space-y-3">
              {workFields.map(({ label, value, Icon }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                    <Icon size={19} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
                      {label}
                    </span>
                    <span className="block truncate text-sm font-bold text-[#081D3A]">
                      {value}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {hasQualifications ? (
            <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Award size={18} className="text-[#009E9A]" />
                <h2 className="text-lg font-black text-[#081D3A]">
                  Kwalificaties
                </h2>
              </div>
              <BadgeGroup
                label="Certificaten"
                items={profile.certificates}
                className="bg-[#E8FBFA] text-[#087C79]"
              />
              <BadgeGroup
                label="Diploma's"
                items={profile.diplomas}
                className="bg-[#EEF4FF] text-[#0F2E5C]"
              />
              <BadgeGroup
                label="Kennis"
                items={profile.knowledge}
                className="bg-slate-100 text-slate-600"
              />
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function BadgeGroup({
  label,
  items,
  className,
}: {
  label: string;
  items: string[];
  className: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
