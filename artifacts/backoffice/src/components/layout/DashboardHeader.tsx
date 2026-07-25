"use client";

import {
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { FeatureHelp } from "@/components/knowledgebase/FeatureHelp";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { GlobalCommandPalette } from "@/components/navigation/GlobalCommandPalette";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BackofficeTenantOption } from "@/lib/auth/tenant";
import { getFieldgridRoute } from "@/lib/navigation/route-registry";
import { usePermissions } from "@/providers/permissions-provider";
import { useSidebar } from "@/providers/sidebar-provider";

type DashboardHeaderProps = {
  userEmail: string;
  userName: string;
  userInitial: string;
  userRole: string;
  currentTenantId: string;
  tenantOptions: BackofficeTenantOption[];
};

export function DashboardHeader({
  userEmail,
  userName,
  userInitial,
  userRole,
  currentTenantId,
  tenantOptions,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { toggle, collapsed, toggleCollapsed } = useSidebar();
  const route = getFieldgridRoute(pathname, "tenant");
  const title = route?.title ?? "Dashboard";
  const help =
    route?.helpDescription && route.helpKey
      ? {
          title: route.title,
          description: route.helpDescription,
        }
      : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="md:hidden"
        aria-label="Navigatie openen"
      >
        <Menu className="size-5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleCollapsed}
        className="hidden md:inline-flex"
        aria-label={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
        title={collapsed ? "Sidebar uitklappen" : "Sidebar inklappen"}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-5" />
        ) : (
          <PanelLeftClose className="size-5" />
        )}
      </Button>

      <div className="min-w-0 flex-1 md:max-w-[16rem] md:flex-none">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-heading text-base font-semibold leading-tight text-foreground sm:text-lg">
            {title}
          </h1>
          {help ? (
            <FeatureHelp
              title={help.title}
              description={help.description}
              placement="bottom"
              showRelatedArticles={false}
              className="size-7 shrink-0 shadow-none"
            />
          ) : null}
        </div>
      </div>

      <GlobalCommandPalette
        scope="tenant"
        permissions={permissions}
        className="hidden md:flex"
      />

      <div className="ml-auto min-w-0">
        <TenantSwitcher
          currentTenantId={currentTenantId}
          tenants={tenantOptions}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {userInitial}
            </span>
            <span className="hidden min-w-0 text-left xl:block">
              <span className="block max-w-[190px] truncate text-sm font-medium text-foreground">
                {userName}
              </span>
              <span className="block max-w-[190px] truncate text-xs text-muted-foreground">
                {userRole}
              </span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground xl:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block truncate text-sm">{userName}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {userEmail}
            </span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {userRole}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User className="size-4" />
              Profiel
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="size-4" />
              Instellingen
            </Link>
          </DropdownMenuItem>
          {permissions.has("kb:view") ? (
            <DropdownMenuItem asChild>
              <Link href="/help">
                <HelpCircle className="size-4" />
                Help en kennisbank
              </Link>
            </DropdownMenuItem>
          ) : null}
          {permissions.has("releases:view") ? (
            <DropdownMenuItem asChild>
              <Link href="/releases">
                <Megaphone className="size-4" />
                Wat is er nieuw?
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Uitloggen
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
