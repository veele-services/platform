import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { ObjectsView } from "@/components/objects/ObjectsView";
import { listObjects, listCustomerOptions, getObjectStats } from "@/app/actions/objects";
import { Building2, CheckCircle2, ClipboardList, FileText, PauseCircle } from "lucide-react";

export const metadata: Metadata = { title: "Objecten" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default async function ObjectsPage({ searchParams }: Props) {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("objects", "read"),
    hasPermission("objects", "write"),
  ]);

  if (!canRead) return <ForbiddenPage resource="objects" action="read" />;

  const sp          = await searchParams;
  const search      = str(sp.search);
  const customerId  = str(sp.customerId);
  const serviceType = str(sp.serviceType);
  const region      = str(sp.region);
  const status      = str(sp.status, "all");
  const page        = Math.max(1, parseInt(str(sp.page, "1")) || 1);
  const sort        = str(sp.sort, "name");
  const dir         = str(sp.dir, "asc");

  const [{ rows, total }, customers, stats] = await Promise.all([
    listObjects({ search, customerId, serviceType, region, status, page, sort, dir }),
    listCustomerOptions(),
    getObjectStats(),
  ]);

  const statCards = [
    {
      icon:  Building2,
      label: "Totaal objecten",
      value: stats.total,
      color: "#081D3A",
    },
    {
      icon:  CheckCircle2,
      label: "Actieve opdrachten",
      value: stats.activeAssignments,
      color: "#00B7B3",
    },
    {
      icon:  ClipboardList,
      label: "Servicetypes",
      value: stats.periodicTasks,
      color: "#7C3AED",
    },
    {
      icon:  PauseCircle,
      label: "Inactief",
      value: stats.openAlerts,
      color: "#F59E0B",
    },
    {
      icon:  FileText,
      label: "Documenten",
      value: stats.contracts,
      color: "#10B981",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Objecten
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          {total} object{total !== 1 ? "en" : ""}
          {search ? ` die overeenkomen met "${search}"` : ""}
        </p>
      </div>

      {/* 5-metric stat bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div
            key={label}
            className="veele-card flex items-center gap-3"
          >
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-lg h-9 w-9"
              style={{ backgroundColor: `${color}18` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs truncate" style={{ color: "#94A3B8" }}>{label}</p>
              <p className="text-lg font-bold leading-tight" style={{ color: "#081D3A" }}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <ObjectsView
        rows={rows}
        total={total}
        customers={customers}
        canWrite={canWrite}
        page={page}
        initialSearch={search}
        initialCustomerId={customerId}
        initialServiceType={serviceType}
        initialRegion={region}
        initialStatus={status}
        initialSort={sort}
        initialDir={dir}
      />
    </div>
  );
}
