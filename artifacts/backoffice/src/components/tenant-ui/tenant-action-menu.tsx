"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TenantActionMenuItem = {
  id: string;
  label: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect?: (event: Event) => void;
};

export interface TenantActionMenuProps {
  actions: TenantActionMenuItem[];
  label?: string;
  align?: "start" | "center" | "end";
  trigger?: React.ReactNode;
}

export function TenantActionMenu({
  actions,
  label = "Acties",
  align = "end",
  trigger,
}: TenantActionMenuProps) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon" aria-label={label}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44">
        {actions.map((action) => (
          <React.Fragment key={action.id}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            {action.href ? (
              <DropdownMenuItem
                asChild
                disabled={action.disabled}
                className={cn(action.destructive && "text-destructive focus:text-destructive")}
              >
                <Link href={action.href} className="flex items-center gap-2">
                  {action.icon}
                  {action.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={action.disabled}
                onSelect={action.onSelect}
                className={cn(action.destructive && "text-destructive focus:text-destructive")}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
