import Link from "next/link";
import type { ReactNode } from "react";
import {
  BellRing,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { PageShell } from "./PageShell";

export type CustomerSettingsSection = "profile" | "preferences" | "security";

const SETTINGS_LINKS: Array<{
  key: CustomerSettingsSection;
  href: string;
  label: string;
  description: string;
  Icon: typeof UserCircle;
}> = [
  {
    key: "profile",
    href: "/profiel",
    label: "Profiel",
    description: "Bedrijf en contactpersonen",
    Icon: UserCircle,
  },
  {
    key: "preferences",
    href: "/instellingen",
    label: "Meldingen",
    description: "E-mail en pushvoorkeuren",
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

export function CustomerSettingsShell({
  active,
  title,
  subtitle,
  children,
  aside,
}: {
  active: CustomerSettingsSection;
  title: string;
  subtitle: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <PageShell title={title} subtitle={subtitle}>
      <section
        className={
          aside
            ? "grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_23rem]"
            : "grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]"
        }
      >
        <CustomerSettingsNav active={active} />
        <div className="min-w-0 space-y-4">{children}</div>
        {aside ? <aside className="space-y-4">{aside}</aside> : null}
      </section>
    </PageShell>
  );
}

export function CustomerSettingsFeedback({
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
    <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${styles}`}>
      {children}
    </p>
  );
}

export function CustomerSettingsSaveBar({
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
      className="sticky bottom-[calc(4.9rem+var(--safe-bottom))] z-20 -mx-5 mt-5 flex flex-col gap-2 border-t bg-white/95 px-5 py-3 backdrop-blur md:bottom-4 md:mx-0 md:flex-row md:items-center md:justify-between md:rounded-2xl md:border md:shadow-lg"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex min-w-0 flex-wrap gap-2">{children}</div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white disabled:opacity-60 md:min-h-0"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

function CustomerSettingsNav({ active }: { active: CustomerSettingsSection }) {
  return (
    <nav
      aria-label="Instellingen"
      className="rounded-[22px] border bg-white p-2 shadow-sm xl:sticky xl:top-24 xl:self-start"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1 xl:overflow-visible">
        {SETTINGS_LINKS.map(({ key, href, label, description, Icon }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className="flex min-w-[13rem] items-center gap-3 rounded-2xl px-3 py-3 transition xl:min-w-0"
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
              <span className="min-w-0">
                <span className="block text-sm font-black">{label}</span>
                <span className="block truncate text-xs font-semibold">
                  {description}
                </span>
              </span>
              {isActive ? (
                <CheckCircle2
                  size={16}
                  className="ml-auto hidden shrink-0 xl:block"
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
