import { PrismaClient } from "./generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ 
    url: `${process.env.TURSO_DATABASE_URL}`, 
    authToken: `${process.env.TURSO_AUTH_TOKEN}` 
});
export const prisma = new PrismaClient({ adapter });
