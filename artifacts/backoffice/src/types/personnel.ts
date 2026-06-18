export const PERSONNEL_TYPES = [
  "vast",
  "parttime",
  "flex",
  "oproep",
  "zzp",
  "tijdelijk",
] as const;

export type PersonnelType = typeof PERSONNEL_TYPES[number];

export const PERSONNEL_TYPE_LABELS: Record<PersonnelType, string> = {
  vast:      "Vast",
  parttime:  "Parttime",
  flex:      "Flex",
  oproep:    "Oproep",
  zzp:       "ZZP",
  tijdelijk: "Tijdelijk",
};

export const PERSONNEL_TYPE_COLORS: Record<PersonnelType, { bg: string; color: string }> = {
  vast:      { bg: "#D1FAE5", color: "#065F46" },
  parttime:  { bg: "#DBEAFE", color: "#1D4ED8" },
  flex:      { bg: "#FEF3C7", color: "#92400E" },
  oproep:    { bg: "#FCE7F3", color: "#9D174D" },
  zzp:       { bg: "#EDE9FE", color: "#5B21B6" },
  tijdelijk: { bg: "#F1F5F9", color: "#475569" },
};

/** Personnel types considered "flex pool" for planning widgets */
export const FLEX_TYPES: PersonnelType[] = ["flex", "oproep", "zzp", "tijdelijk"];

export type ContractInfo = {
  start_date?:      string;
  end_date?:        string;
  contract_type?:   string;
  hours_per_week?:  number;
};

export type CertificateEntry = {
  name:        string;
  expires_at?: string;
};
