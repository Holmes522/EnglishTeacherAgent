import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lookupOfflineTranslation,
  parseOfflineSourceManifest,
} from "./offlineTranslation.js";

const sourceEntry = {
  word: "sample",
  lang_code: "en",
  pos: "noun",
  senses: [{ glosses: ["synthetic gloss"] }],
  translations: [
    {
      lang_code: "zh",
      word: "合成译词",
      sense: "synthetic label",
      lang: "Chinese",
      roman: "synthetic",
      alt: "合成变体",
      note: "synthetic note",
      tags: ["synthetic tag"],
      topics: ["synthetic topic"],
    },
    { lang_code: "cmn", word: "合成译词二" },
    { lang_code: "zh" },
  ],
};
const encode = (rows: unknown[]) =>
  Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n\n"));
const manifestFor = (bytes: Uint8Array) => ({
  schemaVersion: 1,
  purpose: "OFFLINE_EVALUATION_ONLY",
  snapshots: [
    {
      headword: "sample",
      source: {
        provider: "KAIKKI_WIKTEXTRACT",
        snapshotSha256: createHash("sha256").update(bytes).digest("hex"),
        retrievedAt: "2026-09-15T10:00:00Z",
        downloadUrl:
          "https://kaikki.org/dictionary/English/meaning/s/sa/sample.jsonl",
        upstreamPageUrl: "https://en.wiktionary.org/wiki/sample#English",
        upstreamRevision: null,
        attribution: "Synthetic test authors",
        license: {
          name: "Synthetic license declaration",
          url: "https://example.org/license",
        },
        changes: [
          "Synthetic extraction, language filter, grouping and field rename",
        ],
      },
    },
  ],
});
afterEach(() => vi.unstubAllGlobals());

