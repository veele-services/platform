import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellRing,
  CheckCircle2,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { MobilePageShell } from "./MobilePageShell";

export type PersonnelSettingsSection =
  | "overview"
  | "profile"
  | "notifications"
  | "security";

const SETTINGS_LINKS: Array<{
  key: PersonnelSettingsSection;
  href: string;
  label: string;
  description: string;
  Icon: typeof Settings;
}> = [
  {
    key: "overview",
    href: "/instellingen",
    label: "Overzicht",
    description: "Alle instellingen",
    Icon: Settings,
  },
  {
    key: "profile",
    href: "/profiel",
    label: "Profiel",
    description: "Gegevens en foto",
    Icon: UserCircle,
  },
  {
    key: "notifications",
    href: "/instellingen/meldingen",
    label: "Meldingen",
    description: "E-mail, push en planning",
    Icon: BellRing,
  },
  {
    key: "security",
    href: "/beveiliging",
    label: "Beveiliging",
    description: "Wachtwoord en toegang",
    Icon: ShieldCheck,
  },
];

export function PersonnelSettingsShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: PersonnelSettingsSection;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <MobilePageShell title={title} subtitle={subtitle}>
      <section className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <PersonnelSettingsNav active={active} />
        <div className="min-w-0 space-y-4">{children}</div>
      </section>
    </MobilePageShell>
  );
}

export function PersonnelSettingsCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function PersonnelSettingsFeedback({
  type,
  children,
}: {
  type: "success" | "error" | "warning" | "info";
  children: ReactNode;
}) {
  const styles = {
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-600",
    warning: "bg-amber-50 text-amber-800",
    info: "bg-slate-50 text-slate-600",
  }[type];

  return (
    <p className={`rounded-2xl px-3 py-2.5 text-sm font-bold ${styles}`}>
      {children}
    </p>
  );
}

export function PersonnelSettingsSaveBar({
  pending,
  label,
  pendingLabel = "Opslaan...",
  children,
}: {
  pending: boolean;
  label: string;
  pendingLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-[calc(5.3rem+var(--safe-bottom))] z-20 -mx-4 mt-4 flex flex-col gap-2 border-t bg-white/95 px-4 py-3 backdrop-blur md:bottom-4 md:mx-0 md:flex-row md:items-center md:justify-between md:rounded-2xl md:border md:shadow-lg"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex min-w-0 flex-wrap gap-2">{children}</div>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3 text-base font-black text-white shadow-lg disabled:opacity-60 md:min-h-0 md:py-2.5 md:text-sm"
      >
        {pending ? (
          <Loader2 size={19} className="animate-spin" />
        ) : (
          <Save size={18} strokeWidth={2.4} />
        )}
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

function PersonnelSettingsNav({ active }: { active: PersonnelSettingsSection }) {
  return (
    <nav
      aria-label="Instellingen"
      className="min-w-0 overflow-hidden rounded-[22px] border bg-white p-2 shadow-[0_14px_34px_rgba(8,29,58,0.08)] lg:sticky lg:top-6 lg:self-start"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {SETTINGS_LINKS.map(({ key, href, label, description, Icon }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className="flex w-[min(76vw,13rem)] shrink-0 snap-start items-center gap-3 rounded-2xl px-3 py-3 transition active:scale-[0.99] lg:w-auto lg:min-w-0"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.10)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-secondary)",
              }}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: isActive ? "var(--color-accent)" : "var(--color-muted)",
                  color: isActive ? "#FFFFFF" : "var(--color-accent)",
                }}
              >
                <Icon size={19} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{label}</span>
                <span className="block truncate text-xs font-semibold">
                  {description}
                </span>
              </span>
              {isActive ? (
                <CheckCircle2
                  size={16}
                  className="ml-auto hidden shrink-0 lg:block"
                  style={{ color: "var(--color-accent)" }}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
