// seeder.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PERMISSIONS = [
  // member
  { id: "1.1.1", name: "member:role:view", desc: "Melihat daftar peran" },
  { id: "1.1.2", name: "member:role:create", desc: "Membuat peran baru" },
  { id: "1.1.3", name: "member:role:update", desc: "Mengubah peran yang ada" },
  { id: "1.1.4", name: "member:role:delete", desc: "Menghapus peran" },
  { id: "1.2.1", name: "member:user:view", desc: "Melihat daftar anggota" },
  { id: "1.2.2", name: "member:user:create", desc: "Menambahkan anggota baru" },
  { id: "1.2.3", name: "member:user:update", desc: "Mengubah peran anggota" },
  { id: "1.2.4", name: "member:user:delete", desc: "Menghapus anggota" },
  { id: "1.3.1", name: "member:permission:view", desc: "Melihat daftar perizinan" },
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
        desc: permission.desc,
      },
      create: {
        id: permission.id,
        name: permission.name,
        desc: permission.desc,
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