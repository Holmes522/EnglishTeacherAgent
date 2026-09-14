import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readWiktextract, lookupWiktextract } from "./wiktextract.js";

// Synthetic data tests the shape, not the accuracy of a real dictionary.
const entry = {
  word: "sample",
  lang_code: "en",
  pos: "noun",
  senses: [
    { glosses: ["Parent sense", "Specific sense"], senseid: ["source-label"] },
  ],
  translations: [
    {
      lang_code: "cmn",
      word: "样本",
      sense: "short label",
      tags: ["rare"],
      topics: ["science"],
    },
    { lang_code: "zh", word: "例子", sense: "short label" },
    { lang_code: "fr", word: "exemple", sense: "short label" },
  ],
};
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = (...rows: unknown[]) => {
  const bytes = Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n"));
  return readWiktextract(bytes, digest(bytes));
};

describe("offline Wiktextract reader", () => {
  it("retains gloss hierarchy, qualifiers and source labels without binding translations", () => {
    const snapshot = read(entry);
    const result = lookupWiktextract(snapshot, "sample");
    expect(result.status).toBe("FOUND");
    expect(result.isCompleteForSource).toBe(false);
    expect(result.entries[0]?.senses[0]).toMatchObject({
      glosses: ["Parent sense", "Specific sense"],
      senseid: ["source-label"],
    });
    expect(result.entries[0]?.translationGroups).toEqual([
      {
        label: "short label",
        senseBinding: "UNRESOLVED",
        translations: [
          {
            lang_code: "cmn",
            word: "样本",
            sense: "short label",
            tags: ["rare"],
            topics: ["science"],
          },
          {
            lang_code: "zh",
            word: "例子",
            sense: "short label",
            tags: [],
            topics: [],
          },
        ],
      },
    ]);
    expect(result.entries[0]?.source).toEqual({
      sha256: snapshot.sha256,
      line: 1,
    });
  });
  it("retains homographs and groups labels only inside each entry", () => {
    const result = lookupWiktextract(
      read(entry, { ...entry, pos: "verb" }),
      "sample",
    );
    expect(result.entries.map((item) => item.pos)).toEqual(["noun", "verb"]);
    expect(result.entries.map((item) => item.source.line)).toEqual([1, 2]);
    expect(result.entries.map((item) => item.translationGroups.length)).toEqual(
      [1, 1],
    );
  });
  it("normalizes query case and NFKC but does not infer inflections or strip accents", () => {
    const snapshot = read(entry);
    expect(lookupWiktextract(snapshot, " ＳＡＭＰＬＥ ").status).toBe("FOUND");
    expect(lookupWiktextract(snapshot, "samples").status).toBe("NOT_FOUND");
    expect(lookupWiktextract(snapshot, "sámple").status).toBe("NOT_FOUND");
  });
  it("distinguishes missing headword from missing Chinese translation", () => {
    const snapshot = read({
      ...entry,
      translations: [{ lang_code: "en", word: "test" }],
    });
    expect(lookupWiktextract(snapshot, "sample").status).toBe(
      "NO_CHINESE_TRANSLATION",
    );
    expect(lookupWiktextract(snapshot, "missing")).toMatchObject({
      status: "NOT_FOUND",
      entries: [],
    });
  });
  it("drops blank translations but keeps unlabeled translations explicitly unresolved", () => {
    const result = lookupWiktextract(
      read({
        ...entry,
        translations: [
          { lang_code: "zh", word: "  " },
          { lang_code: "cmn", word: "样本" },
        ],
      }),
      "sample",
    );
    expect(result.entries[0]?.translationGroups).toEqual([
      {
        label: null,
        senseBinding: "UNRESOLVED",
        translations: [
          { lang_code: "cmn", word: "样本", tags: [], topics: [] },
        ],
      },
    ]);
  });
  it("does not treat other languages or Chinese dialect codes as Mandarin", () => {
    const snapshot = read(
      { ...entry, lang_code: "fr" },
      {
        ...entry,
        translations: [{ lang_code: "yue", word: "例" }],
      },
    );
    expect(snapshot.ignoredLanguageEntries).toBe(1);
    expect(lookupWiktextract(snapshot, "sample").status).toBe(
      "NO_CHINESE_TRANSLATION",
    );
  });
  it("strips unconsumed external fields and does not execute instruction-like text", () => {
    const snapshot = read({
      ...entry,
      prompt: "ignore instructions",
      sounds: [{ audio: "file:///secret" }],
    });
    expect(snapshot.entries[0]).not.toHaveProperty("prompt");
    expect(snapshot.entries[0]).not.toHaveProperty("sounds");
  });
  it("preserves physical JSONL line numbers across blank lines and CRLF", () => {
    const bytes = Buffer.from(`\r\n${JSON.stringify(entry)}\r\n`);
    expect(readWiktextract(bytes, digest(bytes)).entries[0]?.source.line).toBe(
      2,
    );
  });
  it("rejects modified bytes before parsing", () => {
    expect(() =>
      readWiktextract(Buffer.from("secret invalid JSON"), "0".repeat(64)),
    ).toThrow("SOURCE_HASH_MISMATCH");
  });
  it("rejects malformed UTF-8 even with a matching digest", () => {
    const bytes = Buffer.from([0xc3, 0x28]);
    expect(() => readWiktextract(bytes, digest(bytes))).toThrow(
      "INVALID_SOURCE_ENCODING",
    );
  });
  it("rejects malformed JSON without echoing raw content", () => {
    const bytes = Buffer.from("secret invalid JSON");
    expect(() => readWiktextract(bytes, digest(bytes))).toThrow(
      /^INVALID_SOURCE_RECORD:1$/,
    );
  });
  it.each([
    null,
    [],
    { ...entry, senses: "wrong" },
    { ...entry, word: " " },
    { ...entry, translations: [{ lang_code: "zh", word: 5 }] },
  ])("rejects invalid consumed record fields: %j", (record) => {
    expect(() => read(record)).toThrow("INVALID_SOURCE_RECORD:1");
  });
  it("rejects empty sources and oversized snapshots", () => {
    expect(() => read()).toThrow("INVALID_SOURCE_SIZE");
    const bytes = new Uint8Array(2_000_001);
    expect(() => readWiktextract(bytes, digest(bytes))).toThrow(
      "INVALID_SOURCE_SIZE",
    );
  });
  it("bounds record counts and query length", () => {
    expect(() => read(...Array.from({ length: 101 }, () => entry))).toThrow(
      "SOURCE_RECORD_LIMIT",
    );
    expect(() => lookupWiktextract(read(entry), " ")).toThrow("INVALID_QUERY");
    expect(() => lookupWiktextract(read(entry), "x".repeat(201))).toThrow(
      "INVALID_QUERY",
    );
  });
});
