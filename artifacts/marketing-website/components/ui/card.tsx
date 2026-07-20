import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("rounded-[1.5rem] border border-[var(--line)]/80 bg-white shadow-[var(--shadow-sm)]", className)} {...props} />; }
export function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("p-6 sm:p-7", className)} {...props} />; }
