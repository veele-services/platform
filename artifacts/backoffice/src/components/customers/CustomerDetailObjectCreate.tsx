"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { listCustomerOptions, type CustomerOption } from "@/app/actions/objects";
import type { SectorOption } from "@/app/actions/customers";

interface CustomerDetailObjectCreateProps {
  customerId:   string;
  customerName: string;
  sectors:      SectorOption[];
}

export function CustomerDetailObjectCreate({
  customerId,
  customerName,
  sectors,
}: CustomerDetailObjectCreateProps) {
  const [open, setOpen]           = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  useEffect(() => {
    if (open && customers.length === 0) {
      listCustomerOptions().then(setCustomers);
    }
  }, [open, customers.length]);

  // While customers are loading, show the current customer as a fallback
  // so the form is usable immediately.
  const customerList =
    customers.length > 0
      ? customers
      : [{ id: customerId, name: customerName, code: null }];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Nieuw object
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[520px] sm:max-w-[520px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Nieuw object</SheetTitle>
            <SheetDescription>
              Maak een nieuw object aan voor <strong>{customerName}</strong>.
            </SheetDescription>
          </SheetHeader>
          <ObjectForm
            mode="create"
            preselectedCustomerId={customerId}
            sectors={sectors}
            customers={customerList}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
