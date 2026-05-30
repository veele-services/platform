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
import type { CustomerDetail, SectorOption } from "@/app/actions/customers";

interface CustomerDetailActionsProps {
  customer:      CustomerDetail;
  sectors:       SectorOption[];
  canWriteNotes: boolean;
}

export function CustomerDetailActions({
  customer,
  sectors,
  canWriteNotes,
}: CustomerDetailActionsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setSheetOpen(true)}>
        <Pencil className="mr-1.5 h-4 w-4" />
        Edit
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[520px] sm:max-w-[520px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Edit Customer</SheetTitle>
            <SheetDescription>Update customer details below.</SheetDescription>
          </SheetHeader>
          <CustomerForm
            mode="edit"
            customerId={customer.id}
            sectors={sectors}
            canWriteNotes={canWriteNotes}
            onSuccess={() => setSheetOpen(false)}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
