import * as React from "react"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type FormActionStatus = "idle" | "pending" | "success" | "error"

function FormActions({
  children,
  className,
  status = "idle",
  message,
}: {
  children: React.ReactNode
  className?: string
  status?: FormActionStatus
  message?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-[var(--z-sticky)] -mx-4 mt-6 border-t border-border bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.55)] backdrop-blur sm:bottom-4 sm:mx-0 sm:rounded-lg sm:border sm:pb-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-live="polite"
          className="min-h-5 min-w-0 text-sm text-muted-foreground"
        >
          {status === "pending" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              {message ?? "Wijzigingen worden opgeslagen…"}
            </span>
          ) : status === "success" ? (
            <span className="inline-flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-4" />
              {message ?? "Wijzigingen zijn opgeslagen."}
            </span>
          ) : status === "error" ? (
            <span role="alert" className="inline-flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              {message ?? "Opslaan is niet gelukt. Probeer het opnieuw."}
            </span>
          ) : (
            message
          )}
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {children}
        </div>
      </div>
    </div>
  )
}

export { FormActions, type FormActionStatus }
