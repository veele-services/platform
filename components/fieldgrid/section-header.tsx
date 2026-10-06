import type { ReactNode } from "react";
import { HelpTip } from "./help-tip";

export function SectionHeader({ title, subtitle, help, actions }: { title: string; subtitle?: string; help?: ReactNode; actions?: ReactNode }) {
  return <div className="section-header"><div>{subtitle && <span className="eyebrow">{subtitle}{help && <HelpTip label={`Informatie over ${title}`}>{help}</HelpTip>}</span>}<div className="heading-with-help"><h2>{title}</h2>{!subtitle && help && <HelpTip label={`Informatie over ${title}`}>{help}</HelpTip>}</div></div>{actions && <div className="section-header-actions">{actions}</div>}</div>;
}
