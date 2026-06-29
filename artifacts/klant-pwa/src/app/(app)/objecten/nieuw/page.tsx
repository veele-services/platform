export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCustomerObjectSectors } from "@/actions/objects";
import { CustomerObjectForm } from "@/components/CustomerObjectForm";
import { PageShell } from "@/components/PageShell";

export default async function NieuwObjectPage() {
  const sectors = await getCustomerObjectSectors();

  return (
    <PageShell
      title="Object toevoegen"
      subtitle="Leg een nieuwe locatie vast voor aanvragen, werkbonnen en rapportages."
      actions={
        <Link
          href="/objecten"
          className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={16} />
          Terug
        </Link>
      }
    >
      <div className="mb-3 md:hidden">
        <Link
          href="/objecten"
          className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-black shadow-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={16} />
          Terug naar objecten
        </Link>
      </div>
      <CustomerObjectForm mode="create" sectors={sectors} />
    </PageShell>
  );
}
