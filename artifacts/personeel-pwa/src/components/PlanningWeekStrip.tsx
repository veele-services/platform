"use client";

import { useEffect, useRef } from "react";

export type PlanningWeekDay = {
  key: string;
  label: string;
  day: number;
  isActive: boolean;
};

export function PlanningWeekStrip({ days }: { days: PlanningWeekDay[] }) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "instant",
      block:    "nearest",
      inline:   "center",
    });
  }, []);

  return (
    <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [scroll-padding-inline:calc(50vw-25px)] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-2 pb-1">
        {days.map((day) => (
          <button
            key={day.key}
            ref={day.isActive ? activeRef : undefined}
            type="button"
            className="flex h-[58px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[13px] border transition"
            style={{
              background: day.isActive
                ? "linear-gradient(180deg, #19C1BF 0%, #12A9B0 100%)"
                : "rgba(255,255,255,0.09)",
              borderColor: day.isActive ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.08)",
              color:       "#FFFFFF",
              boxShadow:   day.isActive ? "0 16px 34px rgba(0,183,179,0.32)" : "none",
            }}
            aria-pressed={day.isActive}
          >
            <span className="text-[12px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.78)" }}>
              {day.label}
            </span>
            <span className="text-[22px] font-black leading-tight">{day.day}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
