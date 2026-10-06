import { brandThemeStyle } from "@/lib/branding/palette";

/** Personnel pages and their portals use the saved tenant palette. */
export function personnelThemeStyle(primary?: string | null, accent?: string | null) {
  return brandThemeStyle(primary, accent);
}
