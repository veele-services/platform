const ROLE_LABELS: Record<string, string> = {
  administration: "Administratie",
  customer: "Klant",
  employee: "Medewerker",
  "flex employee": "Flexmedewerker",
  management: "Management",
  planning: "Planning",
  support: "Support",
  teamlead: "Teamleider",
};

export function formatPersonnelRoleLabel(roleName: string | null | undefined) {
  const value = roleName?.trim();
  if (!value) return "Medewerker";

  return ROLE_LABELS[value.toLowerCase()] ?? value;
}
