// seeder.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const isLocal = process.env.USE_LOCAL_DB === "true";

let prisma: PrismaClient;

if (isLocal) {
  const adapter = new PrismaLibSql({ 
    url: process.env.LOCAL_DATABASE_URL || "file:./dev.db" 
  });
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaLibSql({ 
    url: process.env.TURSO_DATABASE_URL || "",
    authToken: process.env.TURSO_AUTH_TOKEN || "",
  });
  prisma = new PrismaClient({ adapter });
}

const DEFAULT_PERMISSIONS = [
  // admin
  { id: "1.1.1", name: "admin:role:view", desc: "Melihat daftar peran" },
  { id: "1.1.2", name: "admin:role:create", desc: "Membuat peran baru" },
  { id: "1.1.3", name: "admin:role:update", desc: "Mengubah peran yang ada" },
  { id: "1.1.4", name: "admin:role:delete", desc: "Menghapus peran" },
  { id: "1.2.1", name: "admin:user:view", desc: "Melihat daftar anggota" },
  { id: "1.2.2", name: "admin:user:create", desc: "Menambahkan anggota baru" },
  { id: "1.2.3", name: "admin:user:update", desc: "Mengubah peran anggota" },
  { id: "1.2.4", name: "admin:user:delete", desc: "Menghapus anggota" },
  { id: "1.3.1", name: "admin:permission:view", desc: "Melihat daftar perizinan" },

  // commodity
  { id: "2.1", name: "commodity:view", desc: "Melihat daftar komoditas" },
  { id: "2.2", name: "commodity:create", desc: "Membuat komoditas baru" },
  { id: "2.3", name: "commodity:update", desc: "Mengubah komoditas yang ada" },
  { id: "2.4", name: "commodity:delete", desc: "Menghapus komoditas" },

  // worker
  { id: "3.1.1", name: "worker:group:view", desc: "Melihat daftar grup pekerja" },
  { id: "3.1.2", name: "worker:group:create", desc: "Membuat grup pekerja baru" },
  { id: "3.1.3", name: "worker:group:update", desc: "Mengubah grup pekerja yang ada" },
  { id: "3.1.4", name: "worker:group:delete", desc: "Menghapus grup pekerja" },
  { id: "3.2.1", name: "worker:individual:view", desc: "Melihat daftar individu pekerja" },
  { id: "3.2.2", name: "worker:individual:create", desc: "Membuat individu pekerja baru" },
  { id: "3.2.3", name: "worker:individual:update", desc: "Mengubah individu pekerja yang ada" },
  { id: "3.2.4", name: "worker:individual:delete", desc: "Menghapus individu pekerja" },

  // land
  { id: "4.1", name: "land:view", desc: "Melihat daftar lahan" },
  { id: "4.2", name: "land:create", desc: "Membuat lahan baru" },
  { id: "4.3", name: "land:update", desc: "Mengubah lahan yang ada" },
  { id: "4.4", name: "land:delete", desc: "Menghapus lahan" },

  // batch
  { id: "5.1", name: "batch:view", desc: "Melihat daftar batch" },
  { id: "5.2", name: "batch:create", desc: "Membuat batch baru" },
  { id: "5.3", name: "batch:update", desc: "Mengubah batch yang ada" },
  { id: "5.4", name: "batch:delete", desc: "Menghapus batch" },

  // batch source 
  { id: "6.1", name: "batch_source:view", desc: "Melihat daftar batch sumber" },
  { id: "6.2", name: "batch_source:create", desc: "Membuat batch sumber baru" },
  { id: "6.3", name: "batch_source:update", desc: "Mengubah batch sumber yang ada" },
  { id: "6.4", name: "batch_source:delete", desc: "Menghapus batch sumber" },

  // batch attribute   
  { id: "7.1", name: "batch_attribute:view", desc: "Melihat daftar batch attribute" },
  { id: "7.2", name: "batch_attribute:create", desc: "Membuat batch attribute baru" },
  { id: "7.3", name: "batch_attribute:update", desc: "Mengubah batch attribute yang ada" },
  { id: "7.4", name: "batch_attribute:delete", desc: "Menghapus batch attribute" },
];

async function main() {
  console.log('Seeding default permissions...');

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Upsert permissions (create if not exists, update if exists)
  console.log('Processing permissions...');
  for (const permission of DEFAULT_PERMISSIONS) {
    try {
      const existing = await prisma.permission.findUnique({
        where: { id: permission.id },
      });

      if (existing) {
        // Update if exists (in case description changed)
        await prisma.permission.update({
          where: { id: permission.id },
          data: {
            name: permission.name,
            desc: permission.desc,
          },
        });
        updatedCount++;
        console.log(`  Updated: ${permission.name}`);
      } else {
        // Create if not exists
        await prisma.permission.create({
          data: {
            id: permission.id,
            name: permission.name,
            desc: permission.desc,
          },
        });
        createdCount++;
        console.log(`  Created: ${permission.name}`);
      }
    } catch (error) {
      // If permission with same name but different id exists, skip it
      const existingByName = await prisma.permission.findFirst({
        where: { name: permission.name },
      });
      
      if (existingByName && existingByName.id !== permission.id) {
        skippedCount++;
        console.log(`  Skipped: ${permission.name} (already exists with different id: ${existingByName.id})`);
      } else {
        throw error;
      }
    }
  }

  console.log(`\nSeeding completed!`);
  console.log(`  Created: ${createdCount} permissions`);
  console.log(`  Updated: ${updatedCount} permissions`);
  console.log(`  Skipped: ${skippedCount} permissions`);
  console.log(`  Total processed: ${DEFAULT_PERMISSIONS.length} permissions`);
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });