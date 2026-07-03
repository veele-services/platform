export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ClipboardList, MapPin, QrCode } from "lucide-react";
import { getInventoryScanResult, type InventoryScanItem } from "@/actions/inventory-scan";

type Props = {
  params: Promise<{ token: string }>;
};

function loginRedirect(path: string): never {
  redirect(`/login?next=${encodeURIComponent(path)}`);
}

function formatDate(value: string | null): string {
  if (!value) return "Niet gepland";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL");
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    available: "Beschikbaar",
    in_use: "In gebruik",
    assigned_to_object: "Bij object",
    assigned_to_personnel: "Bij personeel",
    maintenance: "Onderhoud",
    defect: "Defect",
    out_of_service: "Buiten gebruik",
    lost: "Kwijt",
    disposed: "Afgevoerd",
    archived: "Gearchiveerd",
  };
  return labels[value] ?? value;
}

function locationLabel(item: InventoryScanItem): string {
  return item.currentObjectName ?? item.currentPersonnelName ?? item.currentLocationName ?? "Geen locatie bekend";
}

function DenialCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-[#F4F6FA] px-4 py-8">
      <div className="mx-auto max-w-md rounded-[22px] bg-white p-6 shadow-sm" style={{ boxShadow: "0 18px 40px rgba(8,29,58,0.08)" }}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[#B91C1C]">
          <AlertTriangle size={26} />
        </div>
        <h1 className="text-xl font-black" style={{ color: "var(--color-primary)" }}>{title}</h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-secondary)" }}>{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/scan/inventory" className="rounded-xl px-4 py-3 text-center text-sm font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
            Handmatig zoeken
          </Link>
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black" style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}>
            <ArrowLeft size={18} />
            Terug
          </Link>
        </div>
      </div>
    </main>
  );
}

function AllowedCard({ item }: { item: InventoryScanItem }) {
  return (
    <main className="min-h-screen bg-[#F4F6FA] px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/scan/inventory" className="inline-flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
          <ArrowLeft size={18} />
          Scan of code
        </Link>

        <section className="rounded-[24px] bg-white p-5 shadow-sm" style={{ boxShadow: "0 18px 40px rgba(8,29,58,0.08)" }}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F2FF] text-[#2563A9]">
            <QrCode size={26} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#E8F2FF] px-3 py-1 font-mono text-xs font-black text-[#2563A9]">{item.code}</span>
            <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-black text-[#047857]">{statusLabel(item.status)}</span>
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight" style={{ color: "var(--color-primary)" }}>{item.name}</h1>
          <p className="mt-2 flex items-center gap-1 text-sm" style={{ color: "var(--color-secondary)" }}>
            <MapPin size={15} />
            {locationLabel(item)}
          </p>
        </section>

        <section className="rounded-[22px] bg-white p-5 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
          <h2 className="mb-3 flex items-center gap-2 text-base font-black" style={{ color: "var(--color-primary)" }}>
            <ClipboardList size={18} />
            Toegestane details
          </h2>
          <dl className="space-y-3 text-sm">
            <Info label="Type" value={item.type ?? "-"} />
            <Info label="Merk/model" value={[item.brand, item.model].filter(Boolean).join(" / ") || "-"} />
            <Info label="Serienummer" value={item.serialNumber ?? "-"} />
            <Info label="Volgende keuring" value={formatDate(item.nextInspectionDate)} />
            <Info label="Werkboncontext" value={item.relatedAssignmentCode ? `Werkbon ${item.relatedAssignmentCode}` : "Eigen inventariscontext"} />
          </dl>
        </section>

        {item.relatedAssignmentId ? (
          <Link href={`/opdrachten/${item.relatedAssignmentId}/inventaris`} className="block rounded-xl px-4 py-4 text-center text-sm font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
            Open inventaris op werkbon
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt style={{ color: "var(--color-secondary)" }}>{label}</dt>
      <dd className="text-right font-black" style={{ color: "var(--color-primary)" }}>{value}</dd>
    </div>
  );
}

export default async function InventoryTokenScanPage({ params }: Props) {
  const { token } = await params;
  const scanPath = `/scan/inventory/${encodeURIComponent(token)}`;
  const result = await getInventoryScanResult(token);

  if (result.status === "login_required") loginRedirect(scanPath);
  if (result.status === "not_found") return <DenialCard title="Niet gevonden" message={result.message} />;
  if (result.status === "denied") return <DenialCard title="Geen toegang" message={result.message} />;

  return <AllowedCard item={result.item} />;
}
