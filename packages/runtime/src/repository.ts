import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  createLearningRunInputSchema,
  learningItemSchema,
  learningRunSchema,
  type LearningItem,
  type LearningResult,
  type LearningRun,
  type PublicError,
} from "@english-teacher/contracts";
import { parseLearningInput } from "@english-teacher/content-intake";
import { transaction } from "./database.js";
import { assertItemTransition, summarizeStatuses } from "./state.js";

export class RunError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
interface RunRow {
  id: string;
  owner_hash: string;
  request_hash: string;
  request: unknown;
  status: LearningRun["status"];
  created_at: Date;
  expires_at: Date;
}
interface ItemRow {
  id: string;
  run_id: string;
  payload: LearningItem;
  attempt: number;
  lease_token: string | null;
  lease_until: Date | null;
}
export interface RunEvent {
  id: number;
  type: string;
  data: unknown;
}
export interface Claim {
  item: LearningItem;
  token: string;
  attempt: number;
}
export type Outcome =
  | { result: LearningResult; error?: never }
  | { error: PublicError; result?: never };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return (
      "{" +
      entries
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}
export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function snapshot(client: PoolClient, row: RunRow): Promise<LearningRun> {
  const items = (
    await client.query<ItemRow>(
      "SELECT * FROM learning_items WHERE run_id = $1 ORDER BY position",
      [row.id],
    )
  ).rows.map((item) => item.payload);
  return learningRunSchema.parse({
    schemaVersion: 1,
    runId: row.id,
    ...summarizeStatuses(items.map((item) => item.status)),
    itemCount: items.length,
    items,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  });
}

// Every caller holds the run row lock, so sequence order is also commit order for this run.
async function appendEvent(
  client: PoolClient,
  runId: string,
  type: string,
  data: unknown,
): Promise<void> {
  await client.query(
    "INSERT INTO run_events(run_id, sequence, type, payload) SELECT $1, COALESCE(MAX(sequence),0)+1, $2, $3 FROM run_events WHERE run_id = $1",
    [runId, type, JSON.stringify(data)],
  );
}

export class RunRepository {
  constructor(
    readonly pool: Pool,
    readonly retentionDays = 7,
  ) {}

  async create(
    owner: string,
    key: string,
    rawInput: unknown,
  ): Promise<LearningRun> {
    const input = createLearningRunInputSchema.parse(rawInput);
    const intake = parseLearningInput(input);
    return transaction(this.pool, (client) =>
      this.insert(client, owner, key, input, intake.items),
    );
  }

