import Link from "next/link";
import { ChevronRight, PackageSearch } from "lucide-react";
import type { InventoryUsageItem, InventoryUsageType } from "@/actions/inventory";
import { formatQuantity } from "./work-order-data";

type Props = {
  assignmentId: string;
  items: InventoryUsageItem[];
};

const USAGE_LABELS: Record<InventoryUsageType, string> = {
  used: "Gebruikt",
  rented: "Verhuurd",
  issued: "Uitgegeven",
  returned: "Retour",
  defect_found: "Defect geconstateerd",
};

function usageLabel(value: string): string {
  return USAGE_LABELS[value as InventoryUsageType] ?? value;
}

export function InventorySummaryCard({ assignmentId, items }: Props) {
  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <Link href={`/opdrachten/${assignmentId}/inventaris`} className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Inventaris
        </h2>
        <ChevronRight size={24} strokeWidth={2.35} style={{ color: "var(--color-primary)" }} />
      </Link>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
              {item.name}
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
              {formatQuantity(item.quantity)} item{item.quantity === 1 ? "" : "s"} - {usageLabel(item.usageType)}
              {item.periodLabel ? ` - ${item.periodLabel}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2563A9]">
                {item.inventoryCode}
              </span>
              <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                {item.approvalStatus === "approved" ? "Goedgekeurd" : item.approvalStatus === "rejected" ? "Afgewezen" : "Wacht op controle"}
              </span>
            </div>
          </div>
        )) : (
          <div className="rounded-[18px] border border-dashed px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
            <PackageSearch size={28} className="mx-auto mb-2" style={{ color: "var(--color-muted-fg)" }} />
            <p className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
              Geen inventaris gekoppeld
            </p>
            <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
              Voeg gebruikte of verhuurde inventaris toe aan deze werkbon.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          Registraties
        </span>
        <span className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {items.length}
        </span>
      </div>
    </section>
  );
}
