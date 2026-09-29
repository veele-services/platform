import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  return React.useSyncExternalStore(
    (callback) => {
      const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      query.addEventListener("change", callback)
      return () => query.removeEventListener("change", callback)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