  private async insert(
    client: PoolClient,
    owner: string,
    key: string,
    input: unknown,
    seeds: Array<
      Pick<
        LearningItem,
        "originalText" | "normalizedText" | "detectedKind" | "detectedLanguage"
      >
    >,
    retryOf?: string,
  ): Promise<LearningRun> {
    if (!/^[A-Za-z0-9_-]{8,128}$/u.test(key))
      throw new RunError(
        "INVALID_IDEMPOTENCY_KEY",
        422,
        "请提供 8–128 位幂等键。",
      );
    const requestHash = hash(canonical({ input, retryOf }));
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${owner}:${key}`],
    );
    const existing = (
      await client.query<RunRow>(
        "SELECT * FROM learning_runs WHERE owner_hash = $1 AND idempotency_key = $2 FOR UPDATE",
        [owner, key],
      )
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw new RunError(
          "IDEMPOTENCY_KEY_REUSED",
          422,
          "此幂等键已用于不同请求。",
        );
      if (existing.expires_at <= new Date())
        throw new RunError(
          "RUN_EXPIRED",
          409,
          "原任务已过期，请使用新的幂等键。",
        );
      return snapshot(client, existing);
    }
    const id = `lr_${randomUUID()}`;
    const row = (
      await client.query<RunRow>(
        "INSERT INTO learning_runs(id, owner_hash, idempotency_key, request_hash, request, status, expires_at, retry_of) VALUES ($1,$2,$3,$4,$5,'QUEUED',now()+make_interval(days => $6),$7) RETURNING *",
        [
          id,
          owner,
          key,
          requestHash,
          JSON.stringify(input),
          this.retentionDays,
          retryOf ?? null,
        ],
      )
    ).rows[0]!;
    for (const [position, seed] of seeds.entries()) {
      const item = learningItemSchema.parse({
        ...seed,
        schemaVersion: 1,
        itemId: `li_${randomUUID()}`,
        position,
        status: "PENDING",
      });
      await client.query(
        "INSERT INTO learning_items(id, run_id, position, payload) VALUES ($1,$2,$3,$4)",
        [item.itemId, id, position, JSON.stringify(item)],
      );
      await client.query(
        "INSERT INTO outbox_events(id, item_id) VALUES ($1,$2)",
        [randomUUID(), item.itemId],
      );
    }
    const run = await snapshot(client, row);
    await appendEvent(client, id, "run.updated", {
      runId: id,
      status: run.status,
      itemCount: run.itemCount,
      completedCount: 0,
    });
    return run;
  }

  async get(owner: string, id: string): Promise<LearningRun | null> {
    return transaction(this.pool, async (client) => {
      const row = (
        await client.query<RunRow>(
          "SELECT * FROM learning_runs WHERE id = $1 AND owner_hash = $2 AND expires_at > now() FOR SHARE",
          [id, owner],
        )
      ).rows[0];
      return row ? snapshot(client, row) : null;
    });
  }

  async events(
    owner: string,
    id: string,
    after: number,
  ): Promise<RunEvent[] | null> {
    return transaction(this.pool, async (client) => {
      const row = await client.query(
        "SELECT id FROM learning_runs WHERE id = $1 AND owner_hash = $2 AND expires_at > now() FOR SHARE",
        [id, owner],
      );
      if (!row.rowCount) return null;
      return (
        await client.query<{
          sequence: number;
          type: string;
          payload: unknown;
        }>(
          "SELECT sequence, type, payload FROM run_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100",
          [id, after],
        )
      ).rows.map((event) => ({
        id: event.sequence,
        type: event.type,
        data: event.payload,
      }));
    });
  }

  private async lockItem(
    client: PoolClient,
    itemId: string,
  ): Promise<{ run: RunRow; item: ItemRow } | null> {
    // All mutations lock run before item to avoid deadlocks with cancel/recovery.
    const run = (
      await client.query<RunRow>(
        "SELECT r.* FROM learning_runs r JOIN learning_items i ON i.run_id=r.id WHERE i.id=$1 AND r.expires_at > now() FOR UPDATE OF r",
        [itemId],
      )
    ).rows[0];
    if (!run) return null;
    const item = (
      await client.query<ItemRow>(
        "SELECT * FROM learning_items WHERE id=$1 FOR UPDATE",
        [itemId],
      )
    ).rows[0]!;
    return { run, item };
  }

  async claim(itemId: string): Promise<Claim | null> {
    return transaction(this.pool, async (client) => {
      const locked = await this.lockItem(client, itemId);
      if (!locked) return null;
      const { item, run } = locked;
      if (
        item.payload.status !== "PENDING" &&
        !(item.payload.status === "RUNNING" && item.lease_token === null)
      )
        return null;
      if (item.payload.status === "PENDING")
        assertItemTransition("PENDING", "RUNNING");
      const token = randomUUID();
      const payload = { ...item.payload, status: "RUNNING" as const };
      await client.query(
        "UPDATE learning_items SET payload=$2, attempt=attempt+1, lease_token=$3, lease_until=now()+interval '30 seconds' WHERE id=$1",
        [itemId, JSON.stringify(payload), token],
      );
      await client.query(
        "INSERT INTO processing_attempts(item_id,attempt,outcome) VALUES ($1,$2,'RUNNING')",
        [itemId, item.attempt + 1],
      );
      await client.query(
        "UPDATE learning_runs SET status='RUNNING' WHERE id=$1",
        [run.id],
      );
      await appendEvent(
        client,
        run.id,
        "run.updated",
        await snapshot(client, run),
      );
      return { item: payload, token, attempt: item.attempt + 1 };
    });
  }

  async renew(itemId: string, token: string): Promise<boolean> {
    const updated = await this.pool.query(
      "UPDATE learning_items SET lease_until=now()+interval '30 seconds' WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND payload->>'status'='RUNNING'",
      [itemId, token],
    );
    return updated.rowCount === 1;
  }

  async finish(
    itemId: string,
    token: string,
    outcome: Outcome,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const locked = await this.lockItem(client, itemId);
      if (!locked) return false;
      const { item, run } = locked;
      if (
        item.payload.status !== "RUNNING" ||
        item.lease_token !== token ||
        !item.lease_until ||
        item.lease_until <= new Date()
      )
        return false;
      const status = outcome.result ? "SUCCEEDED" : "FAILED";
      assertItemTransition(item.payload.status, status);
      const payload = learningItemSchema.parse({
        ...item.payload,
        ...outcome,
        status,
      });
      await client.query(
        "UPDATE learning_items SET payload=$2, lease_token=NULL, lease_until=NULL WHERE id=$1",
        [itemId, JSON.stringify(payload)],
      );
      await client.query(
        "UPDATE processing_attempts SET outcome=$3, finished_at=now() WHERE item_id=$1 AND attempt=$2",
        [itemId, item.attempt, status],
      );
      await appendEvent(client, run.id, "item.completed", {
        runId: run.id,
        item: payload,
      });
      const current = await snapshot(client, run);
      await client.query("UPDATE learning_runs SET status=$2 WHERE id=$1", [
        run.id,
        current.status,
      ]);
      await appendEvent(
        client,
        run.id,
        current.completedCount === current.itemCount
          ? "run.completed"
          : "run.updated",
        {
          runId: run.id,
          status: current.status,
          completedCount: current.completedCount,
          itemCount: current.itemCount,
        },
      );
      return true;
    });
  }

  async cancel(owner: string, id: string): Promise<LearningRun> {
    return transaction(this.pool, async (client) => {
      const run = (
        await client.query<RunRow>(
          "SELECT * FROM learning_runs WHERE id=$1 AND owner_hash=$2 AND expires_at>now() FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!run)
        throw new RunError("RUN_NOT_FOUND", 404, "任务不存在或已过期。");
      if (!["QUEUED", "RUNNING"].includes(run.status))
        throw new RunError("STATE_CONFLICT", 409, "任务已经结束。");
      const items = (
        await client.query<ItemRow>(
          "SELECT * FROM learning_items WHERE run_id=$1 ORDER BY position",
          [id],
        )
      ).rows;
      for (const item of items) {
        if (!["PENDING", "RUNNING"].includes(item.payload.status)) continue;
        assertItemTransition(item.payload.status, "CANCELLED");
        const payload = { ...item.payload, status: "CANCELLED" };
        await client.query(
          "UPDATE learning_items SET payload=$2, lease_token=NULL, lease_until=NULL WHERE id=$1",
          [item.id, JSON.stringify(payload)],
        );
        await client.query(
          "UPDATE processing_attempts SET outcome='CANCELLED', finished_at=now() WHERE item_id=$1 AND outcome='RUNNING'",
          [item.id],
        );
        await appendEvent(client, id, "item.completed", {
          runId: id,
          item: payload,
        });
      }
      await client.query(
        "UPDATE learning_runs SET status='CANCELLED' WHERE id=$1",
        [id],
      );
      await appendEvent(client, id, "run.completed", {
        runId: id,
        status: "CANCELLED",
      });
      return snapshot(client, run);
    });
  }

  async retry(owner: string, id: string, key: string): Promise<LearningRun> {
    return transaction(this.pool, async (client) => {
      const run = (
        await client.query<RunRow>(
          "SELECT * FROM learning_runs WHERE id=$1 AND owner_hash=$2 AND expires_at>now() FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!run)
        throw new RunError("RUN_NOT_FOUND", 404, "任务不存在或已过期。");
      if (["QUEUED", "RUNNING"].includes(run.status))
        throw new RunError("STATE_CONFLICT", 409, "请等待任务结束后重试。");
      const original = await snapshot(client, run);
      const failed = original.items.filter(
        (item) => item.status === "FAILED" && item.error?.error.retryable,
      );
      if (!failed.length)
        throw new RunError("NOTHING_TO_RETRY", 409, "没有可重试的失败项目。");
      return this.insert(client, owner, key, run.request, failed, id);
    });
  }

  async recover(): Promise<number> {
    const candidates = (
      await this.pool.query<{ id: string }>(
        `SELECT i.id FROM learning_items i JOIN learning_runs r ON r.id=i.run_id
         WHERE r.expires_at>now() AND (
           (i.payload->>'status'='RUNNING' AND i.lease_until<now()) OR
           (i.payload->>'status' IN ('PENDING','RUNNING') AND i.lease_token IS NULL
            AND NOT EXISTS (SELECT 1 FROM outbox_events o WHERE o.item_id=i.id
              AND (o.published_at IS NULL OR o.created_at>now()-interval '60 seconds')))
         ) LIMIT 100`,
      )
    ).rows;
    let recovered = 0;
    for (const { id } of candidates) {
      recovered += await transaction(this.pool, async (client) => {
        const locked = await this.lockItem(client, id);
        if (
          !locked ||
          !["PENDING", "RUNNING"].includes(locked.item.payload.status)
        )
          return 0;
        const { item, run } = locked;
        if (item.lease_token) {
          if (!item.lease_until || item.lease_until > new Date()) return 0;
          await client.query(
            "UPDATE processing_attempts SET outcome='LEASE_EXPIRED',finished_at=now() WHERE item_id=$1 AND attempt=$2",
            [id, item.attempt],
          );
          if (item.attempt >= 3) {
            assertItemTransition(item.payload.status, "FAILED");
            const payload = learningItemSchema.parse({
              ...item.payload,
              status: "FAILED",
              error: {
                schemaVersion: 1,
                error: {
                  code: "WORKER_RECOVERY_EXHAUSTED",
                  message: "任务多次中断，请重新尝试。",
                  retryable: true,
                  traceId: id,
                },
              },
            });
            await client.query(
              "UPDATE learning_items SET payload=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",
              [id, JSON.stringify(payload)],
            );
            await appendEvent(client, run.id, "item.completed", {
              runId: run.id,
              item: payload,
            });
            const current = await snapshot(client, run);
            await client.query(
              "UPDATE learning_runs SET status=$2 WHERE id=$1",
              [run.id, current.status],
            );
            await appendEvent(
              client,
              run.id,
              current.completedCount === current.itemCount
                ? "run.completed"
                : "run.updated",
              {
                runId: run.id,
                status: current.status,
                completedCount: current.completedCount,
                itemCount: current.itemCount,
              },
            );
            return 1;
          }
        } else {
          // Recheck under the run lock: another recovery loop may already have republished.
          const recent = await client.query(
            "SELECT 1 FROM outbox_events WHERE item_id=$1 AND (published_at IS NULL OR created_at>now()-interval '60 seconds') LIMIT 1",
            [id],
          );
          if (recent.rowCount) return 0;
        }
        await client.query(
          "UPDATE learning_items SET lease_token=NULL,lease_until=NULL WHERE id=$1",
          [id],
        );
        await client.query(
          "INSERT INTO outbox_events(id,item_id) VALUES ($1,$2)",
          [randomUUID(), id],
        );
        return 1;
      });
    }
    return recovered;
  }

  async purgeExpired(): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM learning_runs WHERE id IN (SELECT id FROM learning_runs WHERE expires_at<=now() LIMIT 100)",
    );
    return result.rowCount ?? 0;
  }
}
