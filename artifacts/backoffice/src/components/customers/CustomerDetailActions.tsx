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
import { CustomerForm } from "@/components/customers/CustomerForm";
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

  return (
    <>
      <Button size="sm" onClick={() => setSheetOpen(true)}>
        <Pencil className="mr-1.5 h-4 w-4" />
        Bewerken
      </Button>

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
