import {
  createPool,
  createQueue,
  disabledProcessor,
  fixtureProcessor,
  publishOutbox,
  RunRepository,
  runtimeSettings,
  startConsumer,
} from "@english-teacher/runtime";

const settings = runtimeSettings();
const pool = createPool(settings.databaseUrl);
pool.on("error", () =>
  console.error(JSON.stringify({ event: "database.connection_error" })),
);
const repository = new RunRepository(pool, settings.retentionDays);
const queue = createQueue(settings.redisUrl);
queue.on("error", () =>
  console.error(JSON.stringify({ event: "queue.connection_error" })),
);
const worker = startConsumer(
  repository,
  settings.redisUrl,
  settings.processorMode === "fixture" ? fixtureProcessor : disabledProcessor,
);
let stopping = false;
let inFlight: Promise<void> = Promise.resolve();
let busy = false;
const tick = () => {
  if (stopping || busy) return;
  busy = true;
  inFlight = (async () => {
    await repository.purgeExpired();
    await repository.recover();
    await publishOutbox(repository, queue);
  })()
    .catch(() => console.error(JSON.stringify({ event: "outbox.tick_failed" })))
    .finally(() => {
      busy = false;
    });
};
const timer = setInterval(tick, 1_000);
tick();
console.info(
  JSON.stringify({ event: "worker.started", mode: settings.processorMode }),
);
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  await inFlight;
  await worker.close();
  await queue.close();
  await pool.end();
};
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
