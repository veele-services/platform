"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { toggleTenantRolePermission, updateTenantRole } from "@/app/actions/tenant-roles";
import type { TenantRoleDetail, TenantPermissionItem, TenantRolePlanCapabilities } from "@/app/actions/tenant-roles";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  role:     TenantRoleDetail;
  canWrite: boolean;
  capabilities: TenantRolePlanCapabilities;
}

const RESOURCE_LABELS: Record<string, string> = {
  dashboard:   "Dashboard",
  customers:   "Klanten",
  objects:     "Objecten",
  assignments: "Opdrachten",
  planning:    "Planning",
  personnel:   "Personeel",
  reports:     "Rapporten",
  invoices:    "Facturen",
  documents:   "Documenten",
  task_codes:  "Taakcodes",
  settings:    "Instellingen",
  roles:       "Rollen",
  users:       "Gebruikers",
  quotes:      "Offertes",
};

const ACTION_LABELS: Record<string, string> = {
  read:    "Bekijken",
  write:   "Bewerken",
  delete:  "Verwijderen",
  approve: "Goedkeuren",
  submit:  "Indienen",
  export:  "Exporteren",
  send:    "Versturen",
  grant:   "Verlenen",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

export function RolDetailView({ role, canWrite, capabilities }: Props) {
  const canEditCustomRole = canWrite && capabilities.customRoles && !role.isSystem;
  const enabledIds = new Set(role.permissions.map((p) => p.id));

  const byResource = new Map<string, TenantPermissionItem[]>();
  for (const p of role.allPermissions) {
    const list = byResource.get(p.resource) ?? [];
    list.push(p);
    byResource.set(p.resource, list);
  }

  const resources = Array.from(byResource.keys()).sort((a, b) =>
    resourceLabel(a).localeCompare(resourceLabel(b), "nl"),
  );

  return (
    <div className="space-y-2">
      {!role.isSystem && (
        <RoleMetadataForm role={role} canEdit={canEditCustomRole} capabilities={capabilities} />
      )}

      <div className="veele-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
            Permissie-matrix
          </p>
          {!canWrite && (
            <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
              U heeft geen schrijfrechten voor rollen.
            </p>
          )}
          {!role.isSystem && !capabilities.customRoles && (
            <p className="text-xs mt-0.5" style={{ color: "#DC2626" }}>
              Custom permissies wijzigen is niet beschikbaar in tenantplan {capabilities.plan}.
            </p>
          )}
        </div>

        <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
          {resources.map((resource) => (
            <ResourceRow
              key={resource}
              resource={resource}
              permissions={byResource.get(resource)!}
              enabledIds={enabledIds}
              roleId={role.id}
              canWrite={role.isSystem ? canWrite : canEditCustomRole}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-right" style={{ color: "#94A3B8" }}>
        Wijzigingen in de permissie-matrix worden direct opgeslagen.
      </p>
    </div>
  );
}


function RoleMetadataForm({
  role,
  canEdit,
  capabilities,
}: {
  role: TenantRoleDetail;
  canEdit: boolean;
  capabilities: TenantRolePlanCapabilities;
}) {
  const router = useRouter();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateTenantRole({
        id: role.id,
        name: name.trim(),
        description: description.trim() || null,
      });

      if (result.success) {
        setMessage("Rol opgeslagen.");
        router.refresh();
      } else {
        setMessage((result as { message?: string }).message ?? "Opslaan mislukt.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="veele-card space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
          Custom rol
        </p>
        {!capabilities.customRoles && (
          <p className="text-xs mt-0.5" style={{ color: "#DC2626" }}>
            Wijzigen is geblokkeerd door tenantplan {capabilities.plan}.
          </p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium" style={{ color: "#374151" }}>
          Naam
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || isPending}
            className="veele-input mt-1 w-full"
          />
        </label>
        <label className="block text-xs font-medium" style={{ color: "#374151" }}>
          Beschrijving
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit || isPending}
            className="veele-input mt-1 w-full"
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        {message ? <p className="text-sm" style={{ color: message.includes("mislukt") || message.includes("niet") || message.includes("geblokkeerd") ? "#DC2626" : "#059669" }}>{message}</p> : <span />}
        {canEdit && (
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-foreground)" }}
          >
            <Save className="h-4 w-4" />
            {isPending ? "Opslaan…" : "Opslaan"}
          </button>
        )}
      </div>
      <SettingsStickySaveBar
        canWrite={canEdit}
        pending={isPending || !name.trim()}
        saved={message === "Rol opgeslagen."}
        error={message && message !== "Rol opgeslagen." ? message : undefined}
        submitLabel="Rol opslaan"
      />
    </form>
  );
}

function ResourceRow({
  resource,
  permissions,
  enabledIds,
  roleId,
  canWrite,
}: {
  resource:    string;
  permissions: TenantPermissionItem[];
  enabledIds:  Set<string>;
  roleId:      string;
  canWrite:    boolean;
}) {
  return (
    <div className="flex items-center px-4 py-3 gap-4">
      <div className="w-32 flex-shrink-0">
        <span className="text-sm font-medium" style={{ color: "var(--color-foreground)" }}>
          {resourceLabel(resource)}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {permissions.map((p) => (
          <PermissionToggle
            key={p.id}
            permission={p}
            enabled={enabledIds.has(p.id)}
            roleId={roleId}
            canWrite={canWrite}
          />
        ))}
      </div>
    </div>
  );
}

function PermissionToggle({
  permission,
  enabled,
  roleId,
  canWrite,
}: {
  permission: TenantPermissionItem;
  enabled:    boolean;
  roleId:     string;
  canWrite:   boolean;
}) {
  const [checked, setChecked] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const canToggle = canWrite && (checked || permission.canGrant);

  const handleChange = useCallback(
    (next: boolean) => {
      if (!canToggle || isPending) return;
      setChecked(next);
      setFlash(null);

      startTransition(async () => {
        const result = await toggleTenantRolePermission(roleId, permission.id, next);
        if (!result.success) {
          setChecked(!next);
          setFlash("err");
          setTimeout(() => setFlash(null), 2000);
        } else {
          setFlash("ok");
          setTimeout(() => setFlash(null), 1500);
        }
      });
    },
    [canToggle, isPending, roleId, permission.id],
  );

  return (
    <label className={`inline-flex min-h-11 items-center gap-2 text-xs select-none ${canToggle ? "cursor-pointer" : "cursor-default"}`}>
      <Checkbox
        checked={checked}
        disabled={!canToggle || isPending}
        aria-label={`${actionLabel(permission.action)} voor ${resourceLabel(permission.resource)}`}
        onCheckedChange={(next) => handleChange(next === true)}
      />
      <span
        aria-live="polite"
        style={{
          color: flash === "err" ? "#DC2626" : flash === "ok" ? "#059669" : "#374151",
        }}
      >
        {actionLabel(permission.action)}
        {!checked && canWrite && !permission.canGrant ? " — niet toewijsbaar" : ""}
        {flash === "err" ? " — opslaan mislukt" : flash === "ok" ? " — opgeslagen" : ""}
      </span>
    </label>
  );
}
