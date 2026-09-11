import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.js";

describe("web security headers", () => {
  it("applies the baseline browser security policy to every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries(
      (rules?.[0]?.headers ?? []).map(({ key, value }) => [key, value]),
    );

    expect(rules?.[0]?.source).toBe("/(.*)");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
  });
});
