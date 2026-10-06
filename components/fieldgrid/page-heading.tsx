import type { ReactNode } from "react";
import { HelpTip } from "./help-tip";

/** Dashboard heading: a quiet eyebrow, contextual help and one clear title. */
export function PageHeading({ eyebrow, title, help, actions, className = "" }: { eyebrow: string; title: string; help?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={`page-intro unified-page-heading ${className}`}><div><span className="eyebrow">{eyebrow}{help && <HelpTip label={`Informatie over ${title}`}>{help}</HelpTip>}</span><h1>{title}</h1></div>{actions && <div className="resource-header-actions">{actions}</div>}</header>;
}
