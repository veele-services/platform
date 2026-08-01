export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import {
  Award,
  BriefcaseBusiness,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  PersonnelSettingsCard,
  PersonnelSettingsFeedback,
  PersonnelSettingsShell,
} from "@/components/SettingsShell";
import { AvatarUploadForm } from "./AvatarUploadForm";
import { ProfileForm } from "./ProfileForm";
import { formatPersonnelRoleLabel } from "@/lib/personnel-labels";
import { isTenantModuleEnabled } from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

export default async function ProfielPage() {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const [profile, notificationsEnabled] = await Promise.all([
    getMyPersonnel(),
    tenantId
      ? isTenantModuleEnabled(tenantId, "notifications")
      : Promise.resolve(false),
  ]);

  if (!profile) {
    return (
      <PersonnelSettingsShell
        active="profile"
        title="Mijn profiel"
        subtitle="Beheer je gegevens en profielfoto."
        notificationsEnabled={notificationsEnabled}
      >
        <PersonnelSettingsFeedback type="error">
          Geen profielgegevens gevonden.
        </PersonnelSettingsFeedback>
      </PersonnelSettingsShell>
    );
  }

  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`;
  const roleLabel = formatPersonnelRoleLabel(profile.roleName);
  const workFields = [
    { label: "E-mail", value: profile.email, Icon: Mail },
    { label: "Rol", value: roleLabel, Icon: ShieldCheck },
    { label: "Sector", value: profile.sectorName, Icon: BriefcaseBusiness },
    { label: "Regio", value: profile.region, Icon: MapPin },
  ].filter((field) => field.value);
  const hasQualifications =
    profile.certificates.length > 0 ||
    profile.diplomas.length > 0 ||
    profile.knowledge.length > 0;

  return (
    <PersonnelSettingsShell
      active="profile"
      title="Mijn profiel"
      subtitle="Beheer je gegevens en profielfoto."
      notificationsEnabled={notificationsEnabled}
    >
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4 overflow-hidden">
        <PersonnelSettingsCard>
          <AvatarUploadForm
            avatarUrl={profile.avatarUrl}
            initials={initials}
            fullName={`${profile.firstName} ${profile.lastName}`}
            subtitle={`${roleLabel}${profile.sectorName ? ` - ${profile.sectorName}` : ""}`}
          />
        </PersonnelSettingsCard>

        <ProfileForm profile={profile} />

        <PersonnelSettingsCard>
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">Werkgegevens</h2>
          <div className="mt-3 space-y-3">
            {workFields.map(({ label, value, Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                  <Icon size={19} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </span>
                  <span className="block break-words text-sm font-bold text-[var(--color-primary)]">
                    {value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </PersonnelSettingsCard>

        {hasQualifications ? (
          <PersonnelSettingsCard>
            <div className="mb-3 flex items-center gap-2">
              <Award size={18} className="text-[#009E9A]" />
              <h2 className="text-lg font-semibold text-[var(--color-primary)]">
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
          </PersonnelSettingsCard>
        ) : null}
      </div>
    </PersonnelSettingsShell>
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
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
