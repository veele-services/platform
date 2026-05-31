import type { Metadata } from "next";
import { History } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { listAuditLog } from "@/app/actions/settings";
import { ActiviteitslogView } from "@/components/settings/ActiviteitslogView";

export const metadata: Metadata = { title: "Activiteitslog" };

export default async function ActiviteitslogPage() {
  const canRead = await hasPermission("settings", "read");
  if (!canRead) return <ForbiddenPage resource="activiteitslog" action="read" />;

  const entries = await listAuditLog();

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#94A3B8" }}>
          <a href="/settings" className="hover:underline">Instellingen</a>
          <span>/</span>
          <span style={{ color: "#081D3A" }}>Activiteitslog</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-lg w-10 h-10 flex-shrink-0"
            style={{ backgroundColor: "#E0FAFB" }}
          >
            <History className="h-5 w-5" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Activiteitslog
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "#64748B" }}>
              Laatste {entries.length} wijzigingen in instellingen, rollen en gebruikers.
            </p>
          </div>
        </div>
      </div>

      <ActiviteitslogView entries={entries} />
    </div>
  );
}
