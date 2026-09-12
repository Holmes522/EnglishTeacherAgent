import { randomUUID } from "node:crypto";
import { createPool, migrate } from "../../packages/runtime/src/database.js";

export function testDatabase() {
  const baseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://english_teacher:local-development-only@127.0.0.1:55432/english_teacher";
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = createPool(url.toString());
  let created = false;
  return {
    pool,
    url: url.toString(),
    async setup() {
      const admin = createPool(baseUrl);
      try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        created = true;
      } finally {
        await admin.end();
      }
      await migrate(pool);
    },
    async cleanup() {
      await pool.end();
      if (!created) return;
      const admin = createPool(baseUrl);
      // This identifier is generated here, never supplied by a user or shared with application data.
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    },
  };
}
