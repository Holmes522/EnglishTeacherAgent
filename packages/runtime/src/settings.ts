export function runtimeSettings(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  const redisUrl = env.REDIS_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//u.test(databaseUrl))
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  if (!redisUrl || !/^rediss?:\/\//u.test(redisUrl))
    throw new Error("REDIS_URL must be a Redis URL");
  const retentionDays = Number(env.ANONYMOUS_RETENTION_DAYS ?? 7);
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 30
  )
    throw new Error("Retention must be 1 to 30 days");
  const processorMode = env.PROCESSOR_MODE ?? "disabled";
  if (!["fixture", "disabled"].includes(processorMode))
    throw new Error("Unknown PROCESSOR_MODE");
  return { databaseUrl, redisUrl, retentionDays, processorMode };
}
