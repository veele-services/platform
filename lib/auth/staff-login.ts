import { safeNext } from "@/lib/auth/safe-next";

export const STAFF_OTP_COOLDOWN_SECONDS = 60;

export function isStaffLoginDestination(value?: string | null): boolean {
  const destination = safeNext(value);
  const pathname = new URL(destination, "https://fieldgrid.invalid").pathname;
  return pathname === "/staff" || pathname.startsWith("/staff/");
}

export function safeStaffNext(value?: string | null): string {
  return isStaffLoginDestination(value) ? safeNext(value) : "/staff";
}
