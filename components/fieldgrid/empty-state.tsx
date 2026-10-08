import type { ReactNode } from "react";
import { Search } from "lucide-react";

/** Shared empty state for an authorised collection (never a loading/error state). */
export function EmptyState({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return <div className="fg-empty-state"><Search size={28} aria-hidden="true"/><h3>{title}</h3><p>{description ?? "Gebruik de knop bovenaan om de eerste registratie toe te voegen."}</p>{children && <div className="fg-empty-actions">{children}</div>}</div>;
}
