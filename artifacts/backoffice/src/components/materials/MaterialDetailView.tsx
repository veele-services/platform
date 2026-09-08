"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil } from "lucide-react";
import {
  archiveMaterial,
  updateMaterial,
  type ActionResult,
  type MaterialDetail,
  type MaterialManagementOptions,
} from "@/app/actions/materials";
import { MaterialStockPanel } from "@/components/materials/MaterialStockPanel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
  TenantConfirmDialog,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function money(value: string | null): string {
  if (value === null) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
      }).format(parsed)
    : value;
}

function quantity(value: string, unit: string): string {
  const parsed = Number(value);
  const formatted = Number.isFinite(parsed)
    ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(
        parsed,
      )
    : value;
  return `${formatted} ${unit}`;
}

function resultMessage(result: ActionResult, successMessage: string): string {
  return result.success ? successMessage : result.message;
}

export function MaterialDetailView({
  material,
  options,
  canWrite,
  canArchive,
}: {
  material: MaterialDetail;
  options: MaterialManagementOptions;
  canWrite: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result, successMessage));
      if (result.success) router.refresh();
    });
  }

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const categoryId = formString(formData, "categoryId");
    run(
      () =>
        updateMaterial(material.id, {
          name: formString(formData, "name") ?? "",
          unit: formString(formData, "unit") ?? "",
          categoryId: categoryId === "__new" ? null : categoryId,
          categoryName:
            categoryId === "__new"
              ? formString(formData, "categoryName")
              : null,
          description: formString(formData, "description"),
          costPrice: formString(formData, "costPrice"),
          salePrice: formString(formData, "salePrice"),
          vatRate: formString(formData, "vatRate"),
          vatType: formString(formData, "vatType"),
          supplierName: formString(formData, "supplierName"),
          supplierItemNumber: formString(formData, "supplierItemNumber"),
          barcode: formString(formData, "barcode"),
          minStock: formString(formData, "minStock"),
          maxStock: formString(formData, "maxStock"),
          defaultInvoiceable: formData.get("defaultInvoiceable") === "on",
          notes: formString(formData, "notes"),
        }),
      "Materiaal bijgewerkt.",
    );
  }

  const badges = (
    <>
      <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
        {material.code}
      </span>
      {material.archivedAt && (
        <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          Gearchiveerd
        </span>
      )}
    </>
  );

  const actions =
    (canWrite || canArchive) && !material.archivedAt ? (
      <>
        {canWrite ? <EditMaterialSheet
          material={material}
          options={options}
          pending={pending}
          onSubmit={handleUpdate}
        /> : null}
        {canArchive ? (
          <TenantConfirmDialog
            title="Materiaal archiveren?"
            description={`Weet u zeker dat u ${material.name} wilt archiveren?`}
            confirmLabel="Archiveren"
            destructive
            onConfirm={() =>
              run(() => archiveMaterial(material.id), "Materiaal gearchiveerd.")
            }
            trigger={
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                className="min-h-11 text-amber-700"
              >
                <Archive className="h-4 w-4" />
                Archiveer
              </Button>
            }
          />
        ) : null}
      </>
    ) : null;

  return (
    <TenantPageShell size="wide">
      <TenantDetailHeader
        backHref="/materials"
        backLabel="Materiaalbeheer"
        title={material.name}
        description={`${material.categoryName ?? "Geen categorie"} - ${material.unit}`}
        badges={badges}
        actions={actions}
        meta={[
          {
            label: "Factureerbaar",
            value: material.defaultInvoiceable ? "Ja" : "Nee",
          },
          { label: "Leverancier", value: material.supplierName ?? "-" },
        ]}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Overzicht", href: "#overzicht", active: true },
          {
            label: "Voorraad",
            href: "#voorraad",
            count: material.balances.length,
          },
          {
            label: "Tijdlijn",
            href: "#tijdlijn",
            count: material.movements.length,
          },
          {
            label: "Verbruik",
            href: "#verbruik",
            count: material.usages.length,
          },
          { label: "Financieel", href: "#financieel" },
        ]}
      />

      {message && (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <TenantDetailLayout
        aside={
          <TenantDetailActionPanel
            title="Materiaalacties"
            description="Bewerk catalogusdata, archiveer of beoordeel financiele instellingen."
          >
            <TenantWorkbenchPanel id="financieel" title="Financieel">
              <dl className="space-y-3 px-4 py-4 text-sm">
                <Info label="Kostprijs" value={money(material.costPrice)} />
                <Info label="Verkoopprijs" value={money(material.salePrice)} />
                <Info
                  label="BTW"
                  value={material.vatRate ? `${material.vatRate}%` : "-"}
                />
                <Info
                  label="Factureerbaar"
                  value={material.defaultInvoiceable ? "Ja" : "Nee"}
                />
              </dl>
            </TenantWorkbenchPanel>
          </TenantDetailActionPanel>
        }
      >
        <div className="flex flex-col gap-6">
          <section id="overzicht" className="grid gap-4 md:grid-cols-4">
            <Metric
              label="Totale voorraad"
              value={quantity(material.totalStock, material.unit)}
            />
            <Metric label="Locaties" value={String(material.locationsCount)} />
            <Metric
              label="Lage voorraad"
              value={String(material.lowLocationsCount)}
              tone={material.lowLocationsCount > 0 ? "warn" : "ok"}
            />
            <Metric
              label="Negatief"
              value={String(material.negativeLocationsCount)}
              tone={material.negativeLocationsCount > 0 ? "danger" : "ok"}
            />
          </section>

          <section id="voorraad">
            <MaterialStockPanel rows={material.balances} />
          </section>

          <TenantWorkbenchPanel
            id="tijdlijn"
            title="Tijdlijn voorraadmutaties"
            description="Laatste voorraadbewegingen per locatie en reden."
          >
            {material.movements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Nog geen voorraadmutaties.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {material.movements.map((movement) => (
                  <div key={movement.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {movement.movementType} -{" "}
                        {quantity(movement.quantity, material.unit)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(movement.createdAt).toLocaleString("nl-NL")}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {movement.fromLocationName ?? "-"}
                      {" -> "}
                      {movement.toLocationName ?? "-"}
                      {movement.reason ? ` - ${movement.reason}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TenantWorkbenchPanel>

          <TenantWorkbenchPanel
            id="verbruik"
            title="Verbruik op werkbonnen"
            description="Werkbonregels waarin dit materiaal is gebruikt."
          >
            {material.usages.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Nog geen verbruikshistorie.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {material.usages.map((usage) => (
                  <div key={usage.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {usage.name}
                      </p>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {usage.approvalStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {usage.assignmentCode ?? "Werkbon"} -{" "}
                      {quantity(
                        usage.quantity,
                        usage.unitLabel ?? material.unit,
                      )}
                      {usage.invoiceable ? " - factureerbaar" : ""}
                      {usage.customerVisible ? " - klantzichtbaar" : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TenantWorkbenchPanel>
        </div>
      </TenantDetailLayout>
    </TenantPageShell>
  );
}

function EditMaterialSheet({
  material,
  options,
  pending,
  onSubmit,
}: {
  material: MaterialDetail;
  options: MaterialManagementOptions;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button">
          <Pencil className="h-4 w-4" />
          Bewerken
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Materiaal bewerken</SheetTitle>
          <SheetDescription>
            Werk catalogusdata, prijzen, voorraadgrenzen en
            leverancierinformatie bij.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <input
            name="name"
            defaultValue={material.name}
            required
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="unit"
              defaultValue={material.unit}
              required
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="vatRate"
              defaultValue={material.vatRate ?? ""}
              inputMode="decimal"
              placeholder="BTW %"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <SelectAdapter
            name="categoryId"
            defaultValue=""
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          >
            <option value="">Geen categorie wijzigen</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value="__new">Nieuwe categorie</option>
          </SelectAdapter>
          <input
            name="categoryName"
            placeholder="Nieuwe categorie indien gekozen"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="costPrice"
              defaultValue={material.costPrice ?? ""}
              inputMode="decimal"
              placeholder="Kostprijs"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="salePrice"
              defaultValue={material.salePrice ?? ""}
              inputMode="decimal"
              placeholder="Verkoopprijs"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="minStock"
              defaultValue={material.minStock ?? ""}
              inputMode="decimal"
              placeholder="Minimumvoorraad"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
            <input
              name="maxStock"
              defaultValue={material.maxStock ?? ""}
              inputMode="decimal"
              placeholder="Maximumvoorraad"
              className="h-10 rounded-md border px-3 text-sm"
              style={{ borderColor: "#CBD5E1" }}
            />
          </div>
          <input
            name="barcode"
            defaultValue={material.barcode ?? ""}
            placeholder="Barcode"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <input
            name="supplierName"
            defaultValue={material.supplierName ?? ""}
            placeholder="Leverancier"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <input
            name="supplierItemNumber"
            defaultValue={material.supplierItemNumber ?? ""}
            placeholder="Leveranciersartikelnummer"
            className="h-10 rounded-md border px-3 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <textarea
            name="description"
            defaultValue={material.description ?? ""}
            rows={3}
            placeholder="Omschrijving"
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <textarea
            name="notes"
            defaultValue={material.notes ?? ""}
            rows={2}
            placeholder="Notities"
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#CBD5E1" }}
          />
          <label
            className="inline-flex items-center gap-2 text-sm"
            style={{ color: "#334155" }}
          >
            <CheckboxAdapter
              name="defaultInvoiceable"
              type="checkbox"
              defaultChecked={material.defaultInvoiceable}
            />
            Standaard factureerbaar
          </label>
          <Button type="submit" disabled={pending}>
            <Pencil className="h-4 w-4" />
            Opslaan
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "#B91C1C"
      : tone === "warn"
        ? "#B45309"
        : tone === "ok"
          ? "#047857"
          : "var(--color-foreground)";
  return (
    <div className="veele-card">
      <p
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: "#64748B" }}
      >
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
