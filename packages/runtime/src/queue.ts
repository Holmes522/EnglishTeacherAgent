import { Queue, Worker } from "bullmq";
import { transaction } from "./database.js";
import type { ItemProcessor } from "./processor.js";
import type { Outcome, RunRepository } from "./repository.js";

const queueName = "learning-items-v1";
function connection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

export function createQueue(redisUrl: string, name = queueName) {
  return new Queue<{ itemId: string }>(name, {
    connection: {
      ...connection(redisUrl),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  });
}

export async function publishOutbox(
  repository: RunRepository,
  queue: ReturnType<typeof createQueue>,
): Promise<number> {
  await queue.waitUntilReady();
  return transaction(repository.pool, async (client) => {
    const events = (
      await client.query<{ id: string; item_id: string }>(
        "SELECT id, item_id FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    for (const event of events) {
      await queue.add(
        "process-item",
        { itemId: event.item_id },
        {
          jobId: event.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );
      await client.query(
        "UPDATE outbox_events SET published_at=now() WHERE id=$1",
        [event.id],
      );
    }
    return events.length;
  });
}

export function startConsumer(
  repository: RunRepository,
  redisUrl: string,
  processor: ItemProcessor,
  name = queueName,
) {
  const worker = new Worker<{ itemId: string }>(
    name,
    async (job) => {
      const claim = await repository.claim(job.data.itemId);
      if (!claim) return;
      const controller = new AbortController();
      const heartbeat = setInterval(() => {
        void repository
          .renew(claim.item.itemId, claim.token)
          .then((renewed) => {
            if (!renewed) controller.abort();
          })
          .catch(() => controller.abort());
      }, 8_000);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        let outcome: Outcome;
        try {
          outcome = await Promise.race([
            processor(claim.item, controller.signal),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(new Error("PROCESSING_TIMEOUT"));
              }, 20_000);
            }),
          ]);
        } catch {
          outcome = {
            error: {
              schemaVersion: 1,
              error: {
                code: "PROCESSING_FAILED",
                message: "处理失败，请稍后重试。",
                retryable: true,
                traceId: claim.item.itemId,
              },
            },
          };
        }
        await repository.finish(claim.item.itemId, claim.token, outcome);
      } finally {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        controller.abort();
      }
    },
    { connection: connection(redisUrl), concurrency: 4, lockDuration: 30_000 },
  );
  let nextErrorLogAt = 0;
  worker.on("error", () => {
    if (Date.now() >= nextErrorLogAt) {
      console.error(JSON.stringify({ event: "worker.connection_error" }));
      nextErrorLogAt = Date.now() + 30_000;
    }
  });
  worker.on("failed", (job) =>
    console.error(
      JSON.stringify({ event: "worker.job_failed", itemId: job?.data.itemId }),
    ),
  );
  return worker;
}
