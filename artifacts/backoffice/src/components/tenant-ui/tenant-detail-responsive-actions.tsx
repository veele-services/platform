"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 1280px)";

function subscribeToDesktop(callback: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerDesktopSnapshot() {
  return true;
}

export interface TenantDetailResponsiveActionsProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function TenantDetailResponsiveActions({
  title = "Acties",
  description,
  className,
  children,
}: TenantDetailResponsiveActionsProps) {
  const isDesktop = React.useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getServerDesktopSnapshot,
  );

  if (isDesktop) {
    return (
      <aside
        className={cn(
          "flex flex-col gap-4 xl:sticky xl:top-40 xl:self-start",
          className,
        )}
      >
        {(title || description) && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-card">
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </aside>
    );
  }

  return (
    <div
      className={cn(
        "sticky bottom-3 z-[var(--z-sticky)] flex justify-end pb-[max(0rem,env(safe-area-inset-bottom))] xl:hidden",
        className,
      )}
    >
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" className="shadow-lg">
            <SlidersHorizontal className="size-4" />
            Acties
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <SheetHeader className="pr-10 text-left">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="mt-5 flex flex-col gap-4">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
