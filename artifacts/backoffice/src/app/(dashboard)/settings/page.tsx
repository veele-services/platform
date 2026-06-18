import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Shield, Users, ClipboardList, ChevronRight, History, Tag } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  if (!(await hasPermission("settings", "read"))) {
    return <ForbiddenPage resource="settings" action="read" />;
  }

  const [canWriteSettings, canReadRoles, canReadUsers, canReadSettings] = await Promise.all([
    hasPermission("settings", "write"),
    hasPermission("roles",    "read"),
    hasPermission("users",    "read"),
    hasPermission("settings", "read"),
  ]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Instellingen
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Platformconfiguratie, rollen, rechten en gebruikersbeheer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canWriteSettings && (
          <SettingsCard
            href="/instellingen/organisatie"
            icon={<Building2 className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Organisatie"
            description="Naam, adres, KVK- en BTW-nummer, logo, standaard betalingstermijn en e-mailafzender."
          />
        )}
        {canReadRoles && (
          <SettingsCard
            href="/instellingen/rollen"
            icon={<Shield className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Rollen & rechten"
            description="Beheer rollen en stel per rol de permissie-matrix in voor alle modules en acties."
          />
        )}
        {canReadUsers && (
          <SettingsCard
            href="/instellingen/gebruikers"
            icon={<Users className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Gebruikers"
            description="Bekijk alle gebruikers, nodig nieuwe gebruikers uit en deactiveer accounts."
          />
        )}
        <SettingsCard
          href="/settings/task-codes"
          icon={<ClipboardList className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
          title="Taakcodes"
          description="Centraal beheerde catalogus van taaktypes voor opdrachten, planning en facturering."
        />
        {canReadSettings && (
          <SettingsCard
            href="/instellingen/klanttypes"
            icon={<Tag className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Klanttypes"
            description="Beheer de klanttypes die beschikbaar zijn in klantprofielen (Zakelijk, Particulier, etc.)."
          />
        )}
        {canReadSettings && (
          <SettingsCard
            href="/instellingen/activiteitslog"
            icon={<History className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Activiteitslog"
            description="Bekijk de laatste 200 wijzigingen in instellingen, rollen en gebruikers, inclusief wie wat wanneer heeft gewijzigd."
          />
        )}
      </div>
    </div>
  );
}

function SettingsCard({
  href, icon, title, description,
}: {
  href: string; icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <Link
      href={href}
      className="veele-card flex items-start gap-4 transition-shadow hover:shadow-md group"
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg w-10 h-10"
        style={{ backgroundColor: "#E0FAFB" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold group-hover:underline" style={{ color: "#081D3A" }}>
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#64748B" }}>
          {description}
        </p>
      </div>
      <ChevronRight className="flex-shrink-0 h-4 w-4 mt-0.5 transition-transform group-hover:translate-x-0.5" style={{ color: "#94A3B8" }} />
    </Link>
  );
}
