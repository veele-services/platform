import type { Metadata } from "next";
import { Settings } from "lucide-react";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Platform configuration, roles, and permissions
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <Settings className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Platform Settings
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Dynamic RBAC configuration, notification settings, and platform preferences will be built in Sprint 5.
        </p>
      </div>
    </div>
  );
}
