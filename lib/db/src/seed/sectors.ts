import { db } from "../index";
import { sectorsTable } from "../schema/sectors";

const SECTORS = [
  {
    name:        "Facilitair",
    description: "Facilitaire dienstverlening, beheer en onderhoud.",
  },
  {
    name:        "Schoonmaak",
    description: "Reguliere, specialistische en calamiteitenschoonmaak.",
  },
  {
    name:        "Beveiliging",
    description: "Beveiliging, toezicht, surveillance en alarmopvolging.",
  },
];

async function seedSectors() {
  console.log("Seeding sectors…");

  const inserted = await db
    .insert(sectorsTable)
    .values(SECTORS)
    .onConflictDoNothing()
    .returning({ id: sectorsTable.id, name: sectorsTable.name });

  if (inserted.length === 0) {
    console.log("Sectors already seeded — nothing to do.");
  } else {
    console.log(`Inserted ${inserted.length} sector(s):`);
    inserted.forEach(s => console.log(`  • ${s.name} (${s.id})`));
  }

  process.exit(0);
}

seedSectors().catch(err => {
  console.error("Sector seed failed:", err);
  process.exit(1);
});
