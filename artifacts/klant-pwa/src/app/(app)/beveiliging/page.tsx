export const dynamic = "force-dynamic";

import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { PageShell } from "@/components/PageShell";

export default function BeveiligingPage() {
  return (
    <PageShell title="Beveiliging" subtitle="Beheer toegang en beveiliging van uw klantaccount.">
      <section className="max-w-2xl">
        <PasswordChangeForm />
      </section>
    </PageShell>
  );
}
