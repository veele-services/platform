"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type PlanningWeekDay = {
  key: string;
  label: string;
  day: number;
  isActive: boolean;
  href?: string;
};

export function PlanningWeekStrip({ days }: { days: PlanningWeekDay[] }) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const activeIndex = Math.max(
    0,
    days.findIndex((day) => day.isActive),
  );
  const desktopDays = days.slice(
    Math.max(0, Math.min(activeIndex - 3, days.length - 7)),
    Math.max(0, Math.min(activeIndex - 3, days.length - 7)) + 7,
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "instant",
      block:    "nearest",
      inline:   "center",
    });
  }, []);

  return (
    <>
    <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [scroll-padding-inline:calc(50vw-25px)] md:hidden [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-2 pb-1">
        {days.map((day) => (
          <Link
            key={day.key}
            href={day.href ?? "#"}
            ref={day.isActive ? activeRef : undefined}
            className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border transition"
            style={{
              background: day.isActive
                ? "linear-gradient(180deg, #19C1BF 0%, #12A9B0 100%)"
                : "rgba(255,255,255,0.09)",
              borderColor: day.isActive ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.08)",
              color:       "#FFFFFF",
              boxShadow:   day.isActive ? "0 16px 34px rgba(0,183,179,0.32)" : "none",
            }}
            aria-current={day.isActive ? "date" : undefined}
          >
            <span className="text-[12px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.78)" }}>
              {day.label}
            </span>
            <span className="text-xl font-semibold leading-tight">{day.day}</span>
          </Link>
        ))}
      </div>
    </div>
      <div className="mt-4 hidden grid-cols-7 gap-2 md:grid">
        {desktopDays.map((day) => (
          <Link
            key={day.key}
            href={day.href ?? "#"}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 transition"
            style={{
              backgroundColor: day.isActive
                ? "var(--color-accent-dark)"
                : "color-mix(in srgb, white 9%, transparent)",
              borderColor: day.isActive
                ? "color-mix(in srgb, white 26%, transparent)"
                : "color-mix(in srgb, white 10%, transparent)",
              color: "white",
            }}
            aria-current={day.isActive ? "date" : undefined}
          >
            <span className="text-xs font-medium text-white/75">{day.label}</span>
            <span className="text-lg font-semibold">{day.day}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
