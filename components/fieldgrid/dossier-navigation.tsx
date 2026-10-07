"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import "./content-tabs.css";

/** Canonical dossier routes use the same underline tabs as dashboard panels. */
export function DossierNavigation({ label, current, tabs }: {
  label: string;
  current: string;
  tabs: Array<{ id: string; title: string; href: string; count?: number }>;
}) {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = navigation.current, active = row?.querySelector<HTMLElement>("[aria-current=page]");
    if (!row || !active) return;
    const reveal = () => {
      const bounds = row.getBoundingClientRect(), tab = active.getBoundingClientRect();
      if (tab.left < bounds.left) row.scrollLeft += tab.left - bounds.left - 6;
      else if (tab.right > bounds.right) row.scrollLeft += tab.right - bounds.right + 6;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(row);
    return () => observer.disconnect();
  }, [current]);
  return <nav ref={navigation} className="content-tab-list dossier-navigation" aria-label={label}>
    {tabs.map(tab => <Link key={tab.id} href={tab.href} scroll={false} aria-current={current === tab.id ? "page" : undefined}>
      {tab.title}{Boolean(tab.count) && <span className="dossier-tab-count">{tab.count}</span>}
    </Link>)}
  </nav>;
}
