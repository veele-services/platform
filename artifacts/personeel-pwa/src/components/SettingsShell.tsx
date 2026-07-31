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
  notificationsEnabled,
}: {
  active: PersonnelSettingsSection;
  title: string;
  subtitle: string;
  children: ReactNode;
  notificationsEnabled: boolean;
}) {
  return (
    <MobilePageShell title={title} subtitle={subtitle}>
      <section className="grid min-w-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <PersonnelSettingsNav
          active={active}
          notificationsEnabled={notificationsEnabled}
        />
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
      className={`min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm ${className}`}
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
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
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

function PersonnelSettingsNav({
  active,
  notificationsEnabled,
}: {
  active: PersonnelSettingsSection;
  notificationsEnabled: boolean;
}) {
  return (
    <nav
      aria-label="Instellingen"
      className="min-w-0 overflow-hidden rounded-2xl border bg-white p-2 shadow-sm lg:sticky lg:top-6 lg:self-start"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {SETTINGS_LINKS.filter(
          (item) => item.key !== "notifications" || notificationsEnabled,
        ).map(({ key, href, label, description, Icon }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className="flex min-h-11 w-[min(76vw,13rem)] shrink-0 snap-start items-center gap-3 rounded-xl px-3 py-2 transition active:scale-[0.99] lg:w-auto lg:min-w-0"
              style={{
                backgroundColor: isActive ? "rgba(0,183,179,0.10)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-secondary)",
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: isActive ? "var(--color-accent)" : "var(--color-muted)",
                  color: isActive ? "#FFFFFF" : "var(--color-accent)",
                }}
              >
                <Icon size={19} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
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
