import { createPool, migrate } from "./database.js";
import { runtimeSettings } from "./settings.js";

const pool = createPool(runtimeSettings().databaseUrl);
try {
  await migrate(pool);
  console.info("Database migrations applied.");
} finally {
  await pool.end();
}
