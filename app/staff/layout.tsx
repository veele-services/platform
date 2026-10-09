import type { ReactNode } from "react";
import type { Viewport } from "next";
import { getStaffPwaIdentity, getStaffPwaMetadata } from "@/lib/pwa/staff";
import "./staff.css";
import "./workspace-overlays.css";

export async function generateMetadata() {
  return getStaffPwaMetadata();
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: (await getStaffPwaIdentity()).themeColor, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return children;
}
