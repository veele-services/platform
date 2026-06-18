"use client";

import { useState, useTransition } from "react";
import {
  Users, Plus, Mail, MoreHorizontal, CheckCircle2, AlertCircle,
  UserX, Pencil, X,
} from "lucide-react";
import {
  inviteUser,
  deactivateUser,
  resendInvite,
  updateUserRoles,
} from "@/app/actions/settings";
import type { UserRow, RoleRow } from "@/app/actions/settings";

const STATUS_LABELS: Record<UserRow["status"], { label: string; bg: string; color: string }> = {
  actief:       { label: "Actief",       bg: "#D1FAE5", color: "#065F46" },
  uitgenodigd:  { label: "Uitgenodigd",  bg: "#EFF6FF", color: "#1D4ED8" },
  inactief:     { label: "Inactief",     bg: "#FEE2E2", color: "#991B1B" },
};

interface Props {
  users:    UserRow[];
  roles:    RoleRow[];
  canWrite: boolean;
}

export function GebruikersView({ users: initialUsers, roles, canWrite }: Props) {
  const [users, setUsers]             = useState(initialUsers);
  const [showInvite, setShowInvite]   = useState(false);
  const [email, setEmail]             = useState("");
  const [roleId, setRoleId]           = useState(roles[0]?.id ?? "");
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  // Role-editing state
  const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds]          = useState<string[]>([]);

  function showFlash(msg: string, isErr: boolean) {
    if (isErr) { setError(msg); setTimeout(() => setError(null), 3000); }
    else        { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteUser({ email: email.trim(), roleId });
      if (result.success) {
        setShowInvite(false);
        setEmail("");
        showFlash("Uitnodiging verstuurd.", false);
      } else {
        setError((result as { message?: string }).message ?? "Uitnodiging mislukt.");
      }
    });
  }

  function handleDeactivate(userId: string, displayName: string) {
    if (!confirm(`Weet u zeker dat u ${displayName} wilt deactiveren?`)) return;
    setActionError((prev) => ({ ...prev, [userId]: "" }));
    startTransition(async () => {
      const result = await deactivateUser(userId);
      if (result.success) {
        setUsers((prev) =>
          prev.map((u) => u.userId === userId ? { ...u, status: "inactief" as const } : u),
        );
        showFlash("Gebruiker gedeactiveerd.", false);
      } else {
        setActionError((prev) => ({
          ...prev,
          [userId]: (result as { message?: string }).message ?? "Deactiveren mislukt.",
        }));
      }
    });
  }

  function handleResend(userId: string) {
    startTransition(async () => {
      const result = await resendInvite(userId);
      if (result.success) {
        showFlash("Uitnodiging opnieuw verstuurd.", false);
      } else {
        showFlash((result as { message?: string }).message ?? "Opnieuw versturen mislukt.", true);
      }
    });
  }

  function startEditRoles(userId: string, currentRoleIds: string[]) {
    setEditingRolesFor(userId);
    setEditRoleIds([...currentRoleIds]);
    setShowInvite(false);
  }

  function cancelEditRoles() {
    setEditingRolesFor(null);
    setEditRoleIds([]);
  }

  function toggleRoleId(roleId: string) {
    setEditRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  function handleSaveRoles(userId: string) {
    startTransition(async () => {
      const result = await updateUserRoles(userId, editRoleIds);
      if (result.success) {
        const newRoleNames = roles
          .filter((r) => editRoleIds.includes(r.id))
          .map((r) => r.name);
        setUsers((prev) =>
          prev.map((u) =>
            u.userId === userId
              ? { ...u, roles: newRoleNames, roleIds: [...editRoleIds] }
              : u,
          ),
        );
        cancelEditRoles();
        showFlash("Rollen bijgewerkt.", false);
      } else {
        setActionError((prev) => ({
          ...prev,
          [userId]: (result as { message?: string }).message ?? "Opslaan mislukt.",
        }));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {error   && <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#DC2626" }}><AlertCircle className="h-4 w-4" />{error}</span>}
          {success && <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#059669" }}><CheckCircle2 className="h-4 w-4" />{success}</span>}
        </div>
        {canWrite && (
          <button
            onClick={() => { setShowInvite((v) => !v); cancelEditRoles(); }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "#081D3A" }}
          >
            <Plus className="h-4 w-4" />
            Gebruiker uitnodigen
          </button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="veele-card space-y-3">
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Nieuwe gebruiker uitnodigen</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                E-mailadres <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="veele-input w-full"
                placeholder="naam@organisatie.nl"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Rol <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={isPending}
                className="veele-input w-full"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !email.trim() || !roleId}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#081D3A" }}
            >
              <Mail className="h-3.5 w-3.5" />
              {isPending ? "Versturen…" : "Uitnodiging versturen"}
            </button>
            <button
              type="button"
              onClick={() => { setShowInvite(false); setEmail(""); setError(null); }}
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
              {["Naam", "E-mail", "Rollen", "Status", "Aangemeld", ""].map((h) => (
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
            {users.map((u) => {
              const st          = STATUS_LABELS[u.status];
              const displayName = u.name ?? u.email.split("@")[0];
              const isEditing   = editingRolesFor === u.userId;

              return (
                <>
                  <tr
                    key={u.userId}
                    style={{ borderBottom: isEditing ? "none" : "1px solid #F8FAFC" }}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: "#081D3A" }}>
                      {u.name ?? <span style={{ color: "#94A3B8" }}>—</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#475569" }}>
                      {u.email || <span style={{ color: "#94A3B8" }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
                              style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#CBD5E1" }}>Geen rol</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>
                      {new Date(u.createdAt).toLocaleDateString("nl-NL", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canWrite && (
                        <ActionMenu
                          user={u}
                          displayName={displayName}
                          isPending={isPending}
                          actionError={actionError[u.userId]}
                          onDeactivate={() => handleDeactivate(u.userId, displayName)}
                          onResend={() => handleResend(u.userId)}
                          onEditRoles={() => startEditRoles(u.userId, u.roleIds)}
                        />
                      )}
                    </td>
                  </tr>

                  {/* Inline role editor */}
                  {isEditing && (
                    <tr key={`${u.userId}-edit`} style={{ borderBottom: "1px solid #F8FAFC" }}>
                      <td colSpan={6} className="px-4 pb-4 pt-1">
                        <div
                          className="rounded-lg p-4 space-y-3"
                          style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
                              Rollen bewerken voor <em className="not-italic" style={{ color: "#00B7B3" }}>{displayName}</em>
                            </p>
                            <button
                              type="button"
                              onClick={cancelEditRoles}
                              className="rounded p-1 hover:bg-slate-200 transition-colors"
                            >
                              <X className="h-4 w-4" style={{ color: "#64748B" }} />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            {roles.map((r) => (
                              <label
                                key={r.id}
                                className="flex items-center gap-2 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editRoleIds.includes(r.id)}
                                  onChange={() => toggleRoleId(r.id)}
                                  disabled={isPending}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm" style={{ color: "#374151" }}>{r.name}</span>
                                {r.description && (
                                  <span className="text-xs" style={{ color: "#94A3B8" }}>— {r.description}</span>
                                )}
                              </label>
                            ))}
                          </div>

                          {actionError[u.userId] && (
                            <p className="text-sm" style={{ color: "#DC2626" }}>{actionError[u.userId]}</p>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveRoles(u.userId)}
                              disabled={isPending}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                              style={{ backgroundColor: "#081D3A" }}
                            >
                              {isPending ? "Opslaan…" : "Rollen opslaan"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditRoles}
                              className="rounded-lg px-3 py-1.5 text-sm font-medium border"
                              style={{ borderColor: "#E2E8F0", color: "#475569" }}
                            >
                              Annuleren
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
            <Users className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm">Geen gebruikers gevonden.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionMenu({
  user,
  displayName,
  isPending,
  actionError,
  onDeactivate,
  onResend,
  onEditRoles,
}: {
  user:         UserRow;
  displayName:  string;
  isPending:    boolean;
  actionError:  string | undefined;
  onDeactivate: () => void;
  onResend:     () => void;
  onEditRoles:  () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 hover:bg-slate-100 transition-colors"
        disabled={isPending}
      >
        <MoreHorizontal className="h-4 w-4" style={{ color: "#64748B" }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-lg border bg-white py-1 shadow-lg"
            style={{ borderColor: "#E2E8F0" }}
          >
            <button
              onClick={() => { setOpen(false); onEditRoles(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left"
              style={{ color: "#374151" }}
            >
              <Pencil className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
              Rollen bewerken
            </button>
            {user.status === "uitgenodigd" && (
              <button
                onClick={() => { setOpen(false); onResend(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left"
                style={{ color: "#374151" }}
              >
                <Mail className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
                Uitnodiging opnieuw sturen
              </button>
            )}
            {user.status !== "inactief" && (
              <button
                onClick={() => { setOpen(false); onDeactivate(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-left"
                style={{ color: "#DC2626" }}
              >
                <UserX className="h-3.5 w-3.5" />
                Deactiveren
              </button>
            )}
            {user.status === "inactief" && (
              <p className="px-3 py-2 text-xs" style={{ color: "#94A3B8" }}>
                Geen acties beschikbaar
              </p>
            )}
          </div>
        </>
      )}
      {actionError && (
        <p className="absolute right-0 mt-1 text-xs whitespace-nowrap" style={{ color: "#DC2626" }}>
          {actionError}
        </p>
      )}
    </div>
  );
}
