import type { ReactNode } from "react";
import { SectionHeader } from "./section-header";
import "./content-section.css";

/** A section's title and actions sit above its bordered content surface. */
export function ContentSection({ title, subtitle, description, help, actions, children, className = "", bodyClassName = "", id, ariaLabel }: {
  title: string;
  subtitle?: string;
  description?: string;
  help?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return <section id={id} aria-label={ariaLabel} className={`fg-section ${className}`}>
    <SectionHeader title={title} subtitle={subtitle} description={description} help={help} actions={actions}/>
    <div className={`fg-section-body ${bodyClassName}`}>{children}</div>
  </section>;
}
