// seeder.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PERMISSIONS = [
  { id: "1.1", name: "role:view" },
  { id: "1.2", name: "role:create" },
  { id: "1.3", name: "role:update" },
  { id: "1.4", name: "role:delete" },
  { id: "2.1", name: "user:view" },
  { id: "2.2", name: "user:create" },
  { id: "2.3", name: "user:update" },
  { id: "2.4", name: "user:delete" },
];

async function main() {
  console.log('Seeding default permissions...');

  for (const permission of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { 
        id: permission.id 
      },
      update: {
        name: permission.name,
      },
      create: {
        id: permission.id,
        name: permission.name,
      },
    });
  }

  console.log(`Seeding completed! Processed ${DEFAULT_PERMISSIONS.length} permissions.`);
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });