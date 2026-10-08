import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

/** The same labelled, square action works in a page toolbar or a table row. */
export function ActionIcon({ label, icon, className = "", type = "button", ...props }: ComponentProps<"button"> & { label: string; icon: ReactNode }) {
  return <button type={type} aria-label={label} title={label} className={`fg-action-icon ${className}`} {...props}><span aria-hidden="true">{icon}</span></button>;
}

export function ActionLink({ label, icon, className = "", ...props }: ComponentProps<typeof Link> & { label: string; icon: ReactNode }) {
  return <Link aria-label={label} title={label} className={`fg-action-icon ${className}`} {...props}><span aria-hidden="true">{icon}</span></Link>;
}
