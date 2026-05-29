import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  if (!(await hasPermission("settings", "read"))) {
    return <ForbiddenPage resource="settings" action="read" />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Platform configuration and catalog management
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsCard
          href="/settings/task-codes"
          icon={<ClipboardList className="h-6 w-6" style={{ color: "#00B7B3" }} strokeWidth={1.5} />}
          title="Task Codes"
          description="Manage the central catalog of task types used in assignments, planning, and invoicing."
        />
      </div>
    </div>
  );
}

function SettingsCard({
  href,
  icon,
  title,
  description,
}: {
  href:        string;
  icon:        React.ReactNode;
  title:       string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="veele-card flex items-start gap-4 transition-shadow hover:shadow-md group"
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-lg w-10 h-10"
        style={{ backgroundColor: "#E0FAFB" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold group-hover:underline" style={{ color: "#081D3A" }}>
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#64748B" }}>
          {description}
        </p>
      </div>
      <ChevronRight
        className="flex-shrink-0 h-4 w-4 mt-0.5 transition-transform group-hover:translate-x-0.5"
        style={{ color: "#94A3B8" }}
      />
    </Link>
  );
}
