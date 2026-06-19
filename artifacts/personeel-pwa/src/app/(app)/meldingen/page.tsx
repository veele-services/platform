export const dynamic = "force-dynamic";

import { getMyPersonnel } from "@/actions/personnel";
import { BellRing, Mail, Smartphone } from "lucide-react";
import { NotificationSettingsForm } from "./NotificationSettingsForm";

export default async function MeldingenPage() {
  const profile = await getMyPersonnel();

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[32px] font-black leading-tight text-white md:text-3xl">
          Meldingen
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          E-mail en pushvoorkeuren
        </p>
      </section>

      <section className="rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <BellRing size={21} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-black text-[#081D3A]">
                  Voorkeuren
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Bepaal welke updates je wilt ontvangen.
                </p>
              </div>
            </div>

            {profile ? (
              <NotificationSettingsForm profile={profile} />
            ) : (
              <p className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600">
                Profielgegevens niet gevonden.
              </p>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <InfoCard
              Icon={Mail}
              title="E-mail"
              text="Operationele e-mails blijven beschikbaar zodra SMTP actief is gekoppeld."
            />
            <InfoCard
              Icon={Smartphone}
              title="Push"
              text="Pushmeldingen worden later aan PWA-permissies en realtime events gekoppeld."
            />
          </section>
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  Icon,
  title,
  text,
}: {
  Icon: typeof Mail;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.08)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
        <Icon size={19} strokeWidth={2.4} />
      </span>
      <h3 className="mt-3 text-base font-black text-[#081D3A]">{title}</h3>
      <p className="mt-1 text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
