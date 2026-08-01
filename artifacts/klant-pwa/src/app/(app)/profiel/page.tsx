export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Building2, Globe2, Hash, Mail, MapPin, Phone, UserCircle } from "lucide-react";
import { getMyCustomerProfile } from "@/actions/customer";
import { ContactInfoForm } from "@/components/ContactInfoForm";
import { CustomerSettingsShell } from "@/components/SettingsShell";

function valueOrEmpty(value: string | null): string {
  return value?.trim() || "Niet ingesteld";
}

export default async function ProfielPage() {
  const profile = await getMyCustomerProfile();
  if (!profile) {
    redirect("/login?error=" + encodeURIComponent("Geen klantprofiel gevonden."));
  }

  const rows = [
    { label: "Bedrijfsnaam", value: profile.name, Icon: Building2 },
    { label: "Klantcode", value: profile.code, Icon: Hash },
    { label: "Adres", value: [profile.address, profile.city].filter(Boolean).join(", ") || "Niet ingesteld", Icon: MapPin },
    { label: "E-mail", value: valueOrEmpty(profile.contactEmail), Icon: Mail },
    { label: "Telefoon", value: valueOrEmpty(profile.contactPhone), Icon: Phone },
    { label: "Website", value: valueOrEmpty(profile.website), Icon: Globe2 },
  ];

  return (
    <CustomerSettingsShell
      active="profile"
      title="Profiel"
      subtitle="Uw bedrijfs- en contactgegevens binnen het klantportaal."
      aside={
        <ContactInfoForm
          contactName={profile.contactName}
          contactPhone={profile.contactPhone}
          mobile={profile.mobile}
        />
      }
    >
        <div className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
              <UserCircle size={25} />
            </span>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: "var(--color-primary)" }}>
                {profile.name}
              </h2>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                {profile.customerTypeName ?? "Klant"} {profile.legalEntity ? `- ${profile.legalEntity}` : ""}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 md:grid-cols-2">
            {rows.map(({ label, value, Icon }) => (
              <div key={label} className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
                  <Icon size={14} />
                  {label}
                </div>
                <dd className="mt-2 text-sm font-bold" style={{ color: "var(--color-primary)" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
    </CustomerSettingsShell>
  );
}
