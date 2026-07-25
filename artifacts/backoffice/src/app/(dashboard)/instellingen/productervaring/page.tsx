import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, Lightbulb, Smartphone } from "lucide-react";
import {
  getTenantProductExperienceSettings,
  saveTenantProductExperienceSettings,
} from "@/app/actions/knowledgebase";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Productervaring" };

async function saveAction(formData: FormData): Promise<void> {
  "use server";
  await saveTenantProductExperienceSettings(formData);
}

export default async function ProductExperienceSettingsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("settings", "read"),
    hasPermission("settings", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="settings" action="read" />;
  const settings = await getTenantProductExperienceSettings();

  return (
    <SettingsSectionShell
      title="Productervaring"
      description="Bepaal welke P2-productfuncties voor deze organisatie actief zijn."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" className="-ml-3 gap-2">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            Terug naar instellingen
          </Link>
        </Button>
      </div>

      <form action={saveAction} className="grid gap-4">
        <SettingToggle
          icon={<BookOpen className="h-5 w-5 text-cyan-700" />}
          name="kbTenantAuthoringEnabled"
          title="Tenant-eigen helpartikelen"
          description="Tenant admins met kb:manage mogen eigen interne artikelen beheren. Artikelen blijven tenant-scoped en lekken niet naar andere tenants."
          defaultChecked={settings.kbTenantAuthoringEnabled}
          disabled={!canWrite}
        />
        <SettingToggle
          icon={<Smartphone className="h-5 w-5 text-cyan-700" />}
          name="roadmapPersonnelRequestsEnabled"
          title="Featurewensen vanuit personeelsapp"
          description="Personeelsgebruikers mogen featurewensen indienen vanuit de personeels-PWA wanneer de roadmapmodule actief is."
          defaultChecked={settings.roadmapPersonnelRequestsEnabled}
          disabled={!canWrite}
        />
        <SettingToggle
          icon={<Lightbulb className="h-5 w-5 text-cyan-700" />}
          name="roadmapCustomerRequestsEnabled"
          title="Featurewensen vanuit klantportaal"
          description="Klantgebruikers mogen featurewensen indienen vanuit het klantportaal wanneer de roadmapmodule actief is."
          defaultChecked={settings.roadmapCustomerRequestsEnabled}
          disabled={!canWrite}
        />

        {canWrite && (
          <div className="sticky bottom-4 flex justify-end rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <Button type="submit">Productervaring opslaan</Button>
          </div>
        )}
      </form>
    </SettingsSectionShell>
  );
}

function SettingToggle({
  icon,
  name,
  title,
  description,
  defaultChecked,
  disabled,
}: {
  icon: React.ReactNode;
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="rounded-md bg-cyan-50 p-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-950">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">
          {description}
        </span>
      </span>
      <CheckboxAdapter
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-cyan-700"
      />
    </label>
  );
}
