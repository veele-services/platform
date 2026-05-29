import type { Metadata } from "next";
import { UserCog } from "lucide-react";

export const metadata: Metadata = {
  title: "Personnel",
};

export default function PersonnelPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Personnel
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Manage field workers, roles, and availability
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <UserCog className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Personnel Management
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Employee profiles, certificates, knowledge, and availability will be built in Sprint 2.
        </p>
      </div>
    </div>
  );
}
