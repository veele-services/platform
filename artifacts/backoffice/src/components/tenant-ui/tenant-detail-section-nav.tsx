"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type TenantDetailSectionNavItem = {
  label: React.ReactNode;
  href: string;
  active?: boolean;
  count?: number;
};

export interface TenantDetailSectionNavProps extends React.HTMLAttributes<HTMLElement> {
  items: TenantDetailSectionNavItem[];
  label?: string;
}

export function TenantDetailSectionNav({
  items,
  label = "Dossiersecties",
  className,
  ...props
}: TenantDetailSectionNavProps) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const activeItem = items.find((item) => item.active) ?? items[0];

  if (!activeItem) return null;

  function navigate(href: string) {
    if (href !== activeItem.href) router.push(href);
  }

  function scroll(direction: -1 | 1) {
    scrollRef.current?.scrollBy({
      left: direction * Math.max(240, scrollRef.current.clientWidth * 0.7),
      behavior: "smooth",
    });
  }

  return (
    <nav
      aria-label={label}
      className={cn(
        "sticky top-16 z-[var(--z-sticky)] rounded-lg border border-border bg-card/95 px-2 py-2 shadow-card backdrop-blur supports-[backdrop-filter]:bg-card/85",
        className,
      )}
      {...props}
    >
      <div className="sm:hidden">
        <Select value={activeItem.href} onValueChange={navigate}>
          <SelectTrigger aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                {item.label}
                {typeof item.count === "number" && item.count > 0
                  ? ` (${item.count})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Dossiersecties naar links schuiven"
          onClick={() => scroll(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Tabs
            value={activeItem.href}
            onValueChange={navigate}
            activationMode="manual"
          >
            <TabsList className="h-auto min-w-max justify-start bg-transparent p-0">
              {items.map((item) => (
                <TabsTrigger
                  key={item.href}
                  value={item.href}
                  className="min-h-10 gap-1.5 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none"
                >
                  <span>{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                      {item.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Dossiersecties naar rechts schuiven"
          onClick={() => scroll(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
