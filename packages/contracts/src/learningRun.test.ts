import { describe, expect, it } from "vitest";

import {
  createLearningRunInputSchema,
  learningRunSchema,
} from "./learningRun.js";

const baseInput = {
  rawText: "run",
  intent: "AUTO",
  uiLocale: "zh-CN",
  explanationLocale: "zh-CN",
  targetLanguage: "en",
} as const;

describe("createLearningRunInputSchema", () => {
  it("accepts exactly 5000 Unicode code points", () => {
    expect(
      createLearningRunInputSchema.safeParse({
        ...baseInput,
        rawText: "😀".repeat(5_000),
      }).success,
    ).toBe(true);
  });

  it("rejects more than 5000 Unicode code points", () => {
    expect(
      createLearningRunInputSchema.safeParse({
        ...baseInput,
        rawText: "a".repeat(5_001),
      }).success,
    ).toBe(false);
  });

  it("keeps UI, explanation and target languages separate", () => {
    const result = createLearningRunInputSchema.parse({
      ...baseInput,
      uiLocale: "en-US",
      explanationLocale: "zh-CN",
      targetLanguage: "en",
    });

    expect(result).toMatchObject({
      uiLocale: "en-US",
      explanationLocale: "zh-CN",
      targetLanguage: "en",
    });
  });
});

describe("learningRunSchema", () => {
  it("rejects a run with more than 20 items", () => {
    const item = {
      schemaVersion: 1,
      itemId: "li_test",
      position: 0,
      originalText: "run",
      normalizedText: "run",
      detectedKind: "WORD",
      status: "PENDING",
    } as const;

    expect(
      learningRunSchema.safeParse({
        schemaVersion: 1,
        runId: "lr_test",
        status: "QUEUED",
        itemCount: 21,
        completedCount: 0,
        items: Array.from({ length: 21 }, (_, position) => ({ ...item, position })),
        createdAt: "2026-09-09T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires successful items to contain a result", () => {
    expect(
      learningRunSchema.safeParse({
        schemaVersion: 1,
        runId: "lr_test",
        status: "SUCCEEDED",
        itemCount: 1,
        completedCount: 1,
        items: [
          {
            schemaVersion: 1,
            itemId: "li_test",
            position: 0,
            originalText: "run",
            normalizedText: "run",
            detectedKind: "WORD",
            status: "SUCCEEDED",
          },
        ],
        createdAt: "2026-09-09T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires failed items to contain a public error", () => {
    expect(
      learningRunSchema.safeParse({
        schemaVersion: 1,
        runId: "lr_test",
        status: "FAILED",
        itemCount: 1,
        completedCount: 1,
        items: [
          {
            schemaVersion: 1,
            itemId: "li_test",
            position: 0,
            originalText: "run",
            normalizedText: "run",
            detectedKind: "WORD",
            status: "FAILED",
          },
        ],
        createdAt: "2026-09-09T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires item positions to match their original order", () => {
    const item = {
      schemaVersion: 1,
      itemId: "li_test",
      originalText: "run",
      normalizedText: "run",
      detectedKind: "WORD",
      status: "PENDING",
    } as const;

    expect(
      learningRunSchema.safeParse({
        schemaVersion: 1,
        runId: "lr_test",
        status: "QUEUED",
        itemCount: 2,
        completedCount: 0,
        items: [
          { ...item, position: 1 },
          { ...item, itemId: "li_test_2", position: 0 },
        ],
        createdAt: "2026-09-09T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
