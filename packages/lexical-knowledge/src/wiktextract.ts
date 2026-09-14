import { createHash } from "node:crypto";
import { z } from "zod";

// Consumed subset, not a claim to validate every Wiktextract field.
// Source: https://github.com/tatuylonen/wiktextract/blob/master/src/wiktextract/extractor/en/type_utils.py
const text = z.string().max(4_000);
const labels = z.array(text).max(100);
const translationSchema = z.object({
  lang_code: z.string().min(1).max(35),
  word: text,
  sense: text.optional(),
  lang: text.optional(),
  roman: text.optional(),
  alt: text.optional(),
  note: text.optional(),
  tags: labels.default([]),
  topics: labels.default([]),
});
const entrySchema = z.object({
  word: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => value.trim().length > 0),
  lang_code: z.string().min(1).max(35),
  pos: z.string().min(1).max(50),
  senses: z
    .array(
      z.object({
        glosses: z.array(text).max(30).default([]),
        senseid: labels.default([]),
        tags: labels.default([]),
        topics: labels.default([]),
        qualifier: text.optional(),
      }),
    )
    .max(500),
  translations: z.array(translationSchema).max(10_000).default([]),
});

type Translation = z.infer<typeof translationSchema>;
export type TranslationGroup = {
  label: string | null;
  senseBinding: "UNRESOLVED";
  translations: Translation[];
};
export type WiktextractEntry = Omit<
  z.infer<typeof entrySchema>,
  "translations"
> & {
  // Physical location in this exact byte snapshot, NOT an upstream sense/revision ID.
  source: { sha256: string; line: number };
  translationGroups: TranslationGroup[];
};
export type WiktextractSnapshot = {
  sha256: string;
  entries: WiktextractEntry[];
  ignoredLanguageEntries: number;
};

/** Reads a small, pinned, offline JSONL snapshot. Does not fetch, authorize or persist data. */
export function readWiktextract(
  bytes: Uint8Array,
  expectedSha256: string,
): WiktextractSnapshot {
  if (bytes.byteLength === 0 || bytes.byteLength > 2_000_000)
    throw new Error("INVALID_SOURCE_SIZE");
  // Hash and parse the same owned bytes; never hash one file read and parse another.
  const ownedBytes = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(ownedBytes).digest("hex");
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256) || sha256 !== expectedSha256)
    throw new Error("SOURCE_HASH_MISMATCH");
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(ownedBytes);
  } catch {
    throw new Error("INVALID_SOURCE_ENCODING");
  }
  const entries: WiktextractEntry[] = [];
  let recordCount = 0;
  let ignoredLanguageEntries = 0;
  for (const [offset, line] of decoded.split("\n").entries()) {
    if (!line.trim()) continue;
    if (++recordCount > 100) throw new Error("SOURCE_RECORD_LIMIT");
    let entry: z.infer<typeof entrySchema>;
    try {
      entry = entrySchema.parse(JSON.parse(line));
    } catch {
      // Never expose source text or Zod/JSON diagnostic payloads in public errors.
      throw new Error(`INVALID_SOURCE_RECORD:${offset + 1}`);
    }
    if (entry.lang_code !== "en") {
      ignoredLanguageEntries++;
      continue;
    }
    const { translations, ...fields } = entry;
    const groups = new Map<string | null, TranslationGroup>();
    for (const translation of translations) {
      if (
        !["zh", "cmn"].includes(translation.lang_code) ||
        !translation.word.trim()
      )
        continue;
      const label = translation.sense?.trim() || null;
      let group = groups.get(label);
      if (!group) {
        group = { label, senseBinding: "UNRESOLVED", translations: [] };
        groups.set(label, group);
      }
      group.translations.push(translation);
    }
    entries.push({
      ...fields,
      source: { sha256, line: offset + 1 },
      translationGroups: [...groups.values()],
    });
  }
  if (recordCount === 0) throw new Error("INVALID_SOURCE_SIZE");
  return { sha256, entries, ignoredLanguageEntries };
}

const queryKey = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

/** FOUND means translated text exists in this snapshot, not a verified WordAnalysis. */
export function lookupWiktextract(
  snapshot: WiktextractSnapshot,
  query: string,
) {
  if (!query.trim() || query.length > 200) throw new Error("INVALID_QUERY");
  const key = queryKey(query);
  const entries = snapshot.entries.filter(
    (entry) => queryKey(entry.word) === key,
  );
  const status =
    entries.length === 0
      ? "NOT_FOUND"
      : entries.some((entry) => entry.translationGroups.length > 0)
        ? "FOUND"
        : "NO_CHINESE_TRANSLATION";
  return { status, entries, isCompleteForSource: false as const };
}
