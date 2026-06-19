import Link from "next/link";
import { Bell, ChevronLeft, Newspaper } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NieuwsPage() {
  return (
    <div className="min-h-screen bg-[#F6F8FB] px-5 py-6">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--color-primary)" }}>
        <ChevronLeft size={18} />
        Home
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--color-primary)" }}>
          Nieuws
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-secondary)" }}>
          Updates, meldingen en interne berichten.
        </p>
      </div>

      <div className="rounded-[24px] border bg-white p-6 text-center shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF6FF] text-[#2563EB]">
          <Newspaper size={28} strokeWidth={2.4} />
        </div>
        <h2 className="mt-4 text-lg font-black" style={{ color: "var(--color-primary)" }}>
          Nog geen nieuwsberichten
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-secondary)" }}>
          Zodra er personeelsupdates of meldingen zijn, komen ze hier te staan.
        </p>
      </div>

      <div className="mt-4 rounded-[20px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}>
            <Bell size={21} strokeWidth={2.3} />
          </span>
          <div>
            <p className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Meldingen
            </p>
            <p className="text-sm" style={{ color: "var(--color-secondary)" }}>
              Push- en appmeldingen worden later aan deze pagina gekoppeld.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
