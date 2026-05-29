import type { Metadata } from "next";
import { Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Objects",
};

export default function ObjectsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Objects
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Manage service objects linked to customers
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <Building2 className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Object Registry
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Objects are service locations or assets linked to a customer. CRUD will be built in Sprint 2.
        </p>
      </div>
    </div>
  );
}
