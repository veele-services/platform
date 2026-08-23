"use client";

import * as React from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
} from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  filterRecentContextsForPermissions,
  parseRecentContexts,
  RECENT_CONTEXT_EVENT,
  recentContextStorageKey,
  type RecentContext,
  type RecentContextKind,
} from "@/lib/navigation/recent-context";
import {
  usePermissions,
  usePermissionsPrincipalId,
  usePermissionsTenantId,
} from "@/providers/permissions-provider";

export type DashboardPersona =
  | "planner"
  | "administration"
  | "management"
  | "all";

const PERSONA_STORAGE_KEY = "fieldgrid:dashboard-persona";

const personaLabels: Record<DashboardPersona, string> = {
  planner: "Planning",
  administration: "Administratie",
  management: "Management",
  all: "Alles",
};

const contextIcons: Record<RecentContextKind, React.ElementType> = {
  assignment: ClipboardList,
  customer: BriefcaseBusiness,
  object: Building2,
  planning: CalendarDays,
};

function readPersona(fallback: DashboardPersona): DashboardPersona {
  const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
  return stored && stored in personaLabels
    ? (stored as DashboardPersona)
    : fallback;
}

export function DashboardPersonaFocus({
  defaultPersona,
  planning,
  administration,
  management,
}: {
  defaultPersona: DashboardPersona;
  planning: React.ReactNode;
  administration: React.ReactNode;
  management: React.ReactNode;
}) {
  const [persona, setPersona] =
    React.useState<DashboardPersona>(defaultPersona);

  React.useEffect(() => {
    setPersona(readPersona(defaultPersona));
  }, [defaultPersona]);

  const panels = {
    planner: planning,
    administration,
    management,
  };
  const order: Array<Exclude<DashboardPersona, "all">> =
    persona === "all" ? ["planner", "administration", "management"] : [persona];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Werkgebied
        </p>
        <ToggleGroup
          type="single"
          value={persona}
          onValueChange={(value) => {
            if (!(value in personaLabels)) return;
            const next = value as DashboardPersona;
            setPersona(next);
            window.localStorage.setItem(PERSONA_STORAGE_KEY, next);
          }}
          aria-label="Dashboardfocus"
          variant="outline"
          size="sm"
          className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {(Object.keys(personaLabels) as DashboardPersona[]).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`Toon ${personaLabels[value].toLowerCase()} als eerste`}
              className="relative w-full whitespace-nowrap"
            >
              {personaLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {order.map((key, index) => (
        <div
          key={key}
          className={index === 0 && persona !== "all" ? "rounded-lg" : ""}
        >
          {panels[key]}
        </div>
      ))}
    </div>
  );
}

export function DashboardResumePanel() {
  const [items, setItems] = React.useState<RecentContext[]>([]);
  const permissions = usePermissions();
  const tenantId = usePermissionsTenantId();
  const principalId = usePermissionsPrincipalId();
  const storageKey =
    tenantId && principalId
      ? recentContextStorageKey(tenantId, principalId)
      : null;

  React.useEffect(() => {
    if (!storageKey) {
      setItems([]);
      return;
    }
    const read = () =>
      setItems(
        filterRecentContextsForPermissions(
          parseRecentContexts(window.localStorage.getItem(storageKey)),
          permissions,
        ).slice(0, 4),
      );
    read();
    window.addEventListener(RECENT_CONTEXT_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(RECENT_CONTEXT_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [permissions, storageKey]);

  if (items.length === 0) {
    return (
      <Empty className="min-h-44 border border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>Nog geen recente dossiers</EmptyTitle>
          <EmptyDescription>
            Bezochte opdrachten, klanten, objecten en planning verschijnen hier
            automatisch.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const Icon = contextIcons[item.kind];
        return (
          <li key={`${item.kind}-${item.href}`}>
            <Link
              href={item.href}
              className="flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {item.detail}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