describe("offline translation source manifest and adapter", () => {
  it("maps verified bytes to the shared contract without fetching or mutating inputs", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw Error("must not fetch");
      }),
    );
    const bytes = encode([sourceEntry, { ...sourceEntry, pos: "verb" }]);
    const manifest = manifestFor(bytes);
    const original = structuredClone(manifest);
    const result = lookupOfflineTranslation(manifest, " ＳＡＭＰＬＥ ", bytes);
    expect(result).toMatchObject({
      schemaVersion: 1,
      type: "LEXICAL_TRANSLATION",
      data: {
        query: " ＳＡＭＰＬＥ ",
        status: "FOUND",
        coverage: "SNAPSHOT_ONLY",
        isCompleteForSource: false,
        source: manifest.snapshots[0]!.source,
      },
    });
    expect(
      result.data.entries.map((entry) => [
        entry.partOfSpeech,
        entry.snapshotLine,
      ]),
    ).toEqual([
      ["noun", 1],
      ["verb", 3],
    ]);
    expect(result.data.entries[0]!.incompleteTranslationCount).toBe(1);
    expect(result.data.entries[0]!.translationGroups).toEqual([
      {
        label: "synthetic label",
        senseBinding: "UNRESOLVED",
        translations: [
          {
            text: "合成译词",
            languageCode: "zh",
            languageName: "Chinese",
            romanization: "synthetic",
            alternative: "合成变体",
            note: "synthetic note",
            tags: ["synthetic tag"],
            topics: ["synthetic topic"],
          },
        ],
      },
      {
        label: null,
        senseBinding: "UNRESOLVED",
        translations: [
          { text: "合成译词二", languageCode: "cmn", tags: [], topics: [] },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("synthetic gloss");
    expect(fetch).not.toHaveBeenCalled();
    result.data.source.changes.push("changed output");
    expect(manifest).toEqual(original);
    expect(
      bytes.equals(encode([sourceEntry, { ...sourceEntry, pos: "verb" }])),
    ).toBe(true);
  });
  it("keeps a configured snapshot without Chinese translations distinct from missing English entries", () => {
    for (const [row, expected] of [
      [{ ...sourceEntry, translations: [] }, "NO_CHINESE_TRANSLATION"],
      [{ ...sourceEntry, lang_code: "fr" }, "NOT_FOUND_IN_SNAPSHOT"],
    ] as const) {
      const bytes = encode([row]);
      expect(
        lookupOfflineTranslation(manifestFor(bytes), "sample", bytes).data
          .status,
      ).toBe(expected);
    }
  });
  it("does not claim not-found for unconfigured or misspelled queries", () => {
    const bytes = encode([sourceEntry]);
    expect(() =>
      lookupOfflineTranslation(manifestFor(bytes), "samples", bytes),
    ).toThrow("SNAPSHOT_NOT_CONFIGURED");
    expect(() =>
      lookupOfflineTranslation(
        { schemaVersion: 1, purpose: "OFFLINE_EVALUATION_ONLY", snapshots: [] },
        "sample",
        bytes,
      ),
    ).toThrow("SNAPSHOT_NOT_CONFIGURED");
  });
  it.each(["", " \n", "😀".repeat(101)])("rejects invalid query", (query) => {
    const bytes = encode([sourceEntry]);
    expect(() =>
      lookupOfflineTranslation(manifestFor(bytes), query, bytes),
    ).toThrow("INVALID_QUERY");
  });
  it("rejects byte tampering without exposing diagnostic content", () => {
    const bytes = encode([sourceEntry]);
    expect(() =>
      lookupOfflineTranslation(
        manifestFor(bytes),
        "sample",
        Buffer.concat([bytes, Buffer.from("private diagnostic")]),
      ),
    ).toThrow(/^INVALID_SOURCE_SNAPSHOT$/);
  });
  it.each([
    Buffer.from("private malformed JSON"),
    Buffer.from([0xff]),
    Buffer.alloc(0),
    Buffer.alloc(2_000_001),
  ])("rejects malformed, empty, non-UTF8 or oversized bytes", (bytes) => {
    expect(() =>
      lookupOfflineTranslation(manifestFor(bytes), "sample", bytes),
    ).toThrow(/^INVALID_SOURCE_SNAPSHOT$/);
  });
  it("rejects other English headwords even with a matching hash", () => {
    const bytes = encode([sourceEntry, { ...sourceEntry, word: "other" }]);
    expect(() =>
      lookupOfflineTranslation(manifestFor(bytes), "sample", bytes),
    ).toThrow("SOURCE_HEADWORD_MISMATCH");
  });
  it("fails rather than truncating a source value beyond the contract's UTF-16 bound", () => {
    const bytes = encode([
      {
        ...sourceEntry,
        translations: [{ lang_code: "zh", word: "😀".repeat(2_001) }],
      },
    ]);
    expect(() =>
      lookupOfflineTranslation(manifestFor(bytes), "sample", bytes),
    ).toThrow(/^INVALID_TRANSLATION_RESULT$/);
  });
  it.each([
    { downloadUrl: "https://evil.example/sample.jsonl" },
    {
      downloadUrl:
        "https://kaikki.org/dictionary/English/meaning/o/ot/other.jsonl",
    },
    {
      downloadUrl:
        "https://kaikki.org/dictionary/English/meaning/s/sa/sample.jsonl?token=private",
    },
    { upstreamPageUrl: "https://en.wiktionary.org/wiki/other#English" },
    {
      upstreamPageUrl:
        "https://en.wiktionary.org.evil.example/wiki/sample#English",
    },
    { snapshotSha256: "wrong hash" },
    { attribution: " " },
  ])(
    "rejects invalid source association without echoing metadata",
    (fields) => {
      const manifest = manifestFor(encode([sourceEntry]));
      Object.assign(manifest.snapshots[0]!.source, fields);
      expect(() => parseOfflineSourceManifest(manifest)).toThrow(
        /^INVALID_SOURCE_MANIFEST$/,
      );
    },
  );
  it.each(["Sample", " sample ", "../sample"])(
    'rejects noncanonical or invalid manifest headword "%s"',
    (headword) => {
      const manifest = manifestFor(encode([sourceEntry]));
      manifest.snapshots[0]!.headword = headword;
      expect(() => parseOfflineSourceManifest(manifest)).toThrow(
        "INVALID_SOURCE_MANIFEST",
      );
    },
  );
  it("rejects duplicate headwords, duplicate hashes, excessive rows and non-evaluation mode", () => {
    const manifest = manifestFor(encode([sourceEntry]));
    manifest.snapshots.push(structuredClone(manifest.snapshots[0]!));
    expect(() => parseOfflineSourceManifest(manifest)).toThrow(
      "INVALID_SOURCE_MANIFEST",
    );
    Object.assign(manifest.snapshots[1]!, { headword: "other" });
    Object.assign(manifest.snapshots[1]!.source, {
      downloadUrl:
        "https://kaikki.org/dictionary/English/meaning/o/ot/other.jsonl",
      upstreamPageUrl: "https://en.wiktionary.org/wiki/other#English",
    });
    expect(() => parseOfflineSourceManifest(manifest)).toThrow(
      "INVALID_SOURCE_MANIFEST",
    );
    expect(() =>
      parseOfflineSourceManifest({
        ...manifest,
        snapshots: Array(101).fill(manifest.snapshots[0]),
      }),
    ).toThrow("INVALID_SOURCE_MANIFEST");
    expect(() =>
      parseOfflineSourceManifest({ ...manifest, purpose: "PRODUCTION" }),
    ).toThrow("INVALID_SOURCE_MANIFEST");
  });
  it("rejects missing provenance rather than adding invented defaults", () => {
    const manifest = manifestFor(encode([sourceEntry]));
    expect(() =>
      parseOfflineSourceManifest({
        ...manifest,
        snapshots: [{ headword: "sample" }],
      }),
    ).toThrow("INVALID_SOURCE_MANIFEST");
  });
});
