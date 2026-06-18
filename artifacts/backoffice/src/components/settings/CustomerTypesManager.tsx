"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Check, X, Loader2, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomerType,
  updateCustomerType,
} from "@/app/actions/customers";

type CustomerTypeRow = {
  id:        string;
  name:      string;
  slug:      string;
  isActive:  boolean;
  createdAt: string;
};

interface Props {
  initialTypes: CustomerTypeRow[];
  canWrite:     boolean;
}

interface FormState {
  name: string;
  slug: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function CustomerTypesManager({ initialTypes, canWrite }: Props) {
  const [types,      setTypes]      = useState(initialTypes);
  const [addOpen,    setAddOpen]    = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState<FormState>({ name: "", slug: "" });
  const [isPending,  startTransition] = useTransition();

  function openAdd() {
    setEditingId(null);
    setForm({ name: "", slug: "" });
    setAddOpen(true);
  }

  function openEdit(t: CustomerTypeRow) {
    setEditingId(t.id);
    setForm({ name: t.name, slug: t.slug });
    setAddOpen(false);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: editingId ? f.slug : slugify(name) }));
  }

  function handleSaveNew() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      const result = await createCustomerType({ name: form.name, slug: form.slug });
      if (result.success && result.data) {
        toast.success("Klanttype aangemaakt");
        const newType: CustomerTypeRow = {
          id:        result.data.id,
          name:      form.name.trim(),
          slug:      slugify(form.slug || form.name),
          isActive:  true,
          createdAt: new Date().toISOString(),
        };
        setTypes((prev) => [...prev, newType].sort((a, b) => a.name.localeCompare(b.name)));
        setAddOpen(false);
        setForm({ name: "", slug: "" });
      } else if (!result.success) {
        toast.error(result.message);
      }
    });
  }

  function handleSaveEdit() {
    if (!editingId || !form.name.trim()) return;
    startTransition(async () => {
      const result = await updateCustomerType(editingId, { name: form.name, slug: form.slug });
      if (result.success) {
        toast.success("Klanttype bijgewerkt");
        setTypes((prev) =>
          prev.map((t) =>
            t.id === editingId ? { ...t, name: form.name.trim(), slug: form.slug } : t,
          ),
        );
        setEditingId(null);
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleToggleActive(t: CustomerTypeRow) {
    startTransition(async () => {
      const result = await updateCustomerType(t.id, { isActive: !t.isActive });
      if (result.success) {
        setTypes((prev) =>
          prev.map((x) => (x.id === t.id ? { ...x, isActive: !t.isActive } : x)),
        );
        toast.success(!t.isActive ? "Klanttype geactiveerd" : "Klanttype gedeactiveerd");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="veele-card overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <p className="text-sm font-medium" style={{ color: "#081D3A" }}>
          {types.length} klanttype{types.length !== 1 ? "s" : ""}
        </p>
        {canWrite && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Toevoegen
          </Button>
        )}
      </div>

      {/* Add form */}
      {addOpen && (
        <div className="px-5 py-4 flex flex-col gap-3" style={{ borderBottom: "1px solid #E2E8F0", backgroundColor: "#F8FAFC" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Nieuw klanttype</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="newTypeName">Naam *</Label>
              <Input
                id="newTypeName"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Naam van het type"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newTypeSlug">Slug</Label>
              <Input
                id="newTypeSlug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="slug-automatisch"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveNew} disabled={isPending || !form.name.trim()}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              Opslaan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)} disabled={isPending}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Annuleren
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {types.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>
          Nog geen klanttypes. Voeg er een toe.
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Naam</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Slug</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Status</th>
              {canWrite && <th className="px-5 py-2.5 w-40" />}
            </tr>
          </thead>
          <tbody>
            {types.map((t, i) => (
              <tr
                key={t.id}
                className="transition-colors hover:bg-slate-50/60"
                style={{ borderBottom: i < types.length - 1 ? "1px solid #F1F5F9" : undefined }}
              >
                {editingId === t.id ? (
                  <>
                    <td className="px-5 py-2.5">
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <Input
                        value={form.slug}
                        onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                        className="h-8 text-sm font-mono"
                      />
                    </td>
                    <td className="px-5 py-2.5" />
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button size="sm" className="h-7 px-2" onClick={handleSaveEdit} disabled={isPending}>
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
                    <td className="px-5 py-3 text-sm font-medium" style={{ color: "#081D3A" }}>{t.name}</td>
                    <td className="px-5 py-3 text-sm font-mono" style={{ color: "#64748B" }}>{t.slug}</td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: t.isActive ? "#ECFDF5" : "#F8FAFC",
                          color:           t.isActive ? "#059669" : "#64748B",
                        }}
                      >
                        {t.isActive ? "Actief" : "Inactief"}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(t)}>
                            <Pencil className="h-3 w-3 mr-1" /> Bewerken
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => handleToggleActive(t)}
                            disabled={isPending}
                          >
                            {t.isActive
                              ? <><ToggleLeft className="h-3 w-3 mr-1" /> Deactiveren</>
                              : <><ToggleRight className="h-3 w-3 mr-1" /> Activeren</>
                            }
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
      )}
    </div>
  );
}
