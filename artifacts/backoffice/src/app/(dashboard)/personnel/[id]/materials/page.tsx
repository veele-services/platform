import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { getPersonnel } from "@/app/actions/personnel";
import { listMaterialStockForPersonnel } from "@/app/actions/materials";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canReadPersonnel = await hasPermission("personnel", "read");
    if (!canReadPersonnel) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const person = await getPersonnel(id);
    return {
      title: person ? `Materiaal - ${person.firstName} ${person.lastName}` : "Materiaal personeel",
    };
  } catch {
    return { title: "Materiaal personeel" };
  }
}

export default async function PersonnelMaterialsPage({ params }: Props) {
  const [canReadPersonnel, canReadMaterials] = await Promise.all([
    hasPermission("personnel", "read"),
    hasPermission("materials", "view"),
  ]);

  if (!canReadPersonnel) return <ForbiddenPage resource="personnel" action="read" />;
  if (!canReadMaterials) return <ForbiddenPage resource="materials" action="view" />;

  const { id } = await params;
  const [person, rows] = await Promise.all([
    getPersonnel(id),
    listMaterialStockForPersonnel(id),
  ]);

  if (!person) notFound();
  const fullName = `${person.firstName} ${person.lastName}`;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-8">
      <Link
        href={`/personnel/${id}`}
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "#64748B" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Personeelsdossier
      </Link>

      <div className="veele-card">
        <div className="flex flex-wrap items-center gap-3">
          <PackageCheck className="h-5 w-5" style={{ color: "#0F766E" }} />
          <div>
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
              Materiaal / Voorraad
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
              {fullName} - {person.code}
            </p>
          </div>
        </div>
      </div>

      <MaterialStockPanel
        rows={rows}
        emptyMessage="Er is nog geen materiaalvoorraad aan dit personeelslid gekoppeld."
      />
    </div>
  );
}
