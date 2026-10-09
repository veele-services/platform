"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isStaffLoginDestination } from "@/lib/auth/staff-login";

export type StaffInstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let available: StaffInstallEvent | null = null;
export const staffInstallReadyEvent = "fieldgrid:pwa-install-ready";
export const getStaffInstallEvent = () => available;
export const clearStaffInstallEvent = () => { available = null; };

function staffPresentation() {
  return document.querySelector('link[rel="manifest"]')?.getAttribute("href") === "/staff/manifest.webmanifest"
    || location.pathname === "/staff" || location.pathname.startsWith("/staff/")
    || (location.pathname === "/login" && isStaffLoginDestination(new URLSearchParams(location.search).get("next")));
}

/** Capture the browser's one-use event even while an employee is entering an
 * OTP. This persistent root component never opens an installation prompt. */
export function StaffPwaBrowserEvents() {
  const pathname = usePathname();
  useEffect(() => {
    const capture = (event: Event) => {
      if (!staffPresentation() || typeof (event as StaffInstallEvent).prompt !== "function") return;
      event.preventDefault(); available = event as StaffInstallEvent;
      window.dispatchEvent(new Event(staffInstallReadyEvent));
    };
    const installed = () => { available = null; };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);
  useEffect(() => {
    if (staffPresentation() && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  }, [pathname]);
  return null;
}
