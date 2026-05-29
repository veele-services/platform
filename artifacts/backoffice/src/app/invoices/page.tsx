import type { Metadata } from "next";
import { FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Invoices",
};

export default function InvoicesPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Invoices
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Invoice management and payment tracking
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <FileText className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Invoice Management
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Invoices are generated from completed and approved assignments. Mollie payments will be integrated in Sprint 5.
        </p>
      </div>
    </div>
  );
}
