import * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.ComponentProps<"span">) { return <span className={cn("inline-flex items-center rounded-full border border-white/15 bg-white/[.08] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-white/80 backdrop-blur-md", className)} {...props} />; }
