"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
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
import { CustomerForm } from "@/components/customers/CustomerForm";
import { geocodeCustomerLocation, inviteCustomerPortal } from "@/app/actions/customers";
import { GeocodeStatusSummary } from "@/components/geocoding/GeocodeStatus";
import type {
  CustomerDetail,
  SectorOption,
  CustomerTypeOption,
  AccountManagerOption,
} from "@/app/actions/customers";

interface CustomerDetailActionsProps {
  customer:        CustomerDetail;
  sectors:         SectorOption[];
  customerTypes:   CustomerTypeOption[];
  accountManagers: AccountManagerOption[];
  canWriteNotes:   boolean;
}

export function CustomerDetailActions({
  customer,
  sectors,
  customerTypes,
  accountManagers,
  canWriteNotes,
}: CustomerDetailActionsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPortalEmail = Boolean(customer.contactEmail?.trim());

  function handleInviteConfirm() {
    setInviteError(null);
    startTransition(async () => {
      const result = await inviteCustomerPortal(customer.id);
      if (result.success) {
        setInviteOpen(false);
        toast.success("Klantportaal-uitnodiging verstuurd");
      } else {
        setInviteError(result.message ?? "Uitnodiging versturen mislukt.");
      }
    });
  }

  function handleGeocode() {
    setGeocodeError(null);
    startTransition(async () => {
      const result = await geocodeCustomerLocation(customer.id);
      if (result.success) {
        toast.success(result.data?.message ?? "Klantlocatie bijgewerkt");
      } else {
        setGeocodeError(result.message);
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGeocode}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="mr-1.5 h-4 w-4" />
            )}
            Opnieuw geocoden
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setInviteOpen(true)}
            disabled={isPending || !hasPortalEmail}
            title={hasPortalEmail ? "Klantportaal-uitnodiging sturen" : "Contact-e-mailadres ontbreekt"}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-4 w-4" />
            )}
            Portaal uitnodigen
          </Button>

          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Bewerken
          </Button>
        </div>
        <GeocodeStatusSummary
          status={customer.geocodingStatus}
          latitude={customer.latitude}
          longitude={customer.longitude}
          geocodedAt={customer.geocodedAt}
          provider={customer.geocodingProvider}
          confidence={customer.geocodingConfidence}
          error={geocodeError ?? customer.geocodingError}
          compact
        />
      </div>

      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klantportaal-uitnodiging sturen?</AlertDialogTitle>
            <AlertDialogDescription>
              Er wordt een tijdelijk wachtwoord gestuurd naar{" "}
              <strong>{customer.contactEmail}</strong>. De klant moet dit wachtwoord na
              de eerste login direct wijzigen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {inviteError && (
            <p className="text-sm font-medium" style={{ color: "#E02D3C" }}>
              {inviteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInviteError(null)}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleInviteConfirm} disabled={isPending}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Sturen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[560px] sm:max-w-[560px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Klant bewerken</SheetTitle>
            <SheetDescription>Werk de klantgegevens bij.</SheetDescription>
          </SheetHeader>
          <CustomerForm
            mode="edit"
            customerId={customer.id}
            sectors={sectors}
            customerTypes={customerTypes}
            accountManagers={accountManagers}
            canWriteNotes={canWriteNotes}
            onSuccess={() => setSheetOpen(false)}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
