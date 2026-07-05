"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface TenantFilterDrawerProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  activeCount?: number;
  trigger?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onApply?: () => void;
  onReset?: () => void;
  applyLabel?: React.ReactNode;
  resetLabel?: React.ReactNode;
}

export function TenantFilterDrawer({
  title = "Filters",
  description = "Verfijn de lijst met aanvullende filters.",
  activeCount = 0,
  trigger,
  children,
  footer,
  open,
  onOpenChange,
  onApply,
  onReset,
  applyLabel = "Toepassen",
  resetLabel = "Resetten",
}: TenantFilterDrawerProps) {
  const defaultTrigger = (
    <Button type="button" variant="outline" size="sm">
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {activeCount > 0 && (
        <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger ?? defaultTrigger}</SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 space-y-4 py-4">{children}</div>
        <SheetFooter className="gap-2 sm:space-x-0">
          {footer ?? (
            <>
              {onReset && (
                <Button type="button" variant="outline" onClick={onReset}>
                  {resetLabel}
                </Button>
              )}
              {onApply && (
                <Button
                  type="button"
                  onClick={() => {
                    onApply();
                    onOpenChange?.(false);
                  }}
                >
                  {applyLabel}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
