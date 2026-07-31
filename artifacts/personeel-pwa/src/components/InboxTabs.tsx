import Link from "next/link";
import { Bell, MessageSquare } from "lucide-react";

export function InboxTabs({
  active,
  notificationsEnabled,
}: {
  active: "messages" | "notifications";
  notificationsEnabled: boolean;
}) {
  const items = [
    {
      href: "/berichten",
      label: "Berichten",
      Icon: MessageSquare,
      active: active === "messages",
      visible: true,
    },
    {
      href: "/meldingen",
      label: "Meldingen",
      Icon: Bell,
      active: active === "notifications",
      visible: notificationsEnabled,
    },
  ];

  return (
    <nav
      aria-label="Inbox"
      className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-white p-1 shadow-sm"
    >
      {items
        .filter((item) => item.visible)
        .map(({ href, label, Icon, active: isActive }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium"
            style={{
              backgroundColor: isActive
                ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                : "transparent",
              color: isActive
                ? "var(--color-primary)"
                : "var(--color-secondary)",
            }}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
    </nav>
  );
}
