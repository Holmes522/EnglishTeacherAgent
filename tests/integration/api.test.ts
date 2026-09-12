import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "./database.js";
import { POST as session } from "../../apps/web/app/api/v1/session/route.js";
import { POST as create } from "../../apps/web/app/api/v1/learning-runs/route.js";
import { GET as get } from "../../apps/web/app/api/v1/learning-runs/[runId]/route.js";
import { GET as events } from "../../apps/web/app/api/v1/learning-runs/[runId]/events/route.js";
import { POST as cancel } from "../../apps/web/app/api/v1/learning-runs/[runId]/cancel/route.js";
import { POST as retry } from "../../apps/web/app/api/v1/learning-runs/[runId]/retry/route.js";
import { repository } from "../../apps/web/lib/server.js";

const database = testDatabase();
process.env.DATABASE_URL = database.url;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";
let cookie = "";
const input = {
  rawText: "hello",
  intent: "AUTO",
  uiLocale: "zh-CN",
  explanationLocale: "zh-CN",
  targetLanguage: "en",
};
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000/api/v1/${path}`, {
    method,
    headers: {
      cookie,
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (runId: string) => ({ params: Promise.resolve({ runId }) });
beforeAll(async () => {
  await database.setup();
  const response = await session(request("session", "POST"));
  cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
});
afterAll(async () => {
  await repository().pool.end();
  await database.cleanup();
});
describe("Learning Runs HTTP contracts", () => {
  it("returns 202, keeps idempotency, and conceals tasks from other sessions", async () => {
    const key = randomUUID();
    const first = await create(
      request("learning-runs", "POST", input, { "Idempotency-Key": key }),
    );
    expect(first.status).toBe(202);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const run = await first.json();
    const repeated = await create(
      request("learning-runs", "POST", input, { "Idempotency-Key": key }),
    );
    expect((await repeated.json()).runId).toBe(run.runId);
    expect(
      (
        await get(
          request(`learning-runs/${run.runId}`, "GET", undefined, {
            cookie: "eta_session=" + "a".repeat(64),
          }),
          context(run.runId),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await create(
          request(
            "learning-runs",
            "POST",
            { ...input, rawText: "different" },
            { "Idempotency-Key": key },
          ),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await get(
          request(`learning-runs/${run.runId}`, "GET", undefined, {
            cookie: "",
          }),
          context(run.runId),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects oversized inputs and cross-site writes before creating jobs", async () => {
    expect(
      (
        await create(
          request(
            "learning-runs",
            "POST",
            { ...input, rawText: "a".repeat(5001) },
            { "Idempotency-Key": randomUUID() },
          ),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await create(
          request("learning-runs", "POST", input, {
            Origin: "https://evil.test",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await create(
          request(
            "learning-runs",
            "POST",
            { ...input, rawText: "   " },
            { "Idempotency-Key": randomUUID() },
          ),
        )
      ).status,
    ).toBe(422);
  });
  it("replays SSE by Last-Event-ID and reports terminal cancellation conflicts", async () => {
    const created = await create(
      request("learning-runs", "POST", input, {
        "Idempotency-Key": randomUUID(),
      }),
    );
    const run = await created.json();
    expect(
      (
        await cancel(
          request(`learning-runs/${run.runId}/cancel`, "POST"),
          context(run.runId),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await cancel(
          request(`learning-runs/${run.runId}/cancel`, "POST"),
          context(run.runId),
        )
      ).status,
    ).toBe(409);
    const response = await events(
      request(`learning-runs/${run.runId}/events`, "GET", undefined, {
        "Last-Event-ID": "1",
      }),
      context(run.runId),
    );
    const stream = await response.text();
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(stream).not.toContain("id: 1\n");
    expect(stream).toContain("id: 2\n");
    expect(stream).toContain("event: run.completed");
    expect(
      (
        await events(
          request(`learning-runs/${run.runId}/events`, "GET", undefined, {
            "Last-Event-ID": "invalid",
          }),
          context(run.runId),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await retry(
          request(`learning-runs/${run.runId}/retry`, "POST", undefined, {
            "Idempotency-Key": randomUUID(),
          }),
          context(run.runId),
        )
      ).status,
    ).toBe(409);
  });
});
