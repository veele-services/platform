import * as React from "react"

import { cn } from "@/lib/utils"

function BulkActionBar({
  count,
  children,
  className,
}: {
  count: number
  children: React.ReactNode
  className?: string
}) {
  if (count === 0) return null

  return (
    <section
      aria-label="Bulkacties"
      className={cn(
        "sticky bottom-0 z-[var(--z-sticky)] flex flex-col gap-3 border border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur sm:bottom-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-lg",
        className,
      )}
    >
      <p aria-live="polite" className="text-sm font-medium text-foreground">
        {count} {count === 1 ? "item" : "items"} geselecteerd
      </p>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {children}
      </div>
    </section>
  )
}

export { BulkActionBar }
