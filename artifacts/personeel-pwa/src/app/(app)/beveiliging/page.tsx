export const dynamic = "force-dynamic";

import { KeyRound, ShieldCheck } from "lucide-react";
import { MfaSettings } from "./MfaSettings";
import { SecurityPasswordForm } from "./SecurityPasswordForm";

export default function BeveiligingPage() {
  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Beveiliging
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Wachtwoord en tweestapsverificatie
        </p>
      </section>

      <section className="min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <KeyRound size={21} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-black text-[#081D3A]">
                  Wachtwoord wijzigen
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Gebruik minimaal een medium sterk wachtwoord.
                </p>
              </div>
            </div>
            <SecurityPasswordForm />
          </section>

          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <ShieldCheck size={21} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-black text-[#081D3A]">
                  Tweestapsverificatie
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Activeer een authenticator-app voor extra bescherming.
                </p>
              </div>
            </div>
            <MfaSettings />
          </section>
        </div>
      </section>
    </div>
  );
}
