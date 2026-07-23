import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) { return <input className={cn("h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 text-base text-brand-ink shadow-[0_1px_2px_rgba(3,20,38,.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[var(--aqua-deep)] focus:ring-4 focus:ring-[var(--aqua-soft)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm", className)} {...props} />; }
