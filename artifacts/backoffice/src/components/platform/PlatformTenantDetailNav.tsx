"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  Globe2,
  LifeBuoy,
  Megaphone,
  Settings2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type PlatformTenantDetailTab =
  | "overview"
  | "subscription"
  | "domains"
  | "modules"
  | "sectors"
  | "users"
  | "branding"
  | "usage"
  | "support"
  | "tickets"
  | "notifications"
  | "audit"
  | "provisioning"
  | "website-delivery";

type GroupId =
  | "overview"
  | "plan"
  | "domain"
  | "access"
  | "operations"
  | "communication";

const GROUPS: Array<{
  id: GroupId;
  label: string;
  icon: typeof Building2;
  defaultTab: PlatformTenantDetailTab;
  tabs: Array<{ id: PlatformTenantDetailTab; label: string }>;
}> = [
  {
    id: "overview",
    label: "Overzicht",
    icon: Building2,
    defaultTab: "overview",
    tabs: [{ id: "overview", label: "Samenvatting" }],
  },
  {
    id: "plan",
    label: "Plan en scope",
    icon: CreditCard,
    defaultTab: "subscription",
    tabs: [
      { id: "subscription", label: "Abonnement" },
      { id: "modules", label: "Modules" },
      { id: "sectors", label: "Sectoren en regio’s" },
    ],
  },
  {
    id: "domain",
    label: "Domein en merk",
    icon: Globe2,
    defaultTab: "domains",
    tabs: [
      { id: "domains", label: "Domeinen" },
      { id: "branding", label: "Huisstijl" },
      { id: "website-delivery", label: "Websitepublicatie" },
    ],
  },
  {
    id: "access",
    label: "Gebruikers en toegang",
    icon: LifeBuoy,
    defaultTab: "users",
    tabs: [
      { id: "users", label: "Gebruikers en eigenaar" },
      { id: "support", label: "Supporttoegang" },
      { id: "audit", label: "Beveiligingslog" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Settings2,
    defaultTab: "usage",
    tabs: [
      { id: "usage", label: "Gebruik en gereedheid" },
      { id: "provisioning", label: "Inrichtingsruns" },
    ],
  },
  {
    id: "communication",
    label: "Communicatie",
    icon: Megaphone,
    defaultTab: "tickets",
    tabs: [
      { id: "tickets", label: "Tickets" },
      { id: "notifications", label: "Meldingen" },
    ],
  },
];

function groupForTab(activeTab: PlatformTenantDetailTab) {
  return (
    GROUPS.find((group) => group.tabs.some((tab) => tab.id === activeTab)) ??
    GROUPS[0]
  );
}

export function PlatformTenantDetailNav({
  tenantId,
  activeTab,
}: {
  tenantId: string;
  activeTab: PlatformTenantDetailTab;
}) {
  const router = useRouter();
  const activeGroup = groupForTab(activeTab);
  const href = (tab: PlatformTenantDetailTab) =>
    `/platform/tenants/${tenantId}?tab=${tab}`;

  function openGroup(groupId: string) {
    const group = GROUPS.find((candidate) => candidate.id === groupId);
    if (group) router.push(href(group.defaultTab));
  }

  return (
    <nav
      className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 grid gap-2 border-y border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-white"
      aria-label="Organisatiebeheer"
    >
      <div className="sm:hidden">
        <Select value={activeGroup.id} onValueChange={openGroup}>
          <SelectTrigger aria-label="Sectie kiezen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="hidden w-full justify-start overflow-x-auto sm:flex"
        role="list"
      >
        {GROUPS.map((group) => {
          const Icon = group.icon;
          const active = group.id === activeGroup.id;
          return (
            <span key={group.id} role="listitem">
              <Link
                href={href(group.defaultTab)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950",
                  active && "bg-slate-100 text-slate-950",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {group.label}
              </Link>
            </span>
          );
        })}
      </div>

      {activeGroup.tabs.length > 1 && (
        <>
          <div className="sm:hidden">
            <Select
              value={activeTab}
              onValueChange={(value) =>
                router.push(href(value as PlatformTenantDetailTab))
              }
            >
              <SelectTrigger
                aria-label={`${activeGroup.label}: onderdeel kiezen`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeGroup.tabs.map((tab) => (
                  <SelectItem key={tab.id} value={tab.id}>
                    {tab.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden flex-wrap gap-1 border-t border-slate-100 pt-2 sm:flex">
            {activeGroup.tabs.map((tab) => (
              <Link
                key={tab.id}
                href={href(tab.id)}
                aria-current={tab.id === activeTab ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
                  tab.id === activeTab
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
