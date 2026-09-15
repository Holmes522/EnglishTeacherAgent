import { describe, expect, it } from "vitest";
import { lexicalTranslationResultSchema } from "./lexicalTranslation.js";
import { learningResultSchema } from "./results.js";

// Project-authored synthetic data, not dictionary content or a license approval.
const translation = {
  text: "合成译词",
  languageCode: "zh",
  languageName: "Chinese",
  romanization: "synthetic",
  alternative: "合成变体",
  note: "synthetic note",
  tags: ["synthetic tag"],
  topics: ["synthetic topic"],
};
const group = {
  label: null,
  senseBinding: "UNRESOLVED",
  translations: [translation],
};
const entry = {
  headword: "sample",
  partOfSpeech: "noun",
  snapshotLine: 201,
  incompleteTranslationCount: 0,
  translationGroups: [group],
};
const fixture = () => ({
  schemaVersion: 1,
  type: "LEXICAL_TRANSLATION",
  data: {
    query: " ＳＡＭＰＬＥ ",
    targetLanguage: "en",
    coverage: "SNAPSHOT_ONLY",
    isCompleteForSource: false,
    status: "FOUND",
    entries: [structuredClone(entry)],
    source: {
      provider: "KAIKKI_WIKTEXTRACT",
      snapshotSha256: "a".repeat(64),
      retrievedAt: "2026-09-15T10:00:00Z",
      downloadUrl: "https://example.org/sample.jsonl",
      upstreamPageUrl: "https://example.org/wiki/sample",
      upstreamRevision: null,
      attribution: "Synthetic contributors",
      license: {
        name: "Synthetic license",
        url: "https://example.org/license",
      },
      changes: ["Synthetic extraction and grouping"],
    },
  },
});

