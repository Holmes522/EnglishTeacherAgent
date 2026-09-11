import { describe, expect, it } from "vitest";
import { assertItemTransition, summarizeStatuses } from "./state.js";

describe("learning state machine", () => {
  it("allows cancellation before execution and terminal results after execution", () => {
    expect(() => assertItemTransition("PENDING", "CANCELLED")).not.toThrow();
    expect(() => assertItemTransition("PENDING", "RUNNING")).not.toThrow();
    expect(() => assertItemTransition("RUNNING", "SUCCEEDED")).not.toThrow();
    expect(() => assertItemTransition("RUNNING", "FAILED")).not.toThrow();
  });
  it("rejects resurrection and skipping execution", () => {
    expect(() => assertItemTransition("SUCCEEDED", "RUNNING")).toThrow();
    expect(() => assertItemTransition("CANCELLED", "SUCCEEDED")).toThrow();
    expect(() => assertItemTransition("PENDING", "SUCCEEDED")).toThrow();
  });
  it("counts terminal items and distinguishes partial failure", () => {
    expect(summarizeStatuses(["PENDING", "PENDING"])).toEqual({ status: "QUEUED", completedCount: 0 });
    expect(summarizeStatuses(["SUCCEEDED", "RUNNING"])).toEqual({ status: "RUNNING", completedCount: 1 });
    expect(summarizeStatuses(["SUCCEEDED", "FAILED"])).toEqual({ status: "PARTIAL_SUCCESS", completedCount: 2 });
    expect(summarizeStatuses(["FAILED"])).toEqual({ status: "FAILED", completedCount: 1 });
    expect(summarizeStatuses(["SUCCEEDED", "CANCELLED"])).toEqual({ status: "CANCELLED", completedCount: 2 });
    expect(summarizeStatuses(["SUCCEEDED"])).toEqual({ status: "SUCCEEDED", completedCount: 1 });
  });
});
