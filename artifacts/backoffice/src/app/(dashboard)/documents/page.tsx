import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "Documents",
};

export default function DocumentsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Documents
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Contracts, certificates, and shared files
        </p>
      </div>
      <div className="veele-card flex flex-col items-center justify-center py-16 gap-4">
        <FolderOpen className="w-12 h-12" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
        <p className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
          Document Storage
        </p>
        <p className="text-sm text-center max-w-xs" style={{ color: "#64748B" }}>
          Document storage via Supabase Storage will be built in Sprint 4.
        </p>
      </div>
    </div>
  );
}
