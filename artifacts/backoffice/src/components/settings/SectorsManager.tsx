"use client";

import { FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TenantActionMenu } from "@/components/tenant-ui/tenant-action-menu";
import { TenantConfirmDialog } from "@/components/tenant-ui/tenant-confirm-dialog";
import {
  createSector,
  deleteSector,
  updateSector,
  type SectorRow,
} from "@/app/actions/sectors";

interface Props {
  initialSectors: SectorRow[];
  canWrite: boolean;
}

type FormState = {
  name: string;
  description: string;
};

function emptyForm(): FormState {
  return { name: "", description: "" };
}

function usageTotal(sector: SectorRow): number {
  return sector.customersCount + sector.objectsCount + sector.personnelCount + sector.taskCodesCount;
}

export function SectorsManager({ initialSectors, canWrite }: Props) {
  const [sectors, setSectors] = useState(initialSectors);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [toggleTarget, setToggleTarget] = useState<SectorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectorRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingSector = sectors.find((sector) => sector.id === editingId) ?? null;
  const sheetTitle = editingSector ? "Sector bewerken" : "Nieuwe sector";

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEdit(sector: SectorRow) {
    setEditingId(sector.id);
    setForm({
      name: sector.name,
      description: sector.description ?? "",
    });
    setSheetOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;

    if (editingId) {
      startTransition(async () => {
        const result = await updateSector(editingId, form);
        if (result.success) {
          setSectors((prev) =>
            prev
              .map((sector) =>
                sector.id === editingId
                  ? { ...sector, name: form.name.trim(), description: form.description.trim() || null }
                  : sector,
              )
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
          setSheetOpen(false);
          toast.success("Sector bijgewerkt");
        } else {
          toast.error(result.message);
        }
      });
      return;
    }

    startTransition(async () => {
      const result = await createSector(form);
      if (result.success && result.data) {
        const newSector: SectorRow = {
          id: result.data.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          isActive: true,
          createdAt: new Date().toISOString(),
          customersCount: 0,
          objectsCount: 0,
          personnelCount: 0,
          taskCodesCount: 0,
        };
        setSectors((prev) => [...prev, newSector].sort((a, b) => a.name.localeCompare(b.name)));
        setSheetOpen(false);
        setForm(emptyForm());
        toast.success("Sector aangemaakt");
      } else if (!result.success) {
        toast.error(result.message);
      }
    });
  }

  function handleToggleActive() {
    if (!toggleTarget) return;
    const target = toggleTarget;
    startTransition(async () => {
      const result = await updateSector(target.id, { isActive: !target.isActive });
      if (result.success) {
        setSectors((prev) =>
          prev.map((item) =>
            item.id === target.id ? { ...item, isActive: !target.isActive } : item,
          ),
        );
        setToggleTarget(null);
        toast.success(!target.isActive ? "Sector geactiveerd" : "Sector gedeactiveerd");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleDeleteSector() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const result = await deleteSector(target.id);
      if (result.success) {
        setSectors((prev) => prev.filter((sector) => sector.id !== target.id));
        setDeleteTarget(null);
        toast.success("Sector verwijderd");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="veele-card overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <div>
          <p className="text-sm font-medium" style={{ color: "#081D3A" }}>
            {sectors.length} sector{sectors.length !== 1 ? "en" : ""}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
            Sectoren sturen filters, taakcodes en personeelsmatching aan.
          </p>
        </div>
        {canWrite && (
          <SectorSheet
            open={sheetOpen}
            title={sheetTitle}
            form={form}
            pending={isPending}
            onOpenChange={setSheetOpen}
            onOpenAdd={openAdd}
            onFormChange={setForm}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      {sectors.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
          Nog geen sectoren. Voeg Facilitair, Schoonmaak en Beveiliging toe om te starten.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Sector</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Gebruik</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
                {canWrite && <th className="w-16 px-5 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector, index) => (
                <tr
                  key={sector.id}
                  className="transition-colors hover:bg-slate-50/60"
                  style={{ borderBottom: index < sectors.length - 1 ? "1px solid #F1F5F9" : undefined }}
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium" style={{ color: "#081D3A" }}>{sector.name}</p>
                    <p className="mt-0.5 max-w-xl text-xs" style={{ color: "#64748B" }}>
                      {sector.description || "Geen omschrijving"}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5 text-xs" style={{ color: "#64748B" }}>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{sector.customersCount} klanten</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{sector.objectsCount} objecten</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{sector.personnelCount} medewerkers</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">{sector.taskCodesCount} taakcodes</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: sector.isActive ? "#ECFDF5" : "#F8FAFC",
                        color: sector.isActive ? "#059669" : "#64748B",
                      }}
                    >
                      {sector.isActive ? "Actief" : "Inactief"}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-5 py-3 text-right">
                      <TenantActionMenu
                        actions={[
                          {
                            id: "edit",
                            label: "Bewerken",
                            icon: <Pencil className="h-3.5 w-3.5" />,
                            onSelect: () => openEdit(sector),
                          },
                          {
                            id: "toggle",
                            label: sector.isActive ? "Deactiveren" : "Activeren",
                            icon: sector.isActive ? <ToggleLeft className="h-3.5 w-3.5" /> : <ToggleRight className="h-3.5 w-3.5" />,
                            separatorBefore: true,
                            destructive: sector.isActive,
                            disabled: isPending,
                            onSelect: (event: Event) => {
                              event.preventDefault();
                              setToggleTarget(sector);
                            },
                          },
                          {
                            id: "delete",
                            label: "Verwijderen",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            destructive: true,
                            disabled: isPending,
                            onSelect: (event: Event) => {
                              event.preventDefault();
                              setDeleteTarget(sector);
                            },
                          },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TenantConfirmDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.isActive ? "Sector deactiveren?" : "Sector activeren?"}
        description={
          toggleTarget
            ? `${toggleTarget.name} heeft ${usageTotal(toggleTarget)} bestaande koppelingen. De koppelingen blijven behouden.`
            : undefined
        }
        confirmLabel={toggleTarget?.isActive ? "Deactiveren" : "Activeren"}
        destructive={Boolean(toggleTarget?.isActive)}
        onConfirm={handleToggleActive}
      />

      <TenantConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Sector verwijderen?"
        description={
          deleteTarget
            ? usageTotal(deleteTarget) > 0
              ? `${deleteTarget.name} heeft ${usageTotal(deleteTarget)} bestaande koppelingen. Verwijderen koppelt sectorreferenties los waar de database dat toestaat. Dit kan niet ongedaan worden gemaakt.`
              : `${deleteTarget.name} wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.`
            : undefined
        }
        confirmLabel="Verwijderen"
        destructive
        onConfirm={handleDeleteSector}
      />
    </div>
  );
}

function SectorSheet({
  open,
  title,
  form,
  pending,
  onOpenChange,
  onOpenAdd,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  form: FormState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAdd: () => void;
  onFormChange: (form: FormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm" onClick={onOpenAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Toevoegen
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Sectoren sturen filters, taakcodes en personeelsmatching aan.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sectorName">Naam</Label>
            <Input
              id="sectorName"
              value={form.name}
              onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              placeholder="Bijv. Schoonmaak"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sectorDescription">Omschrijving</Label>
            <Textarea
              id="sectorDescription"
              value={form.description}
              onChange={(event) => onFormChange({ ...form, description: event.target.value })}
              placeholder="Waar wordt deze sector voor gebruikt?"
              className="min-h-24"
            />
          </div>
          <Button type="submit" disabled={pending || !form.name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Opslaan
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
