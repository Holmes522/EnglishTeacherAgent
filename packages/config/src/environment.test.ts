import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

describe("parseEnvironment", () => {
  it("applies safe local defaults without requiring provider credentials", () => {
    expect(parseEnvironment({})).toEqual({
      nodeEnv: "development",
      port: 3000,
      logLevel: "info",
      anonymousRetentionDays: 7,
    });
  });

  it("coerces valid string values from process environments", () => {
    expect(
      parseEnvironment({
        NODE_ENV: "production",
        PORT: "8080",
        LOG_LEVEL: "warn",
        ANONYMOUS_RETENTION_DAYS: "14",
      }),
    ).toEqual({
      nodeEnv: "production",
      port: 8080,
      logLevel: "warn",
      anonymousRetentionDays: 14,
    });
  });

  it("rejects ports outside the TCP range", () => {
    expect(() => parseEnvironment({ PORT: "70000" })).toThrow();
  });
});
