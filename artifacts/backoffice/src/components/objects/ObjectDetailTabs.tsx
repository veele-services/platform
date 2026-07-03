"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const OBJECT_TAB_KEYS = [
  "overzicht",
  "diensten",
  "materiaal",
  "details",
  "contacten",
] as const;

export type ObjectTabKey = (typeof OBJECT_TAB_KEYS)[number];

const TAB_LABELS: Record<ObjectTabKey, string> = {
  overzicht: "Overzicht",
  diensten:  "Diensten",
  materiaal: "Materiaal",
  details:   "Details",
  contacten: "Contacten",
};

interface Props {
  activeTab: ObjectTabKey;
  counts?:   Partial<Record<ObjectTabKey, number>>;
}

export function ObjectDetailTabs({ activeTab, counts }: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const navigate = useCallback((tab: ObjectTabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div
      className="flex gap-0.5 overflow-x-auto scrollbar-none border-b mb-6"
      style={{ borderColor: "#E2E8F0" }}
    >
      {OBJECT_TAB_KEYS.map((tab) => {
        const active = tab === activeTab;
        const count  = counts?.[tab];
        return (
          <button
            key={tab}
            type="button"
            onClick={() => navigate(tab)}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
            style={{
              borderBottomColor: active ? "#00B7B3" : "transparent",
              color:             active ? "#00B7B3" : "#64748B",
              backgroundColor:   "transparent",
            }}
          >
            {TAB_LABELS[tab]}
            {count !== undefined && count > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-xs px-1.5 min-w-[18px] h-[18px]"
                style={{
                  backgroundColor: active ? "#00B7B3" : "#E2E8F0",
                  color:           active ? "#fff"     : "#64748B",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
