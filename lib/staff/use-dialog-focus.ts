"use client";

import { useRef } from "react";

// Staff dialogs can be opened by a command instead of a Radix DialogTrigger.
// Keep that button as the return target without changing the focus trap.
export function useStaffDialogFocus(enabled = true) {
  const opener = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement;
      // React autoFocus may already have focused an input in a newly mounted
      // ticket form. Preserve the opener captured before that input mounted.
      if (enabled && active instanceof HTMLElement && !(event.target instanceof HTMLElement && event.target.contains(active))) opener.current = active;
    },
    onCloseAutoFocus: (event: Event) => {
      if (enabled && opener.current?.isConnected) {
        event.preventDefault();
        opener.current.focus();
      }
    },
  };
}
