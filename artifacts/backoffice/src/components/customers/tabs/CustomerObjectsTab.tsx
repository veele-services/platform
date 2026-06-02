import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerDetailObjectCreate } from "@/components/customers/CustomerDetailObjectCreate";
import type { SectorOption } from "@/app/actions/customers";

type ObjectRow = {
  id:         string;
  name:       string;
  code:       string | null;
  sectorName: string | null;
  city:       string | null;
  isActive:   boolean;
};

interface Props {
  customerId:  string;
  customerName: string;
  objects:     ObjectRow[];
  sectors:     SectorOption[];
  canWrite:    boolean;
}

export function CustomerObjectsTab({ customerId, customerName, objects, sectors, canWrite }: Props) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm" style={{ color: "#64748B" }}>
          {objects.length} object{objects.length !== 1 ? "en" : ""}
        </p>
        <div className="flex items-center gap-3">
          {canWrite && (
            <CustomerDetailObjectCreate customerId={customerId} customerName={customerName} sectors={sectors} />
          )}
          <Link
            href={`/objects?customerId=${customerId}`}
            className="text-xs font-medium hover:underline"
            style={{ color: "#00B7B3" }}
          >
            Alle bekijken →
          </Link>
        </div>
      </div>

      <div className="veele-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Naam</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Code</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Stad</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {objects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
                    Nog geen objecten gekoppeld aan deze klant.
                  </td>
                </tr>
              ) : (
                objects.map((obj, i) => (
                  <tr
                    key={obj.id}
                    className="transition-colors hover:bg-slate-50/60"
                    style={{ borderBottom: i < objects.length - 1 ? "1px solid #F1F5F9" : undefined }}
                  >
                    <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>
                      <Link href={`/objects/${obj.id}`} className="hover:underline">{obj.name}</Link>
                    </td>
                    <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.code ?? "—"}</td>
                    <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.sectorName ?? "—"}</td>
                    <td className="px-5 py-3 text-sm" style={{ color: "#64748B" }}>{obj.city ?? "—"}</td>
                    <td className="px-5 py-3"><StatusBadge isActive={obj.isActive} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
