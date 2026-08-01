import Link from "next/link";
import {
  CalendarCheck,
  ChevronRight,
  FolderOpen,
  HelpCircle,
  Lightbulb,
  LogOut,
  Megaphone,
  Newspaper,
  Plane,
  Settings,
} from "lucide-react";
import { NativeAwareSignOutButton } from "@/components/NativeAwareSignOutButton";
import { isTenantModuleEnabled } from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";

export const dynamic = "force-dynamic";

const MORE_LINKS = [
  { href: "/nieuws", label: "Nieuws", description: "Updates en interne berichten", Icon: Newspaper },
  { href: "/instellingen", label: "Instellingen", description: "Profiel, beveiliging en meldingen", Icon: Settings },
  { href: "/beschikbaarheid", label: "Beschikbaarheid", description: "Beschikbare dagen beheren", Icon: CalendarCheck },
  { href: "/verlof", label: "Verlof", description: "Verlofaanvragen bekijken en indienen", Icon: Plane },
  { href: "/documenten", label: "Documenten", description: "Bestanden en formulieren", Icon: FolderOpen, moduleKey: "documents" },
  { href: "/help", label: "Help", description: "Handleidingen en uitleg bij functies", Icon: HelpCircle, moduleKey: "knowledgebase" },
  { href: "/releases", label: "Wat is nieuw", description: "Nieuwe functies en verbeteringen", Icon: Megaphone, moduleKey: "releases" },
  { href: "/roadmap/new", label: "Featurewens", description: "Dien een productwens in bij de tenant", Icon: Lightbulb },
] satisfies Array<{
  href: string;
  label: string;
  description: string;
  Icon: typeof Newspaper;
  moduleKey?: "documents" | "knowledgebase" | "releases";
}>;

type Props = {
  searchParams?: Promise<{ featureRequest?: string }>;
};

export default async function MeerPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const featureFlags = tenantId
    ? {
        documents: await isTenantModuleEnabled(tenantId, "documents"),
        knowledgebase: await isTenantModuleEnabled(tenantId, "knowledgebase"),
        releases: await isTenantModuleEnabled(tenantId, "releases"),
      }
    : { documents: false, knowledgebase: false, releases: false };
  const visibleLinks = MORE_LINKS.filter(
    (item) => !item.moduleKey || featureFlags[item.moduleKey],
  );

  return (
    <div className="min-h-screen bg-[var(--color-muted)] px-4 py-5 md:mx-auto md:min-h-0 md:max-w-3xl md:px-0 md:py-0">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-primary)" }}>
          Meer
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-secondary)" }}>
          Profiel, instellingen en extra functies.
        </p>
      </div>

      {params.featureRequest === "sent" && (
        <div className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          Featurewens ontvangen. Bedankt voor uw input.
        </div>
      )}

      <div className="space-y-2">
        {visibleLinks.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-white px-3 py-2.5 shadow-sm active:scale-[0.99]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "rgba(0,183,179,0.1)", color: "var(--color-accent)" }}
            >
              <Icon size={22} strokeWidth={2.3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
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

      <div className="mt-5">
        <NativeAwareSignOutButton
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <LogOut size={20} strokeWidth={2.3} />
          Uitloggen
        </NativeAwareSignOutButton>
      </div>
    </div>
  );
}
