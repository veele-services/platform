const PERSONNEL_ROLE_LABELS: Record<string, string> = {
  Administration: "Administratie",
  Customer: "Klant",
  Employee: "Medewerker",
  "Flex Employee": "Flexmedewerker",
  Management: "Management",
  Planning: "Planning",
  Support: "Support",
  Teamlead: "Teamleider",
  Owner: "Eigenaar",
};

export function formatPersonnelRoleName(roleName: string | null | undefined): string {
  if (!roleName) return "";
  return PERSONNEL_ROLE_LABELS[roleName] ?? roleName;
}
