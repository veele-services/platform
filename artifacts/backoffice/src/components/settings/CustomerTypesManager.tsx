"use client";

import { FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createCustomerType,
  updateCustomerType,
} from "@/app/actions/customers";

type CustomerTypeRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
};

interface Props {
  initialTypes: CustomerTypeRow[];
  canWrite: boolean;
}

interface FormState {
  name: string;
  slug: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function CustomerTypesManager({ initialTypes, canWrite }: Props) {
  const [types, setTypes] = useState(initialTypes);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<CustomerTypeRow | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", slug: "" });
  const [isPending, startTransition] = useTransition();

  const editingType = types.find((type) => type.id === editingId) ?? null;

  function openAdd() {
    setEditingId(null);
    setForm({ name: "", slug: "" });
    setSheetOpen(true);
  }

  function openEdit(type: CustomerTypeRow) {
    setEditingId(type.id);
    setForm({ name: type.name, slug: type.slug });
    setSheetOpen(true);
  }

  function handleNameChange(name: string) {
    setForm((current) => ({ ...current, name, slug: editingId ? current.slug : slugify(name) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;

    if (editingId) {
      startTransition(async () => {
        const result = await updateCustomerType(editingId, { name: form.name, slug: form.slug });
        if (result.success) {
          toast.success("Klanttype bijgewerkt");
          setTypes((prev) =>
            prev.map((type) =>
              type.id === editingId ? { ...type, name: form.name.trim(), slug: form.slug } : type,
            ),
          );
          setSheetOpen(false);
        } else {
          toast.error(result.message);
        }
      });
      return;
    }

    startTransition(async () => {
      const result = await createCustomerType({ name: form.name, slug: form.slug });
      if (result.success && result.data) {
        toast.success("Klanttype aangemaakt");
        const newType: CustomerTypeRow = {
          id: result.data.id,
          name: form.name.trim(),
          slug: slugify(form.slug || form.name),
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        setTypes((prev) => [...prev, newType].sort((a, b) => a.name.localeCompare(b.name)));
        setSheetOpen(false);
        setForm({ name: "", slug: "" });
      } else if (!result.success) {
        toast.error(result.message);
      }
    });
  }

  function handleToggleActive() {
    if (!toggleTarget) return;
    const target = toggleTarget;
    startTransition(async () => {
      const result = await updateCustomerType(target.id, { isActive: !target.isActive });
      if (result.success) {
        setTypes((prev) =>
          prev.map((type) => (type.id === target.id ? { ...type, isActive: !target.isActive } : type)),
        );
        setToggleTarget(null);
        toast.success(!target.isActive ? "Klanttype geactiveerd" : "Klanttype gedeactiveerd");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="veele-card overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <p className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
          {types.length} klanttype{types.length !== 1 ? "s" : ""}
        </p>
        {canWrite && (
          <CustomerTypeSheet
            open={sheetOpen}
            title={editingType ? "Klanttype bewerken" : "Nieuw klanttype"}
            form={form}
            pending={isPending}
            onOpenChange={setSheetOpen}
            onOpenAdd={openAdd}
            onFormChange={setForm}
            onNameChange={handleNameChange}
            onSubmit={handleSubmit}
          />
        )}
      </div>

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
              {canWrite && <th className="w-16 px-5 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {types.map((type, index) => (
              <tr
                key={type.id}
                className="transition-colors hover:bg-slate-50/60"
                style={{ borderBottom: index < types.length - 1 ? "1px solid #F1F5F9" : undefined }}
              >
                <td className="px-5 py-3 text-sm font-medium" style={{ color: "var(--color-foreground)" }}>{type.name}</td>
                <td className="px-5 py-3 font-mono text-sm" style={{ color: "#64748B" }}>{type.slug}</td>
                <td className="px-5 py-3">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: type.isActive ? "#ECFDF5" : "#F8FAFC",
                      color: type.isActive ? "#059669" : "#64748B",
                    }}
                  >
                    {type.isActive ? "Actief" : "Inactief"}
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
                          onSelect: () => openEdit(type),
                        },
                        {
                          id: "toggle",
                          label: type.isActive ? "Deactiveren" : "Activeren",
                          icon: type.isActive ? <ToggleLeft className="h-3.5 w-3.5" /> : <ToggleRight className="h-3.5 w-3.5" />,
                          separatorBefore: true,
                          destructive: type.isActive,
                          disabled: isPending,
                          onSelect: (event: Event) => {
                            event.preventDefault();
                            setToggleTarget(type);
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
      )}

      <TenantConfirmDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.isActive ? "Klanttype deactiveren?" : "Klanttype activeren?"}
        description={toggleTarget ? `Klanttype "${toggleTarget.name}" blijft bestaan voor bestaande klanten.` : undefined}
        confirmLabel={toggleTarget?.isActive ? "Deactiveren" : "Activeren"}
        destructive={Boolean(toggleTarget?.isActive)}
        onConfirm={handleToggleActive}
      />
    </div>
  );
}

function CustomerTypeSheet({
  open,
  title,
  form,
  pending,
  onOpenChange,
  onOpenAdd,
  onFormChange,
  onNameChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  form: FormState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAdd: () => void;
  onFormChange: (form: FormState) => void;
  onNameChange: (name: string) => void;
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
          <SheetDescription>Klanttypes bepalen de keuzelijst in klantprofielen.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="customerTypeName">Naam</Label>
            <Input
              id="customerTypeName"
              value={form.name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Naam van het type"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customerTypeSlug">Slug</Label>
            <Input
              id="customerTypeSlug"
              value={form.slug}
              onChange={(event) => onFormChange({ ...form, slug: slugify(event.target.value) })}
              placeholder="slug-automatisch"
              className="font-mono"
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
