import { PrismaClient } from "./generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const isLocal = process.env.USE_LOCAL_DB === "true";

let prisma: PrismaClient;

if (isLocal) {
  // For local development, use PrismaLibSql with local database URL
  const adapter = new PrismaLibSql({ 
    url: process.env.LOCAL_DATABASE_URL || "file:./dev.db" 
  });
  prisma = new PrismaClient({ adapter });
} else {
  // For production, use PrismaLibSql with Turso database URL
  const adapter = new PrismaLibSql({ 
    url: process.env.TURSO_DATABASE_URL || "",
    authToken: process.env.TURSO_AUTH_TOKEN || "",
  });
  prisma = new PrismaClient({ adapter });
}

export { prisma };