import { describe, expect, it } from "vitest";
import { PendingRequestKey } from "./request-key";

describe("pending request idempotency", () => {
  it("reuses the same key until an acknowledged response", () => {
    const pending = new PendingRequestKey();
    const first = pending.get("retry:run-1");
    expect(pending.get("retry:run-1")).toBe(first);
    pending.clear();
    expect(pending.get("retry:run-1")).not.toBe(first);
  });

  it("separates changed input and different run actions", () => {
    const pending = new PendingRequestKey();
    const first = pending.get("retry:run-1");
    expect(pending.get("retry:run-2")).not.toBe(first);
    expect(pending.get("cancel:run-1")).not.toBe(first);
  });
});
