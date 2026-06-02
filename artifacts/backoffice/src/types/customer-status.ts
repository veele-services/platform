export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  lead:     "Lead",
  prospect: "Prospect",
  active:   "Actief",
  inactive: "Inactief",
  blocked:  "Geblokkeerd",
  archived: "Gearchiveerd",
};

export const CUSTOMER_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  lead:     { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  prospect: { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  active:   { bg: "#ECFDF5", text: "#059669", border: "#A7F3D0" },
  inactive: { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" },
  blocked:  { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  archived: { bg: "#F1F5F9", text: "#94A3B8", border: "#CBD5E1" },
};

export const CUSTOMER_STATUSES = ["lead", "prospect", "active", "inactive", "blocked", "archived"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
