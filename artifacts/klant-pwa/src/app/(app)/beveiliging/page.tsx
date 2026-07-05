export const dynamic = "force-dynamic";

import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { CustomerSettingsShell } from "@/components/SettingsShell";

export default function BeveiligingPage() {
  return (
    <CustomerSettingsShell
      active="security"
      title="Beveiliging"
      subtitle="Beheer toegang en beveiliging van uw klantaccount."
    >
      <section className="max-w-3xl">
        <PasswordChangeForm />
      </section>
    </CustomerSettingsShell>
  );
}
