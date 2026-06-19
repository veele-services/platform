export const dynamic = "force-dynamic";

import { Fingerprint, ShieldCheck } from "lucide-react";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { PageShell } from "@/components/PageShell";

export default function BeveiligingPage() {
  return (
    <PageShell title="Beveiliging" subtitle="Beheer toegang en beveiliging van uw klantaccount.">
      <section className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <PasswordChangeForm />

        <aside className="space-y-4">
          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
                <ShieldCheck size={21} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                  Twee-factor-authenticatie
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  2FA wordt voorbereid voor klantaccounts. Tot die tijd blijft wachtwoordbeleid de primaire bescherming.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[#081D3A]">
                <Fingerprint size={21} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                  Sessies
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  Sessiebeheer wordt straks zichtbaar zodra de auth-auditlaag is uitgebreid.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
