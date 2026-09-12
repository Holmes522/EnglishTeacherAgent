import { describe, expect, it } from "vitest";
import { assertSameOrigin, readJson } from "./http.js";

describe("HTTP input boundaries", () => {
  it("rejects cross-origin cookie-authenticated mutations", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://teacher.test/api/v1/session", {
          method: "POST",
          headers: { Origin: "https://attacker.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://teacher.test/api/v1/session", {
          method: "POST",
          headers: { Origin: "https://teacher.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://teacher.test/api/v1/session", {
          headers: { "Sec-Fetch-Site": "cross-site" },
        }),
      ),
    ).toThrow();
  });
  it("limits streamed bodies even when Content-Length is absent", async () => {
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "x".repeat(40_000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("distinguishes malformed JSON from unsupported content types", async () => {
    await expect(
      readJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readJson(new Request("http://localhost", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 415 });
  });
});
