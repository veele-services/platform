export const dynamic = "force-dynamic";

import { KeyRound, ShieldCheck } from "lucide-react";
import {
  PersonnelSettingsCard,
  PersonnelSettingsShell,
} from "@/components/SettingsShell";
import { MfaSettings } from "./MfaSettings";
import { SecurityPasswordForm } from "./SecurityPasswordForm";
import { isTenantModuleEnabled } from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

const isPersonnelMfaEnabled = process.env.NEXT_PUBLIC_ENABLE_PERSONNEL_MFA === "true";

export default async function BeveiligingPage() {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const notificationsEnabled = tenantId
    ? await isTenantModuleEnabled(tenantId, "notifications")
    : false;
  return (
    <PersonnelSettingsShell
      active="security"
      title="Beveiliging"
      subtitle="Beheer je wachtwoord en toegangsbeveiliging."
      notificationsEnabled={notificationsEnabled}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <PersonnelSettingsCard>
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
              <KeyRound size={21} strokeWidth={2.4} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-primary)]">
                Wachtwoord wijzigen
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Kies een sterk wachtwoord dat u nergens anders gebruikt.
              </p>
            </div>
          </div>
          <SecurityPasswordForm />
        </PersonnelSettingsCard>

        {isPersonnelMfaEnabled ? (
          <PersonnelSettingsCard>
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <ShieldCheck size={21} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-primary)]">
                  Tweestapsverificatie
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Koppel een authenticator-app voor extra bescherming bij inloggen.
                </p>
              </div>
            </div>
            <MfaSettings />
          </PersonnelSettingsCard>
        ) : null}
      </div>
    </PersonnelSettingsShell>
  );
}
