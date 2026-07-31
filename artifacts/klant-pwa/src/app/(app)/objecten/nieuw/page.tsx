export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getCustomerObjectSectors } from "@/actions/objects";
import { CustomerObjectForm } from "@/components/CustomerObjectForm";
import { PortalPageShell } from "@/components/portal-ui";

export default async function NieuwObjectPage() {
  const sectors = await getCustomerObjectSectors();

  return (
    <PortalPageShell
      title="Object toevoegen"
      subtitle="Leg een nieuwe locatie vast met expliciete reviewkeuze voordat deze operationeel gebruikt wordt."
      status={{ label: "Review vereist", tone: "warning" }}
      actions={
        <Link
          href="/objecten"
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={16} />
          Terug
        </Link>
      }
    >
      <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "rgba(245,158,11,0.24)" }}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-primary)" }}>
              Eerst kiezen: concept, review of direct actief
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
              Nieuwe objecten worden niet stilzwijgend operationeel actief. Kies hieronder hoe de backoffice dit object moet behandelen.
            </p>
          </div>
        </div>
      </section>
      <div className="mb-3 md:hidden">
        <Link
          href="/objecten"
          className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold shadow-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={16} />
          Terug naar objecten
        </Link>
      </div>
      <CustomerObjectForm mode="create" sectors={sectors} />
    </PortalPageShell>
  );
}
