import type { ReactNode } from "react";
import "./content-tabs.css";

/** Flow layout keeps actions clear of the mobile navigation and dossier content. */
export function DossierActions({ primary, children }: { primary: ReactNode; children: ReactNode }) {
  return <div className="dossier-header-actions"><div className="dossier-primary-action">{primary}</div><div className="dossier-secondary-actions">{children}</div></div>;
}
