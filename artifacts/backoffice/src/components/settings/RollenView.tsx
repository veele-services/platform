"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, ChevronRight, Plus, Users, Lock, AlertCircle, Trash2, RotateCcw } from "lucide-react";
import { createRole, deleteRole, resetSystemRolesToDefault } from "@/app/actions/settings";
import type { RolePlanCapabilities, RoleRow } from "@/app/actions/settings";

interface Props {
  roles:    RoleRow[];
  canWrite: boolean;
  capabilities: RolePlanCapabilities;
}

export function RollenView({ roles: initialRoles, canWrite, capabilities }: Props) {
  const router = useRouter();
  const [roles,      setRoles]      = useState(initialRoles);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName]   = useState("");
  const [desc, setDesc]   = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, startResetTransition] = useTransition();

  const [deleteTargetId,    setDeleteTargetId]    = useState<string | null>(null);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);
  const [isDeleting,        startDeleteTransition] = useTransition();

  const deleteTarget = roles.find((r) => r.id === deleteTargetId);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRole({ name: name.trim(), description: desc.trim() || null });
      if (result.success && result.data) {
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
        setRoles((prev) => prev.filter((r) => r.id !== deleteTargetId));
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
          <p className="text-sm mt-1" style={{ color: resetError ? "#DC2626" : "#64748B" }}>
            {resetError ?? `Het huidige tenantplan (${capabilities.plan}) staat geen custom rollen toe. Systeemrollen en permissies blijven wel inzichtelijk.`}
          </p>
        </div>
      )}

      {canWrite && (
        <div className="flex justify-end gap-2">
          {capabilities.canResetSystemRoles && (
            <button
              onClick={handleResetDefaults}
              disabled={isResetting}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-50"
              style={{ borderColor: "#E2E8F0", color: "#475569" }}
            >
              <RotateCcw className="h-4 w-4" />
              {isResetting ? "Resetten…" : "Systeemrollen resetten"}
            </button>
          )}
          <button
            onClick={() => setShowCreate((v) => !v)}
            disabled={!capabilities.customRoles}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#081D3A" }}
          >
            <Plus className="h-4 w-4" />
            Nieuwe rol
          </button>
        </div>
      )}

      {showCreate && capabilities.customRoles && (
        <form onSubmit={handleCreate} className="veele-card space-y-3">
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Nieuwe rol aanmaken</p>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Naam <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="veele-input w-full max-w-sm"
              placeholder="bijv. Supervisor"
              disabled={isPending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Beschrijving
            </label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="veele-input w-full max-w-sm"
              placeholder="Optionele beschrijving"
              disabled={isPending}
            />
          </div>
          {error && (
            <p className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}>
              <AlertCircle className="h-4 w-4" />{error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#081D3A" }}
            >
              {isPending ? "Aanmaken…" : "Aanmaken"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setName(""); setDesc(""); setError(null); }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium border"
              style={{ borderColor: "#E2E8F0", color: "#475569" }}
            >
              Annuleren
            </button>
          </div>
        </form>
      )}

      <div className="veele-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
              {["Rol", "Beschrijving", "Gebruikers", "Rechten", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "#94A3B8" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr
                key={role.id}
                style={{ borderBottom: "1px solid #F8FAFC" }}
                className="hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 flex-shrink-0" style={{ color: "#00B7B3" }} strokeWidth={1.5} />
                    <span className="font-medium" style={{ color: "#081D3A" }}>{role.name}</span>
                    {role.isSystem && (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "#E0FAFB", color: "#00B7B3" }}
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Systeem
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" style={{ color: "#64748B" }}>
                  {role.description ?? <span style={{ color: "#CBD5E1" }}>—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-sm" style={{ color: "#64748B" }}>
                    <Users className="h-3.5 w-3.5" />
                    {role.userCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm" style={{ color: "#64748B" }}>
                    {role.permCount} rechten
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    {canWrite && capabilities.customRoles && !role.isSystem && (
                      <button
                        onClick={() => { setDeleteTargetId(role.id); setDeleteError(null); }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded transition-colors hover:bg-red-50"
                        title="Rol verwijderen"
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "#DC2626" }} />
                      </button>
                    )}
                    <Link
                      href={`/instellingen/rollen/${role.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 transition-colors hover:bg-slate-100"
                      style={{ color: "#00B7B3" }}
                    >
                      Bewerken
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {roles.length === 0 && (
          <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
            <Shield className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm">Geen rollen gevonden.</p>
          </div>
        )}
      </div>

      {/* ── Delete confirmation overlay ── */}
      {deleteTargetId && deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(8,29,58,0.4)" }}
        >
          <div className="veele-card max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center h-10 w-10 rounded-lg flex-shrink-0"
                style={{ backgroundColor: "#FEE2E2" }}
              >
                <Trash2 className="h-5 w-5" style={{ color: "#DC2626" }} />
              </div>
              <h3 className="font-heading text-base font-semibold" style={{ color: "#081D3A" }}>
                Rol verwijderen?
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: "#475569" }}>
              Rol <strong>&ldquo;{deleteTarget.name}&rdquo;</strong> wordt permanent verwijderd inclusief alle gekoppelde rechten.
              {deleteTarget.userCount > 0 && (
                <span className="block mt-1" style={{ color: "#DC2626" }}>
                  Let op: {deleteTarget.userCount} gebruiker{deleteTarget.userCount !== 1 ? "s" : ""} gekoppeld.
                </span>
              )}
            </p>

            {deleteError && (
              <p className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: "#DC2626" }}>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {deleteError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeleteTargetId(null); setDeleteError(null); }}
                disabled={isDeleting}
                className="rounded-lg px-3 py-1.5 text-sm font-medium border"
                style={{ borderColor: "#E2E8F0", color: "#475569" }}
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#DC2626" }}
              >
                {isDeleting ? "Verwijderen…" : "Verwijderen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
