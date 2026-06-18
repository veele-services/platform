"use client";

import { useSidebar } from "@/providers/sidebar-provider";

export function SidebarOverlay() {
  const { open, close } = useSidebar();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 md:hidden"
      onClick={close}
      aria-hidden="true"
    />
  );
}
