import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "./database.js";
import { RunRepository } from "../../packages/runtime/src/repository.js";
import {
  createQueue,
  publishOutbox,
  startConsumer,
} from "../../packages/runtime/src/queue.js";
import { fixtureProcessor } from "../../packages/runtime/src/processor.js";

const database = testDatabase();
const pool = database.pool;
const repository = new RunRepository(pool);
const owner = `queue-test-${randomUUID()}`;
const redis = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";
const name = `test-${randomUUID()}`;
const queue = createQueue(redis, name);
const worker = startConsumer(repository, redis, fixtureProcessor, name);
beforeAll(async () => {
  await database.setup();
  await worker.waitUntilReady();
});
afterAll(async () => {
  await worker.close();
  // Only this test's UUID-named queue is removed, never the application queue.
  await queue.obliterate();
  await queue.close();
  await database.cleanup();
});

describe("PostgreSQL outbox and BullMQ", () => {
  it("replays a publish after a crash without duplicating completed results", async () => {
    const run = await repository.create(owner, randomUUID(), {
      rawText: "hello\nfixture:fail",
      intent: "AUTO",
      uiLocale: "zh-CN",
      explanationLocale: "zh-CN",
      targetLanguage: "en",
    });
    await publishOutbox(repository, queue);
    await expect
      .poll(async () => (await repository.get(owner, run.runId))?.status, {
        timeout: 10_000,
      })
      .toBe("PARTIAL_SUCCESS");
    await pool.query(
      "UPDATE outbox_events SET published_at=NULL WHERE item_id=ANY($1)",
      [run.items.map((item) => item.itemId)],
    );
    await publishOutbox(repository, queue);
    const attempts = await pool.query(
      "SELECT 1 FROM processing_attempts WHERE item_id=ANY($1)",
      [run.items.map((item) => item.itemId)],
    );
    expect(attempts.rowCount).toBe(2);
    const current = await repository.get(owner, run.runId);
    expect(current?.items[0]?.result?.type).toBe("CLARIFICATION");
    expect(current?.items[1]?.error?.error.code).toBe("FIXTURE_FAILURE");
  });
});
