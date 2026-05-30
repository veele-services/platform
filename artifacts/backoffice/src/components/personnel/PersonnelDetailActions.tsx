"use client";

import { useState, useTransition } from "react";
import { Pencil, Mail, CheckCircle2, Loader2 } from "lucide-react";
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
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import { invitePersonnel } from "@/app/actions/personnel";
import type { RoleOption } from "@/app/actions/personnel";

interface PersonnelDetailActionsProps {
  personnelId:   string;
  personnelName: string;
  personnelEmail: string;
  userId:        string | null;
  roles:         RoleOption[];
}

export function PersonnelDetailActions({
  personnelId,
  personnelName,
  personnelEmail,
  userId,
  roles,
}: PersonnelDetailActionsProps) {
  const [editOpen, setEditOpen]         = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [inviteSent, setInviteSent]     = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();

  function handleInviteConfirm() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await invitePersonnel(personnelId);
      if (result.success) {
        setInviteSent(true);
      } else {
        setErrorMsg(result.message ?? "Uitnodiging mislukt.");
      }
    });
  }

  const accountLinked = Boolean(userId);
  const inviteDisabled = accountLinked || inviteSent || isPending;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* ── Invite / account status ─────────────────────── */}
        {accountLinked ? (
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#00B7B3" }}>
            <CheckCircle2 className="h-4 w-4" />
            Account gekoppeld
          </div>
        ) : inviteSent ? (
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#00B7B3" }}>
            <CheckCircle2 className="h-4 w-4" />
            Uitnodiging verstuurd
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={inviteDisabled}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Uitnodiging sturen
          </Button>
        )}

        {/* ── Edit button ──────────────────────────────────── */}
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Bewerken
        </Button>
      </div>

      {/* ── Invite confirmation dialog ───────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uitnodiging sturen?</AlertDialogTitle>
            <AlertDialogDescription>
              Er wordt een activatielink gestuurd naar{" "}
              <strong>{personnelEmail}</strong>. De medewerker kan daarna
              inloggen op het personeelsportaal.
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
              Uitnodiging sturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit sheet ───────────────────────────────────── */}
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
            onSuccess={() => setEditOpen(false)}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
