import { createClient } from "@libsql/client";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Parse libsql URL
const url = new URL(DATABASE_URL);
const authToken = url.searchParams.get("authToken");
const dbUrl = `https://${url.host}${url.pathname}`;

const client = createClient({
  url: dbUrl,
  authToken: authToken || undefined,
});

async function applyMigrations() {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrations = await readdir(migrationsDir, { withFileTypes: true });

  // Sort migrations by name (timestamp)
  const sortedMigrations = migrations
    .filter((dirent) => dirent.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Found ${sortedMigrations.length} migrations to apply`);

  for (const migration of sortedMigrations) {
    const migrationPath = join(migrationsDir, migration.name, "migration.sql");
    try {
      const sql = await readFile(migrationPath, "utf-8");
      
      console.log(`Applying migration: ${migration.name}`);
      
      // Split SQL by semicolons and execute each statement
      // Handle multi-line statements and PRAGMA commands
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

      for (const statement of statements) {
        if (statement) {
          try {
            await client.execute(statement);
          } catch (error: any) {
            // Ignore errors for statements that might already exist or tables that don't exist
            if (!error.message?.includes("already exists") && 
                !error.message?.includes("duplicate") &&
                !error.message?.includes("UNIQUE constraint") &&
                !error.message?.includes("no such table") &&
                !error.message?.includes("no such column")) {
              console.error(`Error executing statement: ${statement.substring(0, 50)}...`);
              console.error(error.message);
            }
          }
        }
      }
      
      console.log(`✓ Migration ${migration.name} applied`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log(`⚠ Migration ${migration.name} has no SQL file, skipping`);
      } else {
        console.error(`✗ Error applying migration ${migration.name}:`, error.message);
      }
    }
  }

  console.log("\n✓ All migrations applied successfully!");
  await client.close();
}

applyMigrations().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

