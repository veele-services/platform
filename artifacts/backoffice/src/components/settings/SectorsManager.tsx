"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createSector,
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
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isPending, startTransition] = useTransition();

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setAddOpen(true);
  }

  function openEdit(sector: SectorRow) {
    setEditingId(sector.id);
    setForm({
      name: sector.name,
      description: sector.description ?? "",
    });
    setAddOpen(false);
  }

  function handleSaveNew() {
    if (!form.name.trim()) return;
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
        setAddOpen(false);
        setForm(emptyForm());
        toast.success("Sector aangemaakt");
      } else if (!result.success) {
        toast.error(result.message);
      }
    });
  }

  function handleSaveEdit() {
    if (!editingId || !form.name.trim()) return;
    startTransition(async () => {
      const result = await updateSector(editingId, form);
      if (result.success) {
        setSectors((prev) =>
          prev
            .map((sector) =>
              sector.id === editingId
                ? {
                    ...sector,
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                  }
                : sector,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditingId(null);
        toast.success("Sector bijgewerkt");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleToggleActive(sector: SectorRow) {
    startTransition(async () => {
      const result = await updateSector(sector.id, { isActive: !sector.isActive });
      if (result.success) {
        setSectors((prev) =>
          prev.map((item) =>
            item.id === sector.id ? { ...item, isActive: !sector.isActive } : item,
          ),
        );
        toast.success(!sector.isActive ? "Sector geactiveerd" : "Sector gedeactiveerd");
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
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Toevoegen
          </Button>
        )}
      </div>

      {addOpen && (
        <div className="space-y-3 px-5 py-4" style={{ borderBottom: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>
            Nieuwe sector
          </p>
          <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
            <div className="space-y-1">
              <Label htmlFor="newSectorName">Naam *</Label>
              <Input
                id="newSectorName"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Bijv. Schoonmaak"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newSectorDescription">Omschrijving</Label>
              <Textarea
                id="newSectorDescription"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Waar wordt deze sector voor gebruikt?"
                className="min-h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveNew} disabled={isPending || !form.name.trim()}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              Opslaan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Annuleren
            </Button>
          </div>
        </div>
      )}

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
                {canWrite && <th className="w-56 px-5 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector, index) => (
                <tr
                  key={sector.id}
                  className="transition-colors hover:bg-slate-50/60"
                  style={{ borderBottom: index < sectors.length - 1 ? "1px solid #F1F5F9" : undefined }}
                >
                  {editingId === sector.id ? (
                    <>
                      <td className="px-5 py-3 align-top">
                        <Input
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                          className="h-8 text-sm"
                        />
                        <Textarea
                          value={form.description}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                          className="mt-2 min-h-16 text-sm"
                        />
                      </td>
                      <td className="px-5 py-3 align-top text-sm" style={{ color: "#64748B" }}>{usageTotal(sector)} koppelingen</td>
                      <td className="px-5 py-3 align-top" />
                      <td className="px-5 py-3 align-top">
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-7 px-2" onClick={handleSaveEdit} disabled={isPending || !form.name.trim()}>
                            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)} disabled={isPending}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
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
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(sector)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              Bewerken
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleToggleActive(sector)}
                              disabled={isPending}
                            >
                              {sector.isActive ? (
                                <>
                                  <ToggleLeft className="mr-1 h-3 w-3" />
                                  Deactiveren
                                </>
                              ) : (
                                <>
                                  <ToggleRight className="mr-1 h-3 w-3" />
                                  Activeren
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
