import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCandidateQualificationRequirements } from "../../lib/db/src/planning-qualification-requirements";

const tasks = [
  {
    requiredRoleId: null,
    requiredCertificates: ["VCA"],
    requiredDiploma: null,
    requiredKnowledge: ["Algemene instructie"],
  },
  {
    requiredRoleId: "role-cleaner",
    requiredCertificates: ["Schoonmaakcertificaat"],
    requiredDiploma: "Vakdiploma schoonmaak",
    requiredKnowledge: ["Dosering"],
  },
  {
    requiredRoleId: "role-security",
    requiredCertificates: ["Beveiligingspas"],
    requiredDiploma: "Beveiliger 2",
    requiredKnowledge: ["Cameratoezicht"],
  },
];

const roleQualifications = [
  {
    roleId: "role-cleaner",
    type: "certificate",
    name: "BHV schoonmaak",
  },
  {
    roleId: "role-security",
    type: "certificate",
    name: "BHV beveiliging",
  },
];

test("multi-role staffing requires only global and candidate-role qualifications", () => {
  const cleaner = resolveCandidateQualificationRequirements(
    tasks,
    roleQualifications,
    "role-cleaner",
  );

  assert.deepEqual(cleaner.certificates, [
    "VCA",
    "Schoonmaakcertificaat",
    "BHV schoonmaak",
  ]);
  assert.deepEqual(cleaner.diplomas, ["Vakdiploma schoonmaak"]);
  assert.deepEqual(cleaner.knowledge, ["Algemene instructie", "Dosering"]);
  assert.ok(!cleaner.certificates.includes("Beveiligingspas"));
  assert.ok(!cleaner.knowledge.includes("Cameratoezicht"));
});

test("a different team role receives its own task and role requirements", () => {
  const security = resolveCandidateQualificationRequirements(
    tasks,
    roleQualifications,
    "role-security",
  );

  assert.deepEqual(security.certificates, [
    "VCA",
    "Beveiligingspas",
    "BHV beveiliging",
  ]);
  assert.deepEqual(security.diplomas, ["Beveiliger 2"]);
  assert.deepEqual(security.knowledge, [
    "Algemene instructie",
    "Cameratoezicht",
  ]);
});
