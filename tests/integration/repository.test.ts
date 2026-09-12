import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/runtime/src/database.js";
import { testDatabase } from "./database.js";
import { RunRepository } from "../../packages/runtime/src/repository.js";

const database = testDatabase();
const pool = database.pool;
const repository = new RunRepository(pool);
const owner = `test-${randomUUID()}`;
const input = {
  rawText: "run\nhello",
  intent: "AUTO",
  uiLocale: "zh-CN",
  explanationLocale: "zh-CN",
  targetLanguage: "en",
} as const;
const result = {
  schemaVersion: 1,
  type: "CLARIFICATION",
  data: { message: "Infrastructure fixture only", options: ["Continue"] },
} as const;

beforeAll(async () => {
  await database.setup();
  await migrate(pool);
});
afterAll(async () => {
  await database.cleanup();
});

describe("PostgreSQL task repository", () => {
  it("rolls back the whole creation when an outbox write fails", async () => {
    const before = await pool.query("SELECT count(*)::int AS count FROM learning_runs");
    await pool.query("CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$; CREATE TRIGGER reject_test_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_test_outbox()");
    try {
      await expect(repository.create(owner, randomUUID(), input)).rejects.toThrow("injected outbox failure");
      expect((await pool.query("SELECT count(*)::int AS count FROM learning_runs")).rows[0].count).toBe(before.rows[0].count);
    } finally { await pool.query("DROP TRIGGER reject_test_outbox ON outbox_events; DROP FUNCTION reject_test_outbox()"); }
  });
  it("hides expired runs and deletes all dependent data", async () => {
    const run = await repository.create(owner, randomUUID(), input);
    await pool.query("UPDATE learning_runs SET expires_at=now()-interval '1 second' WHERE id=$1", [run.runId]);
    expect(await repository.get(owner, run.runId)).toBeNull();
    expect(await repository.claim(run.items[0]!.itemId)).toBeNull();
    await repository.purgeExpired();
    expect((await pool.query("SELECT 1 FROM learning_items WHERE run_id=$1", [run.runId])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM outbox_events WHERE item_id=ANY($1)", [run.items.map((item) => item.itemId)])).rowCount).toBe(0);
  });
  it("reconciles a lost queued message and bounds repeated worker crashes", async () => {
    const run = await repository.create(owner, randomUUID(), {
      ...input,
      rawText: "run",
    });
    const id = run.items[0]!.itemId;
    await pool.query(
      "UPDATE outbox_events SET created_at=now()-interval '2 minutes', published_at=now()-interval '2 minutes' WHERE item_id=$1",
      [id],
    );
    await repository.recover();
    expect(
      (
        await pool.query(
          "SELECT 1 FROM outbox_events WHERE item_id=$1 AND published_at IS NULL",
          [id],
        )
      ).rowCount,
    ).toBe(1);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await repository.claim(id)).not.toBeNull();
      await pool.query(
        "UPDATE learning_items SET lease_until=now()-interval '1 second' WHERE id=$1",
        [id],
      );
      await repository.recover();
    }
    expect(
      (await repository.get(owner, run.runId))?.items[0]?.error?.error.code,
    ).toBe("WORKER_RECOVERY_EXHAUSTED");
    expect(await repository.claim(id)).toBeNull();
  });
  it("atomically creates one run and its outbox under concurrent duplicate requests", async () => {
    const key = randomUUID();
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => repository.create(owner, key, input)),
    );
    expect(new Set(runs.map((run) => run.runId)).size).toBe(1);
    const run = runs[0]!;
    expect(run.items.map((item) => item.position)).toEqual([0, 1]);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM outbox_events WHERE item_id = ANY($1)",
          [run.items.map((item) => item.itemId)],
        )
      ).rowCount,
    ).toBe(2);
    await expect(
      repository.create(owner, key, { ...input, rawText: "different" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await repository.get("another-owner", run.runId)).toBeNull();
  });
  it("fences duplicate workers and rejects stale completions after lease recovery", async () => {
    const run = await repository.create(owner, randomUUID(), {
      ...input,
      rawText: "run",
    });
    const id = run.items[0]!.itemId;
    const first = await repository.claim(id);
    expect(first).not.toBeNull();
    expect(await repository.claim(id)).toBeNull();
    await pool.query(
      "UPDATE learning_items SET lease_until = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    await repository.recover();
    const second = await repository.claim(id);
    expect(second?.attempt).toBe(2);
    expect(await repository.finish(id, first!.token, { result })).toBe(false);
    expect(await repository.finish(id, second!.token, { result })).toBe(true);
    expect(await repository.finish(id, second!.token, { result })).toBe(false);
    expect((await repository.get(owner, run.runId))?.status).toBe("SUCCEEDED");
    const attempts = await pool.query(
      "SELECT outcome FROM processing_attempts WHERE item_id = $1 ORDER BY attempt",
      [id],
    );
    expect(attempts.rows.map((row) => row.outcome)).toEqual([
      "LEASE_EXPIRED",
      "SUCCEEDED",
    ]);
  });
  it("cancels queued/running work without letting late output resurrect it", async () => {
    const run = await repository.create(owner, randomUUID(), input);
    const first = await repository.claim(run.items[0]!.itemId);
    await repository.cancel(owner, run.runId);
    expect(
      await repository.finish(first!.item.itemId, first!.token, { result }),
    ).toBe(false);
    expect(await repository.claim(run.items[1]!.itemId)).toBeNull();
    expect((await repository.get(owner, run.runId))?.status).toBe("CANCELLED");
    const events = await repository.events(owner, run.runId, 0);
    expect(events!.map((event) => event.id)).toEqual(
      events!.map((_, index) => index + 1),
    );
    expect((await repository.events(owner, run.runId, 1))![0]!.id).toBe(2);
    expect(await repository.events("another-owner", run.runId, 0)).toBeNull();
  });
  it("creates a linked retry containing only retryable failed items", async () => {
    const run = await repository.create(owner, randomUUID(), input);
    const first = await repository.claim(run.items[0]!.itemId);
    const second = await repository.claim(run.items[1]!.itemId);
    await repository.finish(first!.item.itemId, first!.token, { result });
    await repository.finish(second!.item.itemId, second!.token, {
      error: {
        schemaVersion: 1,
        error: {
          code: "TEMPORARY",
          message: "Retry later",
          retryable: true,
          traceId: randomUUID(),
        },
      },
    });
    expect((await repository.get(owner, run.runId))?.status).toBe(
      "PARTIAL_SUCCESS",
    );
    const retry = await repository.retry(owner, run.runId, randomUUID());
    expect(retry.items.map((item) => item.originalText)).toEqual(["hello"]);
    expect(retry.items[0]?.error).toBeUndefined();
    const retried = await repository.claim(retry.items[0]!.itemId);
    expect(await repository.finish(retried!.item.itemId, retried!.token, { result })).toBe(true);
    expect((await repository.get(owner, retry.runId))?.status).toBe("SUCCEEDED");
    expect((await repository.get(owner, run.runId))?.status).toBe(
      "PARTIAL_SUCCESS",
    );
  });
});
