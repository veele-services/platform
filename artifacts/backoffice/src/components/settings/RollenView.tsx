"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, Pencil, Plus, RotateCcw, Shield, Trash2, Users } from "lucide-react";
import { createRole, deleteRole, resetSystemRolesToDefault } from "@/app/actions/settings";
import type { RolePlanCapabilities, RoleRow } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
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

interface Props {
  roles: RoleRow[];
  canWrite: boolean;
  capabilities: RolePlanCapabilities;
}

export function RollenView({ roles: initialRoles, canWrite, capabilities }: Props) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, startResetTransition] = useTransition();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const deleteTarget = roles.find((role) => role.id === deleteTargetId);

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRole({ name: name.trim(), description: desc.trim() || null });
      if (result.success && result.data) {
        setCreateOpen(false);
        router.push(`/instellingen/rollen/${result.data.id}`);
      } else {
        setError((result as { message?: string }).message ?? "Aanmaken mislukt.");
      }
    });
  }

  function handleResetDefaults() {
    setResetError(null);
    startResetTransition(async () => {
      const result = await resetSystemRolesToDefault();
      if (result.success) {
        router.refresh();
      } else {
        setResetError((result as { message?: string }).message ?? "Resetten mislukt.");
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteRole(deleteTargetId);
      if (result.success) {
        setRoles((prev) => prev.filter((role) => role.id !== deleteTargetId));
        setDeleteTargetId(null);
      } else {
        setDeleteError((result as { message?: string }).message ?? "Verwijderen mislukt.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {(!capabilities.customRoles || resetError) && (
        <div className="veele-card border-l-4" style={{ borderLeftColor: capabilities.customRoles ? "#F59E0B" : "#CBD5E1" }}>
          <p className="text-sm font-medium" style={{ color: "#081D3A" }}>
            Custom rollen: {capabilities.customRoles ? "beschikbaar" : "niet beschikbaar"}
          </p>
          <p className="mt-1 text-sm" style={{ color: resetError ? "#DC2626" : "#64748B" }}>
            {resetError ?? `Het huidige tenantplan (${capabilities.plan}) staat geen custom rollen toe. Systeemrollen en permissies blijven wel inzichtelijk.`}
          </p>
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap justify-end gap-2">
          {capabilities.canResetSystemRoles && (
            <TenantConfirmDialog
              title="Systeemrollen resetten?"
              description="Alle systeemrollen worden teruggezet naar de standaardrechten voor dit tenantplan."
              confirmLabel="Resetten"
              onConfirm={handleResetDefaults}
              trigger={
                <Button type="button" variant="outline" disabled={isResetting}>
                  <RotateCcw className="h-4 w-4" />
                  {isResetting ? "Resetten..." : "Systeemrollen resetten"}
                </Button>
              }
            />
          )}
          {capabilities.customRoles && (
            <CreateRoleSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              name={name}
              description={desc}
              pending={isPending}
              error={error}
              onNameChange={setName}
              onDescriptionChange={setDesc}
              onSubmit={handleCreate}
            />
          )}
        </div>
      )}

      <div className="veele-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
              {["Rol", "Beschrijving", "Gebruikers", "Rechten", ""].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "#94A3B8" }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} style={{ borderBottom: "1px solid #F8FAFC" }} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 flex-shrink-0" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
                    <span className="font-medium" style={{ color: "#081D3A" }}>{role.name}</span>
                    {role.isSystem && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: "#E0FAFB", color: "#00B7B3" }}>
                        <Lock className="h-2.5 w-2.5" />
                        Systeem
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: "#64748B" }}>
                  {role.description ?? <span style={{ color: "#CBD5E1" }}>-</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-sm" style={{ color: "#64748B" }}>
                    <Users className="h-3.5 w-3.5" />
                    {role.userCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm" style={{ color: "#64748B" }}>{role.permCount} rechten</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <TenantActionMenu
                    actions={[
                      {
                        id: "edit",
                        label: "Permissies openen",
                        href: `/instellingen/rollen/${role.id}`,
                        icon: <Pencil className="h-3.5 w-3.5" />,
                      },
                      ...(canWrite && capabilities.customRoles && !role.isSystem
                        ? [{
                            id: "delete",
                            label: "Rol verwijderen",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            destructive: true,
                            separatorBefore: true,
                            disabled: isDeleting,
                            onSelect: (event: Event) => {
                              event.preventDefault();
                              setDeleteError(null);
                              setDeleteTargetId(role.id);
                            },
                          }]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {roles.length === 0 && (
          <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
            <Shield className="mx-auto mb-2 h-8 w-8" strokeWidth={1.5} />
            <p className="text-sm">Geen rollen gevonden.</p>
          </div>
        )}
      </div>

      <TenantConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
            setDeleteError(null);
          }
        }}
        title="Rol verwijderen?"
        description={deleteTarget ? `Rol "${deleteTarget.name}" wordt permanent verwijderd inclusief alle gekoppelde rechten.` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={handleDeleteConfirm}
      >
        {deleteTarget?.userCount ? (
          <span className="text-destructive">
            Let op: {deleteTarget.userCount} gebruiker{deleteTarget.userCount !== 1 ? "s" : ""} gekoppeld.
          </span>
        ) : null}
        {deleteError ? (
          <span className="mt-2 inline-flex items-center gap-1.5 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {deleteError}
          </span>
        ) : null}
      </TenantConfirmDialog>
    </div>
  );
}

function CreateRoleSheet({
  open,
  onOpenChange,
  name,
  description,
  pending,
  error,
  onNameChange,
  onDescriptionChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  pending: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" />
          Nieuwe rol
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nieuwe rol</SheetTitle>
          <SheetDescription>Maak een custom rol aan en stel daarna de permissie-matrix in.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-xs font-medium" style={{ color: "#374151" }}>
            Naam
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="veele-input mt-1 w-full"
              placeholder="bijv. Supervisor"
              disabled={pending}
              required
            />
          </label>
          <label className="block text-xs font-medium" style={{ color: "#374151" }}>
            Beschrijving
            <input
              type="text"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              className="veele-input mt-1 w-full"
              placeholder="Optionele beschrijving"
              disabled={pending}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Aanmaken..." : "Aanmaken"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
