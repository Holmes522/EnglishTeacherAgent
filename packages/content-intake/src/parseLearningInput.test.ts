import { describe, expect, it } from "vitest";

import goldenCases from "../../../tests/golden/intake-cases.json" with { type: "json" };
import {
  IntakeLimitError,
  IntakeValidationError,
  parseLearningInput,
} from "./parseLearningInput.js";

describe("parseLearningInput", () => {
  it("splits mixed numbered and bulleted input while preserving order", () => {
    const result = parseLearningInput({
      rawText: "1. apple\n- He go to school yesterday.\n• resilient",
      intent: "AUTO",
    });

    expect(result.items.map((item) => item.originalText)).toEqual([
      "apple",
      "He go to school yesterday.",
      "resilient",
    ]);
    expect(result.items.map((item) => item.detectedKind)).toEqual([
      "WORD",
      "SENTENCE",
      "WORD",
    ]);
  });

  it("normalizes compatibility characters without changing original text", () => {
    const result = parseLearningInput({ rawText: "\"ａｐｐｌｅ\"", intent: "AUTO" });

    expect(result.items[0]).toMatchObject({
      originalText: "ａｐｐｌｅ",
      normalizedText: "apple",
    });
  });

  it.each([
    ["apple", "WORD"],
    ["take off", "WORD"],
    ["I went home.", "SENTENCE"],
    ["只给例句", "INSTRUCTION"],
    ["...", "UNKNOWN"],
  ] as const)("classifies %s as %s", (text, expectedKind) => {
    const result = parseLearningInput({ rawText: text, intent: "AUTO" });
    expect(result.items[0]?.detectedKind).toBe(expectedKind);
  });

  it("uses an explicit request intent instead of an inferred intent", () => {
    const result = parseLearningInput({ rawText: "apple", intent: "WORD_FORMS" });
    expect(result.intent).toBe("WORD_FORMS");
  });

  it("infers an examples intent from a natural-language instruction", () => {
    const result = parseLearningInput({ rawText: "只给例句\napple", intent: "AUTO" });
    expect(result.intent).toBe("EXAMPLES");
  });

  it("rejects more than 20 items without truncating", () => {
    const rawText = Array.from({ length: 21 }, (_, index) => `word${index}`).join("\n");
    expect(() => parseLearningInput({ rawText, intent: "AUTO" })).toThrow(IntakeLimitError);
  });

  it("rejects more than 5000 Unicode code points", () => {
    expect(() =>
      parseLearningInput({ rawText: "😀".repeat(5_001), intent: "AUTO" }),
    ).toThrow(IntakeLimitError);
  });

  it("rejects input that contains only whitespace", () => {
    expect(() => parseLearningInput({ rawText: "  \n\t ", intent: "AUTO" })).toThrow(
      IntakeValidationError,
    );
  });

  it.each(goldenCases)("classifies golden case: $text", ({ text, kind }) => {
    const result = parseLearningInput({ rawText: text, intent: "AUTO" });
    expect(result.items[0]?.detectedKind).toBe(kind);
  });
});
