"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  UserX,
  Users,
} from "lucide-react";
import {
  inviteTenantUser as inviteUser,
  updateTenantUserRoles as updateUserRoles,
} from "@/app/actions/tenant-roles";
import {
  deactivateUser,
  resendInvite,
  sendUserPasswordReset,
} from "@/app/actions/settings";
import type {
  TenantRoleRow as RoleRow,
  TenantUserRoleRow as UserRow,
} from "@/app/actions/tenant-roles";
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

const STATUS_LABELS: Record<UserRow["status"], { label: string; bg: string; color: string }> = {
  actief: { label: "Actief", bg: "#D1FAE5", color: "#065F46" },
  uitgenodigd: { label: "Uitgenodigd", bg: "#EFF6FF", color: "#1D4ED8" },
  inactief: { label: "Inactief", bg: "#FEE2E2", color: "#991B1B" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "Nog niet ingelogd";
  return new Date(value).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  users: UserRow[];
  roles: RoleRow[];
  canWrite: boolean;
}

export function GebruikersView({ users: initialUsers, roles, canWrite }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const editingUser = users.find((user) => user.userId === editingRolesFor) ?? null;

  function showFlash(msg: string, isErr: boolean) {
    if (isErr) {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteUser({ email: email.trim(), roleId });
      if (result.success) {
        setInviteOpen(false);
        setEmail("");
        showFlash("Uitnodiging verstuurd.", false);
      } else {
        setError((result as { message?: string }).message ?? "Uitnodiging mislukt.");
      }
    });
  }

  function handleDeactivate(userId: string) {
    setActionError((prev) => ({ ...prev, [userId]: "" }));
    startTransition(async () => {
      const result = await deactivateUser(userId);
      if (result.success) {
        setUsers((prev) =>
          prev.map((user) => user.userId === userId ? { ...user, status: "inactief" as const } : user),
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
        showFlash("Herstelmail verstuurd.", false);
      } else {
        showFlash((result as { message?: string }).message ?? "Opnieuw versturen mislukt.", true);
      }
    });
  }

  function handlePasswordReset(userId: string) {
    startTransition(async () => {
      const result = await sendUserPasswordReset(userId);
      if (result.success) {
        showFlash("Herstelcode per e-mail verstuurd.", false);
      } else {
        showFlash((result as { message?: string }).message ?? "Herstelcode versturen mislukt.", true);
      }
    });
  }

  function startEditRoles(userId: string, currentRoleIds: string[]) {
    setEditingRolesFor(userId);
    setEditRoleIds([...currentRoleIds]);
    setInviteOpen(false);
  }

  function cancelEditRoles() {
    setEditingRolesFor(null);
    setEditRoleIds([]);
  }

  function toggleRoleId(nextRoleId: string) {
    setEditRoleIds((prev) =>
      prev.includes(nextRoleId) ? prev.filter((id) => id !== nextRoleId) : [...prev, nextRoleId],
    );
  }

  function handleSaveRoles(userId: string) {
    startTransition(async () => {
      const result = await updateUserRoles(userId, editRoleIds);
      if (result.success) {
        const newRoleNames = roles
          .filter((role) => editRoleIds.includes(role.id))
          .map((role) => role.name);
        setUsers((prev) =>
          prev.map((user) =>
            user.userId === userId
              ? { ...user, roles: newRoleNames, roleIds: [...editRoleIds] }
              : user,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {error && <Flash tone="error" text={error} />}
          {success && <Flash tone="success" text={success} />}
        </div>
        {canWrite && (
          <InviteUserSheet
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            email={email}
            roleId={roleId}
            roles={roles}
            pending={isPending}
            error={error}
            onEmailChange={setEmail}
            onRoleChange={setRoleId}
            onSubmit={handleInvite}
          />
        )}
      </div>

      <div className="veele-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
              {["Naam", "E-mail", "Rollen", "Status", "Toegevoegd", "Laatste login", ""].map((header) => (
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
            {users.map((user) => {
              const status = STATUS_LABELS[user.status];
              const displayName = user.name ?? user.email.split("@")[0];

              return (
                <tr
                  key={user.userId}
                  style={{ borderBottom: "1px solid #F8FAFC" }}
                  className="hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "#081D3A" }}>
                    {user.name ?? <span style={{ color: "#94A3B8" }}>-</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#475569" }}>
                    {user.email || <span style={{ color: "#94A3B8" }}>-</span>}
                  </td>
                  <td className="px-4 py-3">
                    {user.roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs"
                            style={{ backgroundColor: "#F1F5F9", color: "#475569" }}
                          >
                            {role}
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
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#64748B" }}>
                    {formatDateTime(user.lastSignInAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <UserActionMenu
                        user={user}
                        displayName={displayName}
                        pending={isPending}
                        actionError={actionError[user.userId]}
                        onDeactivate={() => handleDeactivate(user.userId)}
                        onResend={() => handleResend(user.userId)}
                        onPasswordReset={() => handlePasswordReset(user.userId)}
                        onEditRoles={() => startEditRoles(user.userId, user.roleIds)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="py-12 text-center" style={{ color: "#94A3B8" }}>
            <Users className="mx-auto mb-2 h-8 w-8" strokeWidth={1.5} />
            <p className="text-sm">Geen gebruikers gevonden.</p>
          </div>
        )}
      </div>

      <EditRolesSheet
        open={Boolean(editingUser)}
        user={editingUser}
        roles={roles}
        selectedRoleIds={editRoleIds}
        pending={isPending}
        actionError={editingUser ? actionError[editingUser.userId] : undefined}
        onOpenChange={(open) => !open && cancelEditRoles()}
        onToggleRole={toggleRoleId}
        onSubmit={() => editingUser && handleSaveRoles(editingUser.userId)}
      />
    </div>
  );
}

function InviteUserSheet({
  open,
  onOpenChange,
  email,
  roleId,
  roles,
  pending,
  error,
  onEmailChange,
  onRoleChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  roleId: string;
  roles: RoleRow[];
  pending: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" />
          Gebruiker uitnodigen
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Gebruiker uitnodigen</SheetTitle>
          <SheetDescription>Kies een rol en verstuur een uitnodiging per e-mail.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-xs font-medium" style={{ color: "#374151" }}>
            E-mailadres
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="veele-input mt-1 w-full"
              placeholder="naam@organisatie.nl"
              disabled={pending}
              required
            />
          </label>
          <label className="block text-xs font-medium" style={{ color: "#374151" }}>
            Rol
            <select
              value={roleId}
              onChange={(event) => onRoleChange(event.target.value)}
              disabled={pending}
              className="veele-input mt-1 w-full"
              required
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !email.trim() || !roleId}>
            <Mail className="h-4 w-4" />
            {pending ? "Versturen..." : "Uitnodiging versturen"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditRolesSheet({
  open,
  user,
  roles,
  selectedRoleIds,
  pending,
  actionError,
  onOpenChange,
  onToggleRole,
  onSubmit,
}: {
  open: boolean;
  user: UserRow | null;
  roles: RoleRow[];
  selectedRoleIds: string[];
  pending: boolean;
  actionError: string | undefined;
  onOpenChange: (open: boolean) => void;
  onToggleRole: (roleId: string) => void;
  onSubmit: () => void;
}) {
  const displayName = user?.name ?? user?.email.split("@")[0] ?? "gebruiker";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Rollen bewerken</SheetTitle>
          <SheetDescription>Wijzig de actieve rollen voor {displayName}.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-3">
            {roles.map((role) => (
              <label key={role.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3">
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={() => onToggleRole(role.id)}
                  disabled={pending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{role.name}</span>
                  {role.description && <span className="mt-0.5 block text-xs text-muted-foreground">{role.description}</span>}
                </span>
              </label>
            ))}
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Opslaan..." : "Rollen opslaan"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UserActionMenu({
  user,
  displayName,
  pending,
  actionError,
  onDeactivate,
  onResend,
  onPasswordReset,
  onEditRoles,
}: {
  user: UserRow;
  displayName: string;
  pending: boolean;
  actionError: string | undefined;
  onDeactivate: () => void;
  onResend: () => void;
  onPasswordReset: () => void;
  onEditRoles: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="inline-flex items-center justify-end">
      <TenantActionMenu
        actions={[
          {
            id: "roles",
            label: "Rollen bewerken",
            icon: <Pencil className="h-3.5 w-3.5" />,
            disabled: pending,
            onSelect: () => onEditRoles(),
          },
          {
            id: "password-reset",
            label: "Resetcode mailen",
            icon: <Mail className="h-3.5 w-3.5" />,
            disabled: pending,
            onSelect: () => onPasswordReset(),
          },
          ...(user.status === "uitgenodigd"
            ? [{
                id: "resend",
                label: "Herstelmail versturen",
                icon: <RotateCcw className="h-3.5 w-3.5" />,
                disabled: pending,
                onSelect: () => onResend(),
              }]
            : []),
          ...(user.status !== "inactief"
            ? [{
                id: "deactivate",
                label: "Deactiveren",
                icon: <UserX className="h-3.5 w-3.5" />,
                destructive: true,
                separatorBefore: true,
                disabled: pending,
                onSelect: (event: Event) => {
                  event.preventDefault();
                  setConfirmOpen(true);
                },
              }]
            : []),
        ]}
      />
      <TenantConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Gebruiker deactiveren?"
        description={`Weet u zeker dat u ${displayName} wilt deactiveren?`}
        confirmLabel="Deactiveren"
        destructive
        onConfirm={onDeactivate}
      />
      {actionError && <p className="ml-2 text-xs text-destructive">{actionError}</p>}
    </div>
  );
}

function Flash({ tone, text }: { tone: "success" | "error"; text: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <span className={tone === "success" ? "inline-flex items-center gap-1.5 text-sm text-emerald-700" : "inline-flex items-center gap-1.5 text-sm text-destructive"}>
      <Icon className="h-4 w-4" />
      {text}
    </span>
  );
}
