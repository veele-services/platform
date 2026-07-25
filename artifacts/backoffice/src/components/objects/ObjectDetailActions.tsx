"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MapPin, MoreHorizontal, Pencil, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ObjectForm } from "@/components/objects/ObjectForm";
import {
  deleteObject,
  geocodeObjectLocation,
  setObjectStatus,
  type CustomerOption,
  type ObjectDetail,
} from "@/app/actions/objects";
import { GeocodeStatusSummary } from "@/components/geocoding/GeocodeStatus";
import type { SectorOption } from "@/app/actions/customers";

interface Props {
  object:    ObjectDetail;
  sectors:   SectorOption[];
  customers: CustomerOption[];
}

export function ObjectDetailActions({ object: obj, sectors, customers }: Props) {
  const router = useRouter();
  const [sheetOpen,  setSheetOpen]    = useState(false);
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [isPending,  startTransition] = useTransition();

  function handleToggleStatus() {
    startTransition(async () => {
      const result = await setObjectStatus(obj.id, !obj.isActive);
      if (result.success) {
        toast.success(obj.isActive ? "Object gedeactiveerd" : "Object geactiveerd");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteObject(obj.id);
      if (result.success) {
        toast.success(`Object "${obj.name}" verwijderd`);
        router.replace("/objects");
      } else {
        toast.error(result.message);
      }
      setDeleteOpen(false);
    });
  }

  function handleGeocode() {
    setGeocodeError(null);
    startTransition(async () => {
      const result = await geocodeObjectLocation(obj.id);
      if (result.success) {
        toast.success(result.data?.message ?? "Objectlocatie bijgewerkt");
      } else {
        setGeocodeError(result.message);
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <div className="space-y-3">
        <GeocodeStatusSummary
          status={obj.geocodingStatus}
          latitude={obj.latitude}
          longitude={obj.longitude}
          geocodedAt={obj.geocodedAt}
          provider={obj.geocodingProvider}
          confidence={obj.geocodingConfidence}
          error={geocodeError ?? obj.geocodingError}
          compact
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setSheetOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Bewerken
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleGeocode} disabled={isPending}>
              <MapPin className="mr-2 h-4 w-4" /> Locatie opnieuw geocoden
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleToggleStatus} disabled={isPending}>
              {obj.isActive ? (
                <><ToggleLeft className="mr-2 h-4 w-4" /> Deactiveren</>
              ) : (
                <><ToggleRight className="mr-2 h-4 w-4" /> Activeren</>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle>Object bewerken</SheetTitle>
            <SheetDescription>Werk de objectgegevens bij.</SheetDescription>
          </SheetHeader>
          {sheetOpen ? (
            <ObjectForm
              mode="edit"
              objectId={obj.id}
              sectors={sectors}
              customers={customers}
              onSuccess={() => setSheetOpen(false)}
              onCancel={() => setSheetOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Object verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert permanent <strong>{obj.name}</strong> en alle gekoppelde gegevens.
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
