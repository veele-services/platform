"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PersonnelForm } from "@/components/personnel/PersonnelForm";
import type { RoleOption, SectorOption } from "@/app/actions/personnel";

interface Props {
  personnelId:   string;
  personnelName: string;
  roles:         RoleOption[];
  sectors:       SectorOption[];
}

export function PersonnelCompetenciesEditButton({ personnelId, personnelName, roles, sectors }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium border transition-colors hover:bg-slate-50"
        style={{ borderColor: "#E2E8F0", color: "#475569" }}
      >
        <Pencil className="h-3 w-3" />
        Bewerken
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[540px] sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Kwalificaties bewerken</SheetTitle>
            <SheetDescription>
              Pas de kwalificaties bij voor <strong>{personnelName}</strong>.
            </SheetDescription>
          </SheetHeader>
          <PersonnelForm
            mode="edit"
            personnelId={personnelId}
            roles={roles}
            sectors={sectors}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
