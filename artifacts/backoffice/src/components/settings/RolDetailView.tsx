"use client";

import { useState, useTransition, useCallback } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { toggleRolePermission } from "@/app/actions/settings";
import type { RoleDetail, PermissionItem } from "@/app/actions/settings";

interface Props {
  role:     RoleDetail;
  canWrite: boolean;
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

export function RolDetailView({ role, canWrite }: Props) {
  const enabledIds = new Set(role.permissions.map((p) => p.id));

  const byResource = new Map<string, PermissionItem[]>();
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
        </div>

        <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
          {resources.map((resource) => (
            <ResourceRow
              key={resource}
              resource={resource}
              permissions={byResource.get(resource)!}
              enabledIds={enabledIds}
              roleId={role.id}
              canWrite={canWrite}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-right" style={{ color: "#94A3B8" }}>
        Wijzigingen worden direct opgeslagen.
      </p>
    </div>
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
  permissions: PermissionItem[];
  enabledIds:  Set<string>;
  roleId:      string;
  canWrite:    boolean;
}) {
  return (
    <div className="flex items-center px-4 py-3 gap-4">
      <div className="w-32 flex-shrink-0">
        <span className="text-sm font-medium" style={{ color: "#081D3A" }}>
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
  permission: PermissionItem;
  enabled:    boolean;
  roleId:     string;
  canWrite:   boolean;
}) {
  const [checked, setChecked] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);

  const handleChange = useCallback(
    (next: boolean) => {
      if (!canWrite || isPending) return;
      setChecked(next);
      setFlash(null);

      startTransition(async () => {
        const result = await toggleRolePermission(roleId, permission.id, next);
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
    [canWrite, isPending, roleId, permission.id],
  );

  return (
    <label
      className={`inline-flex items-center gap-2 text-xs select-none ${canWrite ? "cursor-pointer" : "cursor-default"}`}
    >
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={canWrite ? 0 : -1}
        onClick={() => canWrite && handleChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); canWrite && handleChange(!checked); } }}
        className={`
          relative inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2
          ${checked ? "border-transparent" : "border-slate-300"}
          ${isPending ? "opacity-50" : ""}
        `}
        style={{
          backgroundColor: checked ? "#00B7B3" : "#F8FAFC",
        }}
      >
        {checked && (
          <svg
            className="h-3 w-3 text-white"
            fill="none" viewBox="0 0 12 12"
            stroke="currentColor" strokeWidth={2.5}
          >
            <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span
        style={{
          color: flash === "err" ? "#DC2626" : flash === "ok" ? "#059669" : "#374151",
        }}
      >
        {actionLabel(permission.action)}
      </span>
    </label>
  );
}
