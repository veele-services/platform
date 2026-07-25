import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Mail, Shield, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles } from "@/lib/auth/permissions";
import { getCurrentTenantId } from "@/lib/auth/tenant";
import { getBackofficeProfileName } from "@/lib/auth/backoffice-profile";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { BackofficeNameForm } from "@/components/profile/BackofficeNameForm";

export const metadata: Metadata = { title: "Profiel" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tenantId = await getCurrentTenantId();
  const roles = user && tenantId ? await getUserRoles(user.id, tenantId) : [];
  const email = user?.email ?? "";
  const name = user ? getBackofficeProfileName(user) : null;
  const initial = (name?.[0] ?? email[0] ?? "U").toUpperCase();

  return (
    <TenantPageShell size="narrow">
      <TenantPageHeader
        title="Profiel"
        description="Beheer uw naam, accountgegevens en toegang voor deze backoffice."
      />
      <section className="rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: "#133D6B" }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--color-foreground)" }}>
              {name || "Gebruiker"}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
              {email || "Accountgegevens voor de backoffice."}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ProfileInfo icon={<Mail className="h-4 w-4" />} label="E-mailadres" value={email || "-"} />
          <ProfileInfo icon={<Shield className="h-4 w-4" />} label="Rol" value={roles[0] ?? "User"} />
        </div>

        <div className="mt-6 border-t pt-6" style={{ borderColor: "#E2E8F0" }}>
          <h3 className="font-heading text-base font-semibold" style={{ color: "var(--color-foreground)" }}>
            Persoonlijke gegevens
          </h3>
          <p className="mb-4 mt-1 text-sm" style={{ color: "#64748B" }}>
            U kunt uw eigen naam op ieder moment wijzigen.
          </p>
          <BackofficeNameForm initialName={name ?? ""} />
        </div>

        <div className="mt-6 border-t pt-4" style={{ borderColor: "#E2E8F0" }}>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
            style={{ borderColor: "#E2E8F0", color: "var(--color-foreground)" }}
          >
            <Settings className="h-4 w-4" />
            Naar instellingen
          </Link>
        </div>
      </section>
    </TenantPageShell>
  );
}

function ProfileInfo({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border p-4" style={{ borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: "#64748B" }}>
        {icon}
        {label}
      </div>
      <p className="truncate text-sm font-semibold" style={{ color: "var(--color-foreground)" }}>
        {value}
      </p>
    </div>
  );
}
