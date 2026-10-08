import type { ReactNode } from "react";
import { HelpTip } from "./help-tip";
import { GuideForTitle } from "./guides/guide";

export function SectionHeader({ title, subtitle, description, help, actions }: { title: string; subtitle?: string; description?: string; help?: ReactNode; actions?: ReactNode }) {
  return <><GuideForTitle title={title}/><div className="section-header"><div>{subtitle && <span className="eyebrow">{subtitle}</span>}<div className="heading-with-help"><h2>{title}</h2>{help && <HelpTip label={`Informatie over ${title}`}>{help}</HelpTip>}</div>{description && <p className="section-description">{description}</p>}</div>{actions && <div className="section-header-actions">{actions}</div>}</div></>;
}
