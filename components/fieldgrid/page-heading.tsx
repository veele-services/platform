import type { ReactNode } from "react";
import { HelpTip } from "./help-tip";

/** Dashboard heading: a quiet eyebrow, contextual help and one clear title. */
export function PageHeading({ eyebrow, title, description, help, actions, titleAccessory, className = "" }: { eyebrow: string; title: string; description?: ReactNode; help?: ReactNode; actions?: ReactNode; titleAccessory?: ReactNode; className?: string }) {
  return <header className={`page-intro unified-page-heading ${className}`}><div className="page-heading-copy"><span className="eyebrow">{eyebrow}{help && <HelpTip label={`Informatie over ${title}`}>{help}</HelpTip>}</span><div className="page-heading-title"><h1>{title}</h1>{titleAccessory}</div>{description && <div className="page-heading-description">{description}</div>}</div>{actions && <div className="resource-header-actions">{actions}</div>}</header>;
}
