"use client";

import { useState, useTransition } from "react";
import { Pencil, Mail, CheckCircle2, Loader2, KeyRound, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import { invitePersonnel, setPersonnelStatus } from "@/app/actions/personnel";
import { sendPasswordReset } from "@/app/actions/auth";
import type { PersonnelAuthStatus, RoleOption, SectorOption } from "@/app/actions/personnel";

interface PersonnelDetailActionsProps {
  personnelId:    string;
  personnelName:  string;
  personnelEmail: string;
  isActive:       boolean;
  userId:         string | null;
  inviteSentAt:   string | null;
  authStatus:     PersonnelAuthStatus;
  roles:          RoleOption[];
  sectors:        SectorOption[];
}

export function PersonnelDetailActions({
  personnelId,
  personnelName,
  personnelEmail,
  isActive:    initialIsActive,
  userId,
  inviteSentAt,
  authStatus,
  roles,
  sectors,
}: PersonnelDetailActionsProps) {
  const [editOpen,         setEditOpen]         = useState(false);
  const [inviteOpen,       setInviteOpen]        = useState(false);
  const [resetOpen,        setResetOpen]         = useState(false);
  const [activateOpen,     setActivateOpen]      = useState(false);
  const [localInviteSent,  setLocalInviteSent]   = useState(false);
  const [isActive,         setIsActive]          = useState(initialIsActive);
  const [errorMsg,         setErrorMsg]          = useState<string | null>(null);
  const [activateError,    setActivateError]     = useState<string | null>(null);
  const [isPending,        startTransition]      = useTransition();

  // ── Derived invite state ────────────────────────────────────────────────────
  const hasPortalAccount = Boolean(userId) && authStatus === "active";
  const isInvited        = authStatus === "invited" || (Boolean(inviteSentAt) && !hasPortalAccount);
  const isNone           = !hasPortalAccount && !isInvited && !localInviteSent;

  function handleInviteConfirm() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await invitePersonnel(personnelId);
      if (result.success) {
        setLocalInviteSent(true);
        setInviteOpen(false);
        toast.success("Tijdelijk wachtwoord verstuurd");
      } else {
        setErrorMsg(result.message ?? "Uitnodiging mislukt.");
      }
    });
  }

  function handleResetConfirm() {
    startTransition(async () => {
      const result = await sendPasswordReset(personnelId);
      if (result.success) {
        setResetOpen(false);
        toast.success("Wachtwoord-reset e-mail verstuurd");
      } else {
        toast.error(result.message ?? "Wachtwoord-reset mislukt.");
        setResetOpen(false);
      }
    });
  }

  function handleActivateConfirm() {
    setActivateError(null);
    startTransition(async () => {
      const activateResult = await setPersonnelStatus(personnelId, true);
      if (!activateResult.success) {
        setActivateError(activateResult.message ?? "Activeren mislukt.");
        return;
      }
      setIsActive(true);
      setActivateOpen(false);
      toast.success("Account geactiveerd");
      // Resend invite whenever there is no active portal account yet
      // (covers both "never invited" and "invite expired" states)
      if (!hasPortalAccount) {
        const inviteResult = await invitePersonnel(personnelId);
        if (inviteResult.success) {
          setLocalInviteSent(true);
          toast.success("Tijdelijk wachtwoord verstuurd");
        }
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">

        {/* ── Inactive badge + activate button ────────────────────────── */}
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setActivateOpen(true); setActivateError(null); }}
            disabled={isPending}
            className="border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="mr-1.5 h-4 w-4" />
            )}
            Activeer account
          </Button>
        )}

        {/* ── Invite / account section ────────────────────────────────── */}
        {hasPortalAccount ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#00B7B3" }}>
              <CheckCircle2 className="h-4 w-4" />
              Portaal actief
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setResetOpen(true)}
              disabled={isPending}
            >
              <KeyRound className="mr-1.5 h-4 w-4" />
              Wachtwoord reset
            </Button>
          </div>
        ) : isInvited || localInviteSent ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm" style={{ color: "#92400E" }}>
              <Mail className="h-4 w-4" />
              <span>
                Tijdelijk wachtwoord verstuurd
                {inviteSentAt && !localInviteSent && (
                  <span className="ml-1 text-xs" style={{ color: "#94A3B8" }}>
                    ({new Date(inviteSentAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" })})
                  </span>
                )}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
              disabled={isPending}
              title="Uitnodiging opnieuw sturen"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setInviteOpen(true)}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Uitnodiging sturen
          </Button>
        )}

        {/* ── Edit button ────────────────────────────────────────────── */}
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Bewerken
        </Button>
      </div>

      {/* ── Activate confirmation dialog ────────────────────────────── */}
      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account activeren?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{personnelName}</strong> wordt opnieuw ingesteld als actief.
              {!hasPortalAccount && (
                <> Er wordt ook een tijdelijk wachtwoord gestuurd naar <strong>{personnelEmail}</strong>.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {activateError && (
            <p className="text-sm font-medium" style={{ color: "#E02D3C" }}>
              {activateError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActivateError(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivateConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Activeren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Invite confirmation dialog ─────────────────────────────── */}
      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isNone ? "Uitnodiging sturen?" : "Uitnodiging opnieuw sturen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isNone
                ? <>
                    Er wordt een tijdelijk wachtwoord gestuurd naar{" "}
                    <strong>{personnelEmail}</strong>. De medewerker moet dit wachtwoord
                    na de eerste login direct wijzigen.
                  </>
                : <>
                    Er wordt een nieuw tijdelijk wachtwoord gestuurd naar{" "}
                    <strong>{personnelEmail}</strong>. Het vorige tijdelijke wachtwoord
                    vervalt.
                  </>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorMsg && (
            <p className="text-sm font-medium" style={{ color: "#E02D3C" }}>
              {errorMsg}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleInviteConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Sturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Password reset confirmation dialog ────────────────────── */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wachtwoord-reset sturen?</AlertDialogTitle>
            <AlertDialogDescription>
              Er wordt een wachtwoord-reset e-mail gestuurd naar{" "}
              <strong>{personnelEmail}</strong>. De medewerker kan via de link in de e-mail
              een nieuw wachtwoord instellen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Reset sturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit sheet ────────────────────────────────────────────── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-[540px] sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Personeel bewerken</SheetTitle>
            <SheetDescription>
              Werk het record bij voor <strong>{personnelName}</strong>.
            </SheetDescription>
          </SheetHeader>
          <PersonnelForm
            mode="edit"
            personnelId={personnelId}
            roles={roles}
            sectors={sectors}
            onSuccess={() => setEditOpen(false)}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
