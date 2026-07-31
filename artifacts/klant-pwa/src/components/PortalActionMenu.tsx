"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/shared-ui";

export function PortalActionMenu({
  label = "Acties",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-slate-50"
          style={{ borderColor: "var(--color-border)" }}
        >
          <MoreHorizontal size={17} />
          <span className="sr-only">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label} className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalActionMenuLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        prefetch={external ? false : undefined}
        className="w-full text-sm font-medium"
        style={{ color: "var(--color-primary)" }}
      >
        {children}
      </Link>
    </DropdownMenuItem>
  );
}
