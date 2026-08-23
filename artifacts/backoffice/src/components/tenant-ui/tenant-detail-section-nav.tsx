"use client";

import * as React from "react";
import Link from "next/link";
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
  const configuredActiveHref = items.find((item) => item.active)?.href;
  const [activeHref, setActiveHref] = React.useState(
    configuredActiveHref ?? items[0]?.href ?? "",
  );
  const activeItem =
    items.find((item) => item.href === activeHref) ??
    items.find((item) => item.active) ??
    items[0];

  React.useEffect(() => {
    if (configuredActiveHref) setActiveHref(configuredActiveHref);
  }, [configuredActiveHref]);

  if (!activeItem) return null;

  function navigate(href: string) {
    setActiveHref(href);
    if (href !== activeItem.href) router.push(href);
  }

  function scroll(direction: -1 | 1) {
    scrollRef.current?.scrollBy({
      left: direction * Math.max(240, scrollRef.current.clientWidth * 0.7),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
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
          className="min-w-0 flex-1 overflow-x-auto scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max justify-start" role="list">
            {items.map((item) => (
              <span key={item.href} role="listitem">
                <Link
                  href={item.href}
                  aria-current={item.href === activeHref ? "page" : undefined}
                  onClick={() => setActiveHref(item.href)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.href === activeHref &&
                      "bg-accent text-accent-foreground shadow-none",
                  )}
                >
                  <span>{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                      {item.count}
                    </span>
                  )}
                </Link>
              </span>
            ))}
          </div>
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
