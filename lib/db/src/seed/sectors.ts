import { db } from "../index";
import { sectorsTable } from "../schema/sectors";

const SECTORS = [
  {
    name:        "Cleaning",
    description: "Commercial and residential cleaning services",
  },
  {
    name:        "Security",
    description: "Security guard and surveillance services",
  },
  {
    name:        "Facility Management",
    description: "Building and facility maintenance services",
  },
  {
    name:        "Catering",
    description: "Food service and catering support",
  },
  {
    name:        "Grounds Maintenance",
    description: "Landscaping and outdoor grounds maintenance",
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
