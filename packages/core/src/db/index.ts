/**
 * Database module for CtxNest
 * Manages SQLite database connection, migrations, and singleton pattern
 */

import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

/**
 * Create and initialize the database
 * @param dbPath - Path to the SQLite database file
 * @returns Database instance
 */
export function createDatabase(dbPath: string): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  // Enable foreign key constraints
  db.pragma("foreign_keys = ON");

  // Run migrations
  runMigrations();

  return db;
}

/**
 * Get the existing database instance
 * @returns Database instance
 * @throws Error if database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call createDatabase() first.");
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run all pending migrations
 */
export function runMigrations(): void {
  if (!db) {
    throw new Error("Database not initialized. Call createDatabase() first.");
  }

  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = join(__dirname, "migrations");

  // Get all .sql files and sort them
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const getMigrationStmt = db.prepare("SELECT id FROM _migrations WHERE name = ?");
  const insertMigrationStmt = db.prepare("INSERT INTO _migrations (name) VALUES (?)");

  // Execute each migration in order
  for (const file of migrationFiles) {
    const isExecuted = getMigrationStmt.get(file);

    if (!isExecuted) {
      const migrationPath = join(migrationsDir, file);
      const sql = readFileSync(migrationPath, "utf-8");

      console.log(`[Database] Running migration: ${file}`);
      
      // Execute the migration in a transaction
      db.transaction(() => {
        db!.exec(sql);
        insertMigrationStmt.run(file);
      })();
    }
  }
}
