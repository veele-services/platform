"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2, Mail, UserX, ShieldOff, ShieldCheck,
  Loader2, KeyRound, Pencil, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  invitePersonnel,
  updatePersonnelEmail,
  setPersonnelAuthBan,
  type PersonnelAuthStatus,
} from "@/app/actions/personnel";
import { sendPasswordReset } from "@/app/actions/auth";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PersonnelAuthStatus,
  { Icon: React.ComponentType<{ className?: string }>; color: string; bg: string; label: string }
> = {
  none:     { Icon: UserX,        color: "#94A3B8", bg: "#F1F5F9", label: "Nog geen account"      },
  invited:  { Icon: Mail,         color: "#92400E", bg: "#FEF3C7", label: "Tijdelijk wachtwoord verstuurd" },
  active:   { Icon: CheckCircle2, color: "#065F46", bg: "#D1FAE5", label: "Actief"                },
  disabled: { Icon: ShieldOff,    color: "#64748B", bg: "#F1F5F9", label: "Account gedeactiveerd" },
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface PersonnelPortalAccessCardProps {
  personnelId:    string;
  personnelEmail: string;
  authStatus:     PersonnelAuthStatus;
  inviteSentAt:   string | null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PersonnelPortalAccessCard({
  personnelId,
  personnelEmail,
  authStatus:  initialStatus,
  inviteSentAt,
}: PersonnelPortalAccessCardProps) {
  const [status,         setStatus]         = useState(initialStatus);
  const [email,          setEmail]          = useState(personnelEmail);
  const [editingEmail,   setEditingEmail]   = useState(false);
  const [emailDraft,     setEmailDraft]     = useState(personnelEmail);
  const [inviteOpen,     setInviteOpen]     = useState(false);
  const [banOpen,        setBanOpen]        = useState(false);
  const [unbanOpen,      setUnbanOpen]      = useState(false);
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);
  const [banErrorMsg,    setBanErrorMsg]    = useState<string | null>(null);
  const [unbanErrorMsg,  setUnbanErrorMsg]  = useState<string | null>(null);
  const [localInvitedAt, setLocalInvitedAt] = useState<string | null>(null);
  const [isPending,      startTransition]   = useTransition();

  const effectiveStatus   = localInvitedAt && status === "none" ? "invited" : status;
  const effectiveSentAt   = localInvitedAt ?? inviteSentAt;
  const { Icon, color, bg, label } = STATUS_CONFIG[effectiveStatus];

  // ── handlers ─────────────────────────────────────────────────────────────────

  function handleSaveEmail() {
    const trimmed = emailDraft.trim().toLowerCase();
    if (!trimmed || trimmed === email) return;
    startTransition(async () => {
      const result = await updatePersonnelEmail(personnelId, trimmed);
      if (result.success) {
        setEmail(trimmed);
        setEditingEmail(false);
        toast.success("E-mailadres bijgewerkt");
      } else {
        toast.error(result.message ?? "E-mailadres bijwerken mislukt.");
      }
    });
  }

  function handleInviteConfirm() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await invitePersonnel(personnelId);
      if (result.success) {
        setLocalInvitedAt(new Date().toISOString());
        setStatus((prev) => (prev === "none" ? "invited" : prev));
        setInviteOpen(false);
        toast.success("Tijdelijk wachtwoord verstuurd");
      } else {
        setErrorMsg(result.message ?? "Uitnodiging mislukt.");
      }
    });
  }

  function handlePasswordReset() {
    startTransition(async () => {
      const result = await sendPasswordReset(personnelId);
      if (result.success) {
        toast.success("Herstelcode per e-mail verstuurd");
      } else {
        toast.error(result.message ?? "Wachtwoord-reset mislukt.");
      }
    });
  }

  function handleBanConfirm() {
    setBanErrorMsg(null);
    startTransition(async () => {
      const result = await setPersonnelAuthBan(personnelId, true);
      if (result.success) {
        setStatus("disabled");
        setBanOpen(false);
        toast.success("Account geblokkeerd");
      } else {
        setBanErrorMsg(result.message ?? "Blokkeren mislukt.");
      }
    });
  }

  function handleUnbanConfirm() {
    setUnbanErrorMsg(null);
    startTransition(async () => {
      const result = await setPersonnelAuthBan(personnelId, false);
      if (result.success) {
        setStatus("active");
        setUnbanOpen(false);
        toast.success("Account geheractiveerd");
      } else {
        setUnbanErrorMsg(result.message ?? "Heractiveren mislukt.");
      }
    });
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="veele-card">
      <h2 className="font-heading text-sm font-semibold mb-4" style={{ color: "#081D3A" }}>
        Portaal-toegang
      </h2>

      {/* Status chip */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
          style={{ backgroundColor: bg, color }}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span>
            {label}
            {effectiveStatus === "active" && (
              <span className="ml-1 font-normal text-xs" style={{ color: "#64748B" }}>
                — {email}
              </span>
            )}
          </span>
        </span>

        {effectiveStatus === "invited" && effectiveSentAt && (
          <span className="text-xs" style={{ color: "#94A3B8" }}>
            op{" "}
            {new Date(effectiveSentAt).toLocaleDateString("nl-NL", {
              day: "2-digit", month: "short", year: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Email field — editable only when no account exists */}
      {effectiveStatus === "none" && (
        <div className="mb-4">
          {editingEmail ? (
            <div className="flex items-center gap-2">
              <Input
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                type="email"
                className="h-8 text-sm"
                placeholder="E-mailadres voor uitnodiging"
                disabled={isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEmail();
                  if (e.key === "Escape") { setEditingEmail(false); setEmailDraft(email); }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={handleSaveEmail}
                disabled={isPending || !emailDraft.trim() || emailDraft.trim().toLowerCase() === email}
                title="Opslaan"
              >
                {isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" style={{ color: "#00B7B3" }} />
                }
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={() => { setEditingEmail(false); setEmailDraft(email); }}
                disabled={isPending}
                title="Annuleren"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm" style={{ color: "#475569" }}>{email}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => { setEmailDraft(email); setEditingEmail(true); }}
                title="E-mailadres corrigeren voor uitnodiging"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Invite / re-invite — only for none or invited */}
        {(effectiveStatus === "none" || effectiveStatus === "invited") && (
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={isPending}
          >
            {isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Mail className="mr-1.5 h-4 w-4" />
            }
            {effectiveStatus === "none" ? "Uitnodigen" : "Opnieuw uitnodigen"}
          </Button>
        )}

        {/* Password reset — only for active accounts */}
        {effectiveStatus === "active" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePasswordReset}
              disabled={isPending}
            >
              {isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <KeyRound className="mr-1.5 h-4 w-4" />
              }
              Wachtwoord reset
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBanOpen(true)}
              disabled={isPending}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <ShieldOff className="mr-1.5 h-4 w-4" />
              }
              Blokkeer account
            </Button>
          </>
        )}

        {/* Unban — only for disabled accounts */}
        {effectiveStatus === "disabled" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUnbanOpen(true)}
            disabled={isPending}
            className="border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
          >
            {isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <ShieldCheck className="mr-1.5 h-4 w-4" />
            }
            Heractiveer account
          </Button>
        )}
      </div>

      {/* Explanation */}
      {effectiveStatus !== "active" && effectiveStatus !== "disabled" && (
        <p className="text-xs" style={{ color: "#94A3B8" }}>
          Na uitnodiging ontvangt het personeelslid een tijdelijk wachtwoord. Bij de eerste login
          moet dit direct worden gewijzigd.
        </p>
      )}

      {effectiveStatus === "disabled" && (
        <p className="text-xs" style={{ color: "#94A3B8" }}>
          Dit account is geblokkeerd. Het personeelslid kan niet inloggen op de Personeels-PWA.
          Klik op &ldquo;Heractiveer account&rdquo; om de blokkade op te heffen.
        </p>
      )}

      {/* ── Invite confirmation dialog ──────────────────────────────────────── */}
      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {effectiveStatus === "none" ? "Uitnodiging sturen?" : "Uitnodiging opnieuw sturen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {effectiveStatus === "none" ? (
                <>
                  Er wordt een tijdelijk wachtwoord gestuurd naar <strong>{email}</strong>. Het
                  personeelslid moet dit na de eerste login direct wijzigen.
                </>
              ) : (
                <>
                  Er wordt een nieuw tijdelijk wachtwoord gestuurd naar <strong>{email}</strong>.
                  Het vorige tijdelijke wachtwoord vervalt.
                </>
              )}
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

      {/* ── Ban confirmation dialog ─────────────────────────────────────────── */}
      <AlertDialog open={banOpen} onOpenChange={setBanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account blokkeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Het personeelslid kan dan niet meer inloggen op de Personeels-PWA. U kunt de blokkade
              op elk moment opheffen via &ldquo;Heractiveer account&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {banErrorMsg && (
            <p className="text-sm font-medium" style={{ color: "#E02D3C" }}>
              {banErrorMsg}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBanErrorMsg(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanConfirm}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Blokkeer account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Unban confirmation dialog ───────────────────────────────────────── */}
      <AlertDialog open={unbanOpen} onOpenChange={setUnbanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Account heractiveren?</AlertDialogTitle>
            <AlertDialogDescription>
              Het personeelslid kan daarna weer inloggen op de Personeels-PWA met het bestaande
              wachtwoord.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {unbanErrorMsg && (
            <p className="text-sm font-medium" style={{ color: "#E02D3C" }}>
              {unbanErrorMsg}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnbanErrorMsg(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnbanConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Heractiveer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
