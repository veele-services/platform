"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
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
import { setObjectStatus, deleteObject, type ObjectDetail, type CustomerOption } from "@/app/actions/objects";
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setSheetOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Bewerken
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

      {/* Edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
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
