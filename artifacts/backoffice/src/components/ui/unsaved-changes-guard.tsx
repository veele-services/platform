"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function UnsavedChangesGuard({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Wijzigingen niet opgeslagen</AlertDialogTitle>
          <AlertDialogDescription>
            Als je nu weggaat, gaan de wijzigingen in dit formulier verloren.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Verder bewerken</AlertDialogCancel>
          <AlertDialogAction
            className="border-destructive-border bg-destructive text-destructive-foreground"
            onClick={onDiscard}
          >
            Wijzigingen verwerpen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function useUnsavedChangesGuard(enabled: boolean) {
  const pendingAction = React.useRef<null | (() => void)>(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [enabled])

  const requestNavigation = React.useCallback(
    (action: () => void) => {
      if (!enabled) {
        action()
        return
      }
      pendingAction.current = action
      setOpen(true)
    },
    [enabled],
  )

  const discard = React.useCallback(() => {
    const action = pendingAction.current
    pendingAction.current = null
    setOpen(false)
    action?.()
  }, [])

  const guard = (
    <UnsavedChangesGuard
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) pendingAction.current = null
      }}
      onDiscard={discard}
    />
  )

  return { requestNavigation, guard }
}

export { UnsavedChangesGuard, useUnsavedChangesGuard }
