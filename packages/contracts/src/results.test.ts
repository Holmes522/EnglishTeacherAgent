import { describe, expect, it } from "vitest";

import {
  capabilityManifestSchema,
  learningResultSchema,
  sentenceReviewSchema,
} from "./results.js";

const validReview = {
  original: "He go to school yesterday.",
  totalScore: 72,
  dimensions: {
    grammar: 22,
    vocabulary: 20,
    naturalness: 17,
    spellingAndPunctuation: 13,
  },
  confidence: "HIGH",
  assumptions: [],
  issues: [
    {
      issueId: "issue_1",
      category: "TENSE",
      severity: "ERROR",
      range: { start: 3, end: 5 },
      originalText: "go",
      replacement: "went",
      explanation: "yesterday 要求使用过去时。",
    },
  ],
  minimalCorrection: "He went to school yesterday.",
  summary: "需要修正动词时态。",
  speakable: [],
  rubricVersion: "internal-100-v1",
} as const;

describe("sentenceReviewSchema", () => {
  it("accepts a score equal to the sum of all dimensions", () => {
    expect(sentenceReviewSchema.safeParse(validReview).success).toBe(true);
  });

  it("rejects a total score that differs from the dimension sum", () => {
    expect(
      sentenceReviewSchema.safeParse({ ...validReview, totalScore: 73 }).success,
    ).toBe(false);
  });

  it("rejects issue ranges that do not select the reported original text", () => {
    const invalidIssue = { ...validReview.issues[0], range: { start: 0, end: 2 } };

    expect(
      sentenceReviewSchema.safeParse({ ...validReview, issues: [invalidIssue] }).success,
    ).toBe(false);
  });
});

describe("learningResultSchema", () => {
  it("requires a versioned discriminant for sentence results", () => {
    expect(
      learningResultSchema.safeParse({
        schemaVersion: 1,
        type: "SENTENCE_REVIEW",
        data: validReview,
      }).success,
    ).toBe(true);

    expect(
      learningResultSchema.safeParse({ type: "SENTENCE_REVIEW", data: validReview }).success,
    ).toBe(false);
  });
});

describe("capabilityManifestSchema", () => {
  it("represents unavailable speech explicitly", () => {
    expect(
      capabilityManifestSchema.parse({
        schemaVersion: 1,
        speech: { status: "NOT_ENABLED" },
        targetLanguages: ["en"],
        uiLocales: ["zh-CN"],
        extensionSlots: ["header", "composer.before", "result.card.after", "sidebar"],
      }).speech.status,
    ).toBe("NOT_ENABLED");
  });
});

