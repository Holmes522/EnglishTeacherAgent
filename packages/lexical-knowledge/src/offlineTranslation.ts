import { z } from "zod";
import {
  lexicalTranslationResultSchema,
  type LexicalTranslationResult,
} from "@english-teacher/contracts";
import { kaikkiSampleUrl } from "./sourceUrls.js";
import { lookupWiktextract, readWiktextract } from "./wiktextract.js";

const queryKey = (query: string) =>
  query.normalize("NFKC").trim().toLowerCase();
// Reuse the authoritative field schemas, not a weaker copy of their constraints.
// Source: https://zod.dev/api#shape
const resultFields = lexicalTranslationResultSchema.shape.data.shape;
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  purpose: z.literal("OFFLINE_EVALUATION_ONLY"),
  snapshots: z
    .array(
      z.object({
        headword: resultFields.query,
        source: resultFields.source,
      }),
    )
    .max(100),
});
export type OfflineSourceManifest = z.infer<typeof manifestSchema>;

/** Validate a caller-maintained finite inventory; this is NOT data-use authorization. */
export function parseOfflineSourceManifest(
  input: unknown,
): OfflineSourceManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_SOURCE_MANIFEST");
  const words = new Set<string>();
  const hashes = new Set<string>();
  for (const { headword, source } of parsed.data.snapshots) {
    let expectedDownloadUrl: string;
    try {
      expectedDownloadUrl = kaikkiSampleUrl(headword);
    } catch {
      throw new Error("INVALID_SOURCE_MANIFEST");
    }
    if (
      headword !== queryKey(headword) ||
      words.has(headword) ||
      hashes.has(source.snapshotSha256) ||
      source.downloadUrl !== expectedDownloadUrl ||
      source.upstreamPageUrl !==
        `https://en.wiktionary.org/wiki/${encodeURIComponent(headword)}#English`
    )
      throw new Error("INVALID_SOURCE_MANIFEST");
    words.add(headword);
    hashes.add(source.snapshotSha256);
  }
  return parsed.data;
}

/** Offline evaluation only. Validates the manifest and the same bytes it maps; no I/O.
 * Throws fixed diagnostic codes, never source text or Zod diagnostics.
 */
export function lookupOfflineTranslation(
  manifest: unknown,
  query: string,
  bytes: Uint8Array,
): LexicalTranslationResult {
  if (!resultFields.query.safeParse(query).success)
    throw new Error("INVALID_QUERY");
  const inventory = parseOfflineSourceManifest(manifest);
  const selected = inventory.snapshots.find(
    (item) => item.headword === queryKey(query),
  );
  if (!selected) throw new Error("SNAPSHOT_NOT_CONFIGURED");
  let snapshot: ReturnType<typeof readWiktextract>;
  try {
    snapshot = readWiktextract(bytes, selected.source.snapshotSha256);
  } catch {
    throw new Error("INVALID_SOURCE_SNAPSHOT");
  }
  if (
    snapshot.entries.some((entry) => queryKey(entry.word) !== selected.headword)
  )
    throw new Error("SOURCE_HEADWORD_MISMATCH");
  const lookup = lookupWiktextract(snapshot, query);
  const result = lexicalTranslationResultSchema.safeParse({
    schemaVersion: 1,
    type: "LEXICAL_TRANSLATION",
    data: {
      query,
      targetLanguage: "en",
      coverage: "SNAPSHOT_ONLY",
      isCompleteForSource: false,
      status:
        lookup.status === "NOT_FOUND" ? "NOT_FOUND_IN_SNAPSHOT" : lookup.status,
      source: selected.source,
      entries: lookup.entries.map((entry) => ({
        headword: entry.word,
        partOfSpeech: entry.pos,
        snapshotLine: entry.source.line,
        incompleteTranslationCount: entry.incompleteTranslationCount,
        translationGroups: entry.translationGroups.map((group) => ({
          label: group.label,
          senseBinding: group.senseBinding,
          translations: group.translations.map((item) => ({
            text: item.word,
            languageCode: item.lang_code,
            ...(item.lang === undefined ? {} : { languageName: item.lang }),
            ...(item.roman === undefined ? {} : { romanization: item.roman }),
            ...(item.alt === undefined ? {} : { alternative: item.alt }),
            ...(item.note === undefined ? {} : { note: item.note }),
            tags: item.tags,
            topics: item.topics,
          })),
        })),
      })),
    },
  });
  if (!result.success) throw new Error("INVALID_TRANSLATION_RESULT");
  return result.data;
}
