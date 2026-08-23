"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, UserCheck } from "lucide-react";
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
import type {
  PersonnelAuthStatus,
  RoleOption,
  SectorOption,
} from "@/app/actions/personnel";

interface PersonnelDetailActionsProps {
  personnelId: string;
  personnelName: string;
  personnelEmail: string;
  isActive: boolean;
  userId: string | null;
  authStatus: PersonnelAuthStatus;
  roles: RoleOption[];
  sectors: SectorOption[];
  canManagePortal: boolean;
}

export function PersonnelDetailActions({
  personnelId,
  personnelName,
  personnelEmail,
  isActive: initialIsActive,
  userId,
  authStatus,
  roles,
  sectors,
  canManagePortal,
}: PersonnelDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Derived invite state ────────────────────────────────────────────────────
  const hasPortalAccount = Boolean(userId) && authStatus === "active";

  function handleActivateConfirm() {
    setActivateError(null);
    startTransition(async () => {
      try {
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
        if (canManagePortal && !hasPortalAccount) {
          try {
            const inviteResult = await invitePersonnel(personnelId);
            if (inviteResult.success) {
              toast.success("Activatiemail verstuurd");
            } else {
              toast.error(
                `Account geactiveerd, maar de activatiemail is niet verstuurd. ${inviteResult.message ?? "Probeer de uitnodiging opnieuw via Portaal-toegang."}`,
              );
            }
          } catch {
            toast.error(
              "Account geactiveerd, maar de activatiemail kon niet worden verstuurd. Probeer de uitnodiging opnieuw via Portaal-toegang.",
            );
          }
        }
        router.refresh();
      } catch {
        setActivateError(
          "Activeren is niet gelukt. Controleer de verbinding en probeer opnieuw.",
        );
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
            onClick={() => {
              setActivateOpen(true);
              setActivateError(null);
            }}
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
              <strong>{personnelName}</strong> wordt opnieuw ingesteld als
              actief.
              {!hasPortalAccount && (
                <>
                  {" "}
                  Er wordt ook een eenmalige activatiecode gestuurd naar{" "}
                  <strong>{personnelEmail}</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {activateError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {activateError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActivateError(null)}>
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActivateConfirm}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Activeren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit sheet ────────────────────────────────────────────── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-[540px]"
        >
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
