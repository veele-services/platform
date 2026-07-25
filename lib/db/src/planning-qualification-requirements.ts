function uniqueStrings(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

export function resolveCandidateQualificationRequirements(
  taskRows: Array<{
    requiredRoleId: string | null;
    requiredCertificates: string[] | null;
    requiredDiploma: string | null;
    requiredKnowledge: string[] | null;
  }>,
  roleQualificationRows: Array<{
    roleId: string;
    type: string;
    name: string;
  }>,
  candidateRoleId: string | null,
): {
  certificates: string[];
  diplomas: string[];
  knowledge: string[];
} {
  const candidateTaskRows = taskRows.filter(
    (task) =>
      !task.requiredRoleId || task.requiredRoleId === candidateRoleId,
  );
  const candidateRoleQualifications = roleQualificationRows.filter(
    (qualification) => qualification.roleId === candidateRoleId,
  );
  return {
    certificates: uniqueStrings([
      ...candidateTaskRows.flatMap(
        (task) => task.requiredCertificates ?? [],
      ),
      ...candidateRoleQualifications
        .filter((qualification) => qualification.type === "certificate")
        .map((qualification) => qualification.name),
    ]),
    diplomas: uniqueStrings([
      ...candidateTaskRows.map((task) => task.requiredDiploma),
      ...candidateRoleQualifications
        .filter((qualification) => qualification.type === "diploma")
        .map((qualification) => qualification.name),
    ]),
    knowledge: uniqueStrings([
      ...candidateTaskRows.flatMap((task) => task.requiredKnowledge ?? []),
      ...candidateRoleQualifications
        .filter((qualification) => qualification.type === "knowledge")
        .map((qualification) => qualification.name),
    ]),
  };
}
