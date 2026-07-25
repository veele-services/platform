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
  parseRecentContexts,
  RECENT_CONTEXT_EVENT,
  RECENT_CONTEXT_STORAGE_KEY,
  type RecentContext,
  type RecentContextKind,
} from "@/lib/navigation/recent-context";

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
    persona === "planner"
      ? ["planner", "administration", "management"]
      : persona === "administration"
        ? ["administration", "planner", "management"]
        : persona === "management"
          ? ["management", "administration", "planner"]
          : ["planner", "administration", "management"];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 shadow-card">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Richt het overzicht op uw werk
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
        >
          {(Object.keys(personaLabels) as DashboardPersona[]).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`Toon ${personaLabels[value].toLowerCase()} als eerste`}
            >
              {personaLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {order.map((key, index) => (
        <div
          key={key}
          className={
            index === 0 && persona !== "all"
              ? "ring-2 ring-primary/20 rounded-xl"
              : ""
          }
        >
          {panels[key]}
        </div>
      ))}
    </div>
  );
}

export function DashboardResumePanel() {
  const [items, setItems] = React.useState<RecentContext[]>([]);

  React.useEffect(() => {
    const read = () =>
      setItems(
        parseRecentContexts(
          window.localStorage.getItem(RECENT_CONTEXT_STORAGE_KEY),
        ).slice(0, 4),
      );
    read();
    window.addEventListener(RECENT_CONTEXT_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(RECENT_CONTEXT_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

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
