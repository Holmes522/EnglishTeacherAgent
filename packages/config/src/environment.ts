import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    ANONYMOUS_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  })
  .transform((value) => ({
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    anonymousRetentionDays: value.ANONYMOUS_RETENTION_DAYS,
  }));

export type AppEnvironment = z.output<typeof environmentSchema>;

export function parseEnvironment(
  environment: Record<string, string | undefined>,
): AppEnvironment {
  return environmentSchema.parse(environment);
}
