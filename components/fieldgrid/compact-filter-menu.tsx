"use client";

import type { CSSProperties, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CompactFilterMenu({
  children,
  activeCount = 0,
  label = "Zoeken en filteren",
  title = "Zoeken en filteren",
  description = "Verfijn de lijst met de opties hieronder.",
  className,
  contentClassName,
  contentStyle,
  side = "bottom",
}: {
  children: ReactNode;
  activeCount?: number;
  label?: string;
  title?: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const accessibleLabel = activeCount > 0 ? `${label}, ${activeCount} actief` : label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("compact-filter-trigger", className)}
          data-active={activeCount > 0 || undefined}
          aria-label={accessibleLabel}
          title={accessibleLabel}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeCount > 0 && <span aria-hidden="true">{activeCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("compact-filter-popover", contentClassName)}
        align="end"
        side={side}
        sideOffset={8}
        collisionPadding={12}
        style={contentStyle}
      >
        <header className="compact-filter-heading">
          <strong>{title}</strong>
          <small>{description}</small>
        </header>
        {children}
      </PopoverContent>
    </Popover>
  );
}
