import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(
    new URL("../migrations/001_learning_runs.sql", import.meta.url),
    "utf8",
  );
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(522001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const existing = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = 1",
    );
    if (existing.rowCount) return;
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(version) VALUES (1)");
  });
}
