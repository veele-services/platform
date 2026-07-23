import Link from "next/link";

const WEBSITE_TABS = [
  { href: "/website", label: "Overzicht" },
  { href: "/website/settings", label: "Instellingen" },
  { href: "/website/pages", label: "Pagina's" },
  { href: "/website/review", label: "Preview & publiceren" },
] as const;

export function WebsiteTabs() {
  return (
    <nav
      aria-label="Websitebeheer"
      className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2"
    >
      {WEBSITE_TABS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
