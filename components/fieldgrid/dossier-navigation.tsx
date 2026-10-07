import Link from "next/link";
import "./content-tabs.css";

/** Canonical dossier routes use the same underline tabs as dashboard panels. */
export function DossierNavigation({ label, current, tabs }: {
  label: string;
  current: string;
  tabs: Array<{ id: string; title: string; href: string; count?: number }>;
}) {
  return <nav className="content-tab-list dossier-navigation" aria-label={label}>
    {tabs.map(tab => <Link key={tab.id} href={tab.href} scroll={false} aria-current={current === tab.id ? "page" : undefined}>
      {tab.title}{Boolean(tab.count) && <span className="dossier-tab-count">{tab.count}</span>}
    </Link>)}
  </nav>;
}
