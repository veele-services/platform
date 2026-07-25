"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { FIELDGRID_ROUTE_ICONS } from "@/lib/navigation/route-icons";
import {
  FIELDGRID_ROUTES,
  routeIsVisibleForPermissions,
  type FieldgridRouteDefinition,
  type FieldgridRouteScope,
} from "@/lib/navigation/route-registry";
import { trackUxAnalytics } from "@/lib/ux-analytics";
import { cn } from "@/lib/utils";

const RECENT_ROUTES_STORAGE_KEY = "fieldgrid:recent-command-routes";
const MAX_RECENT_ROUTES = 5;

type GlobalCommandPaletteProps = {
  scope: FieldgridRouteScope;
  permissions?: ReadonlySet<string>;
  platformAdmin?: boolean;
  className?: string;
};

function readRecentRouteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_ROUTES_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberRoute(routeId: string) {
  const next = [
    routeId,
    ...readRecentRouteIds().filter((id) => id !== routeId),
  ].slice(0, MAX_RECENT_ROUTES);
  window.localStorage.setItem(RECENT_ROUTES_STORAGE_KEY, JSON.stringify(next));
}

function appendSearch(href: string, query: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}search=${encodeURIComponent(query)}`;
}

export function GlobalCommandPalette({
  scope,
  permissions = new Set<string>(),
  platformAdmin = false,
  className,
}: GlobalCommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentRouteIds, setRecentRouteIds] = useState<string[]>([]);

  const routes = useMemo(
    () =>
      (FIELDGRID_ROUTES as readonly FieldgridRouteDefinition[]).filter(
        (route) =>
          route.scope === scope &&
          route.releaseVisibility !== "hidden" &&
          (!route.adminOnly || platformAdmin) &&
          routeIsVisibleForPermissions(route, permissions),
      ),
    [permissions, platformAdmin, scope],
  );

  const recentRoutes = useMemo(
    () =>
      recentRouteIds
        .map((id) => routes.find((route) => route.id === id))
        .filter((route): route is FieldgridRouteDefinition => Boolean(route)),
    [recentRouteIds, routes],
  );

  const searchableRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          route.searchContext &&
          route.releaseVisibility === "primary" &&
          route.href !== "/planning" &&
          route.href !== "/platform",
      ),
    [routes],
  );

  const navigate = useCallback(
    (
      href: string,
      routeId?: string,
      action: "route_selected" | "scoped_search_selected" = "route_selected",
    ) => {
      if (routeId) {
        rememberRoute(routeId);
        setRecentRouteIds(readRecentRouteIds());
      }
      setOpen(false);
      setQuery("");
      trackUxAnalytics({
        name: "command_palette",
        surface: "navigation",
        action,
        scope,
      });
      router.push(href);
    },
    [router, scope],
  );

  useEffect(() => {
    setRecentRouteIds(readRecentRouteIds());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          const nextOpen = !value;
          if (nextOpen) {
            trackUxAnalytics({
              name: "command_palette",
              surface: "navigation",
              action: "opened",
              scope,
            });
          }
          return nextOpen;
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scope]);

  const trimmedQuery = query.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
          trackUxAnalytics({
            name: "command_palette",
            surface: "navigation",
            action: "opened",
            scope,
          });
        }}
        className={cn(
          "min-w-0 justify-start gap-2 text-muted-foreground md:w-[min(34vw,28rem)]",
          className,
        )}
        aria-label="Navigeren en zoeken"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate sm:inline">Navigeren en zoeken</span>
        <span className="sm:hidden">Zoeken</span>
        <span className="ml-auto hidden items-center gap-0.5 lg:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setQuery("");
        }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Zoek een pagina of opdracht…"
        />
        <CommandList>
          <CommandEmpty>
            Geen passende pagina of opdracht gevonden.
          </CommandEmpty>

          {trimmedQuery.length > 0 && searchableRoutes.length > 0 ? (
            <CommandGroup heading="Zoek binnen een onderdeel">
              {searchableRoutes.map((route) => {
                const Icon = FIELDGRID_ROUTE_ICONS[route.icon];
                return (
                  <CommandItem
                    key={`search-${route.id}`}
                    value={`zoek ${trimmedQuery} in ${route.title}`}
                    onSelect={() =>
                      navigate(
                        appendSearch(route.href, trimmedQuery),
                        route.id,
                        "scoped_search_selected",
                      )
                    }
                  >
                    <Icon />
                    Zoek “{trimmedQuery}” in {route.title}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {trimmedQuery.length === 0 && scope === "tenant" ? (
            <>
              <CommandGroup heading="Opdrachten">
                {permissions.has("planning:read") ? (
                  <CommandItem
                    value="planning vandaag"
                    onSelect={() => navigate("/planning")}
                  >
                    <CalendarDays />
                    Planning van vandaag
                    <CommandShortcut>G P</CommandShortcut>
                  </CommandItem>
                ) : null}
                {permissions.has("assignments:write") ? (
                  <CommandItem
                    value="nieuwe opdracht"
                    onSelect={() => navigate("/assignments?create=1")}
                  >
                    <ClipboardCommandIcon />
                    Nieuwe opdracht
                  </CommandItem>
                ) : null}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          {trimmedQuery.length === 0 && recentRoutes.length > 0 ? (
            <>
              <CommandGroup heading="Recent bekeken">
                {recentRoutes.map((route) => {
                  const Icon = FIELDGRID_ROUTE_ICONS[route.icon];
                  return (
                    <CommandItem
                      key={`recent-${route.id}`}
                      value={`recent ${route.title}`}
                      onSelect={() => navigate(route.href, route.id)}
                    >
                      <Icon />
                      {route.title}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : null}

          <CommandGroup heading="Pagina’s">
            {routes.map((route) => {
              const Icon = FIELDGRID_ROUTE_ICONS[route.icon];
              return (
                <CommandItem
                  key={route.id}
                  value={`${route.title} ${route.breadcrumb} ${route.searchContext ?? ""}`}
                  aria-current={
                    pathname === route.href ||
                    (route.href !== "/" &&
                      pathname.startsWith(`${route.href}/`))
                      ? "page"
                      : undefined
                  }
                  onSelect={() => navigate(route.href, route.id)}
                >
                  <Icon />
                  {route.title}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function ClipboardCommandIcon() {
  const Icon = FIELDGRID_ROUTE_ICONS.clipboard;
  return <Icon />;
}
