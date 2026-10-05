import { brandThemeStyle } from "@/lib/branding/palette";

/** The personnel app uses the Fieldgrid prototype's fixed green identity. */
export function personnelThemeStyle() {
  return {
    ...brandThemeStyle(),
    "--ps-brand": "#41ac42",
    "--ps-action": "#368341",
    "--ps-action-hover": "#2f7338",
    "--ps-soft": "#edf6ed",
  };
}
