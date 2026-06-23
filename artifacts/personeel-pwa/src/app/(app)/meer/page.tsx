import Link from "next/link";
import {
  BellRing,
  CalendarCheck,
  ChevronRight,
  Bug,
  FileText,
  FolderOpen,
  KeyRound,
  LogOut,
  MessageSquare,
  Plane,
  UserCircle,
} from "lucide-react";
import { signOut } from "@/actions/auth";

export const dynamic = "force-dynamic";

const MORE_LINKS = [
  { href: "/profiel", label: "Profiel", description: "Persoonsgegevens en profielfoto", Icon: UserCircle },
  { href: "/beveiliging", label: "Beveiliging", description: "Wachtwoord en 2FA", Icon: KeyRound },
  { href: "/meldingen", label: "Meldingen", description: "E-mail en pushvoorkeuren", Icon: BellRing },
  { href: "/berichten", label: "Berichten", description: "Tickets met afdelingen", Icon: MessageSquare },
  { href: "/beschikbaarheid", label: "Beschikbaarheid", description: "Beschikbare dagen beheren", Icon: CalendarCheck },
  { href: "/verlof", label: "Verlof", description: "Verlofaanvragen bekijken en indienen", Icon: Plane },
  { href: "/documenten", label: "Documenten", description: "Bestanden en formulieren", Icon: FolderOpen },
  { href: "/openstaand", label: "Open diensten", description: "Beschikbare werkbonnen", Icon: FileText },
  { href: "/debug/native", label: "Native diagnose", description: "Capacitor en pushstatus controleren", Icon: Bug },
];

export default function MeerPage() {
  return (
    <div className="min-h-screen bg-[#F6F8FB] px-5 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--color-primary)" }}>
          Meer
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-secondary)" }}>
          Profiel, instellingen en extra functies.
        </p>
      </div>

      <div className="space-y-3">
        {MORE_LINKS.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[20px] border bg-white p-4 shadow-sm active:scale-[0.99]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
            >
              <Icon size={22} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black" style={{ color: "var(--color-primary)" }}>
                {label}
              </span>
              <span className="block truncate text-sm" style={{ color: "var(--color-secondary)" }}>
                {description}
              </span>
            </span>
            <ChevronRight size={20} style={{ color: "var(--color-secondary)" }} />
          </Link>
        ))}
      </div>

      <form action={signOut} className="mt-5">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-[20px] border bg-white p-4 text-sm font-black shadow-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <LogOut size={20} strokeWidth={2.3} />
          Uitloggen
        </button>
      </form>
    </div>
  );
}
