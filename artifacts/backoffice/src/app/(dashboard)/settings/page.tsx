import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Building2, Shield, Users, ClipboardList, ChevronRight, History, Tag, Layers3, Mail, SlidersHorizontal, Sparkles } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";

export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  if (!(await hasPermission("settings", "read"))) {
    return <ForbiddenPage resource="settings" action="read" />;
  }

  const [canWriteSettings, canReadRoles, canReadUsers, canReadSettings, canReadPlanning] = await Promise.all([
    hasPermission("settings", "write"),
    hasPermission("roles",    "read"),
    hasPermission("users",    "read"),
    hasPermission("settings", "read"),
    hasPermission("planning", "read"),
  ]);

  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Instellingen"
        description="Beheer tenantinstellingen, gebruikers, rollen, notificaties en operationele configuratie vanuit een rustig startpunt."
      />
      <SettingsTabs />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canWriteSettings && (
          <SettingsCard
            href="/instellingen/organisatie"
            icon={<Building2 className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Organisatie"
            description="Naam, adres, KVK- en BTW-nummer, logo, standaard betalingstermijn en e-mailafzender."
          />
        )}
        {canWriteSettings && (
          <SettingsCard
            href="/instellingen/mail"
            icon={<Mail className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Mail"
            description="SMTP-host, poort, beveiliging, afzender, reply-to en testmail voor platform e-mail."
          />
        )}
        {canWriteSettings && (
          <SettingsCard
            href="/instellingen/notificaties"
            icon={<Bell className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Notificaties"
            description="Beheer automatische triggers, e-mailtemplates, push/inbox-kanalen, shortcodes en handmatige meldingen."
          />
        )}
        {canWriteSettings && (
          <SettingsCard
            href="/instellingen/productervaring"
            icon={<Sparkles className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Productervaring"
            description="Activeer tenant-eigen helpartikelen en featurewensen vanuit personeel of klanten."
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
            href="/instellingen/sectoren"
            icon={<Layers3 className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Sectoren"
            description="Beheer Facilitair, Schoonmaak, Beveiliging en andere operationele sectoren."
          />
        )}
        {canReadPlanning && (
          <SettingsCard
            href="/instellingen/slim-plannen"
            icon={<SlidersHorizontal className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
            title="Slim plannen"
            description="Beheer sectorwegingen, topmatch-drempels, rondegroottes en uitnodigingslimieten voor matching."
          />
        )}
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
    </TenantPageShell>
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