describe("limited lexical translation contract", () => {
  it("preserves query, qualifiers, unknown revision and snapshot-local line without asserting completeness", () => {
    const value = fixture();
    expect(lexicalTranslationResultSchema.parse(value)).toEqual(value);
    expect(learningResultSchema.safeParse(value).success).toBe(false);
  });
  it("accepts a headword with no Chinese translations", () => {
    const value = fixture();
    value.data.status = "NO_CHINESE_TRANSLATION";
    value.data.entries[0]!.translationGroups = [];
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(true);
  });
  it("accepts absence only within an identified snapshot", () => {
    const value = fixture();
    value.data.status = "NOT_FOUND_IN_SNAPSHOT";
    value.data.entries = [];
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(true);
    expect(
      lexicalTranslationResultSchema.safeParse({
        ...value,
        data: { ...value.data, source: undefined },
      }).success,
    ).toBe(false);
  });
  it.each([
    ["FOUND", []],
    ["FOUND", [{ ...entry, translationGroups: [] }]],
    ["NO_CHINESE_TRANSLATION", []],
    ["NO_CHINESE_TRANSLATION", [entry]],
    ["NOT_FOUND_IN_SNAPSHOT", [entry]],
    ["HTTP_NOT_FOUND", []],
    ["FETCH_ERROR", []],
  ])("rejects inconsistent or failure status %s", (status, entries) => {
    const value = fixture();
    expect(
      lexicalTranslationResultSchema.safeParse({
        ...value,
        data: { ...value.data, status, entries },
      }).success,
    ).toBe(false);
  });
  it("rejects empty groups and duplicate snapshot lines while retaining homographs", () => {
    const value = fixture();
    value.data.entries.push(structuredClone(entry));
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
    value.data.entries[1]!.snapshotLine = 202;
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(true);
    value.data.entries[0]!.translationGroups[0]!.translations = [];
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it.each(["", " \t\n", "x".repeat(201), "😀".repeat(101)])(
    "rejects invalid query length or blank input",
    (query) => {
      const value = fixture();
      value.data.query = query;
      expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(
        false,
      );
    },
  );
  it("accepts exactly 200 UTF-16 units without normalizing input", () => {
    const value = fixture();
    value.data.query = "😀".repeat(100);
    expect(lexicalTranslationResultSchema.parse(value).data.query).toBe(
      value.data.query,
    );
  });
  it.each([
    { headword: " " },
    { headword: "😀".repeat(101) },
    { partOfSpeech: " " },
    { partOfSpeech: "x".repeat(51) },
    { snapshotLine: 0 },
    { snapshotLine: 1.5 },
    { incompleteTranslationCount: -1 },
    { incompleteTranslationCount: 10_001 },
  ])("rejects invalid entry field %j", (fields) => {
    const value = fixture();
    Object.assign(value.data.entries[0]!, fields);
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { text: " " },
    { text: "x".repeat(4_001) },
    { text: "😀".repeat(2_001) },
    { languageCode: "en" },
    { note: "x".repeat(4_001) },
    { tags: Array(101).fill("tag") },
    { topics: ["x".repeat(4_001)] },
    { tags: undefined },
  ])("rejects invalid translation field", (fields) => {
    const value = fixture();
    Object.assign(
      value.data.entries[0]!.translationGroups[0]!.translations[0]!,
      fields,
    );
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it("accepts cmn and absent optional fields", () => {
    const value = fixture();
    const minimal = {
      text: "synthetic",
      languageCode: "cmn",
      tags: [],
      topics: [],
    };
    const parsed = lexicalTranslationResultSchema.parse({
      ...value,
      data: {
        ...value.data,
        entries: [
          {
            ...entry,
            translationGroups: [{ ...group, translations: [minimal] }],
          },
        ],
      },
    });
    expect(
      parsed.data.entries[0]!.translationGroups[0]!.translations[0],
    ).toEqual(minimal);
  });
  it("rejects claimed completeness or resolved sense binding", () => {
    const value = fixture();
    value.data.isCompleteForSource = true;
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
    value.data.isCompleteForSource = false;
    value.data.entries[0]!.translationGroups[0]!.senseBinding = "RESOLVED";
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it("bounds entries and translation totals across groups", () => {
    const value = fixture();
    value.data.entries = Array.from({ length: 101 }, (_, i) => ({
      ...entry,
      snapshotLine: i + 1,
    }));
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
    value.data.entries = [
      {
        ...entry,
        translationGroups: [
          { ...group, translations: Array(5_000).fill(translation) },
          { ...group, translations: Array(5_001).fill(translation) },
        ],
      },
    ];
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
    value.data.entries[0]!.translationGroups[1]!.translations.pop();
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    { snapshotSha256: "A".repeat(64) },
    { snapshotSha256: "a".repeat(63) },
    { retrievedAt: "2026-09-15" },
    { retrievedAt: "2026-09-15T10:00:00+08:00" },
    { attribution: " " },
    { upstreamRevision: " " },
    { provider: "OTHER" },
    { changes: [] },
    { changes: [" "] },
    { changes: Array(21).fill("change") },
    { license: { name: " ", url: "https://example.org" } },
  ])("rejects malformed source metadata", (fields) => {
    const value = fixture();
    Object.assign(value.data.source, fields);
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    "http://example.org",
    "javascript:alert(1)",
    "not a url",
    "https://user:pass@example.org",
    "https://example.org/" + "x".repeat(2_000),
  ])("rejects unsafe or oversized source URLs", (url) => {
    const value = fixture();
    for (const field of ["downloadUrl", "upstreamPageUrl"] as const) {
      expect(
        lexicalTranslationResultSchema.safeParse({
          ...value,
          data: {
            ...value.data,
            source: { ...value.data.source, [field]: url },
          },
        }).success,
      ).toBe(false);
    }
    value.data.source.license.url = url;
    expect(lexicalTranslationResultSchema.safeParse(value).success).toBe(false);
  });
  it.each([" ", "x".repeat(4_001)])("rejects invalid group labels", (label) => {
    const value = fixture();
    expect(
      lexicalTranslationResultSchema.safeParse({
        ...value,
        data: {
          ...value.data,
          entries: [{ ...entry, translationGroups: [{ ...group, label }] }],
        },
      }).success,
    ).toBe(false);
  });
});
