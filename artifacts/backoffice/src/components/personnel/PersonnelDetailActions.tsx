"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import type { RoleOption } from "@/app/actions/personnel";

interface PersonnelDetailActionsProps {
  personnelId:   string;
  personnelName: string;
  roles:         RoleOption[];
}

export function PersonnelDetailActions({
  personnelId,
  personnelName,
  roles,
}: PersonnelDetailActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-4 w-4" />
        Bewerken
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
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
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
