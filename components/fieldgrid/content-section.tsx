import type { ReactNode } from "react";
import { SectionHeader } from "./section-header";
import "./content-section.css";

/** A section's title and actions sit above its bordered content surface. */
export function ContentSection({ title, subtitle, help, actions, children, className = "", bodyClassName = "", id }: {
  title: string;
  subtitle?: string;
  help?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return <section id={id} className={`fg-section ${className}`}>
    <SectionHeader title={title} subtitle={subtitle} help={help} actions={actions}/>
    <div className={`fg-section-body ${bodyClassName}`}>{children}</div>
  </section>;
}
