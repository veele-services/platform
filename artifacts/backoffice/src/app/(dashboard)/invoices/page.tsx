import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";

export const metadata: Metadata = {
  title: "Invoices",
};

export default async function InvoicesPage() {
  if (!(await hasPermission("invoices", "read"))) {
    return <ForbiddenPage resource="invoices" action="read" />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Invoices
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Invoice generation from completed assignments
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <FileText className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Invoice Management
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Invoice generation and Mollie payment integration will be built in Sprint 4.
        </p>
      </div>
    </div>
  );
}
