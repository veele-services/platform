"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

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

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        open,
        collapsed,
        toggle:          () => setOpen((o) => !o),
        close:           () => setOpen(false),
        toggleCollapsed: () => setCollapsed((value) => !value),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
