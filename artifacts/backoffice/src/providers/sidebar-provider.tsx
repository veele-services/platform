"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
  open:            boolean;
  collapsed:       boolean;
  toggle:          () => void;
  close:           () => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  open:            false,
  collapsed:       false,
  toggle:          () => {},
  close:           () => {},
  toggleCollapsed: () => {},
});

const SIDEBAR_COLLAPSED_STORAGE_KEY = "fieldgrid:tenant-sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);
  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);

  return (
    <SidebarContext.Provider
      value={{
        open,
        collapsed,
        toggle,
        close,
        toggleCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
