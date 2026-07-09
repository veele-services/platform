export const OBJECT_TAB_KEYS = [
  "overzicht",
  "diensten",
  "materiaal",
  "inventaris",
  "details",
  "contacten",
] as const;

export type ObjectTabKey = (typeof OBJECT_TAB_KEYS)[number];

export const OBJECT_TAB_LABELS: Record<ObjectTabKey, string> = {
  overzicht:  "Overzicht",
  diensten:   "Diensten",
  materiaal:  "Materiaal",
  inventaris: "Inventaris",
  details:    "Details",
  contacten:  "Contacten",
};
