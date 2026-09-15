import { z } from "zod";

// Keep the approved UTF-16 bounds even when Zod counts Unicode code points.
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.length <= max, "Exceeds UTF-16 length limit");
const nonblank = (max: number) => text(max).min(1).regex(/\S/u);
const labels = z.array(text(4_000)).max(100);
// Source: https://zod.dev/api#urls. Format only, not a fetch/authorization allowlist.
const sourceUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(2_000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return value.length <= 2_000 && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Expected a credential-free HTTPS URL of at most 2000 UTF-16 units");

const translationSchema = z.object({
  text: nonblank(4_000),
  languageCode: z.enum(["zh", "cmn"]),
  languageName: text(4_000).optional(),
  romanization: text(4_000).optional(),
  alternative: text(4_000).optional(),
  note: text(4_000).optional(),
  tags: labels,
  topics: labels,
});
const groupSchema = z.object({
  label: nonblank(4_000).nullable(),
  senseBinding: z.literal("UNRESOLVED"),
  translations: z.array(translationSchema).min(1).max(10_000),
});
const entrySchema = z
  .object({
    headword: nonblank(200),
    partOfSpeech: nonblank(50),
    snapshotLine: z.number().int().min(1),
    incompleteTranslationCount: z.number().int().min(0).max(10_000),
    translationGroups: z.array(groupSchema).max(10_000),
  })
  .superRefine((entry, context) => {
    const total = entry.translationGroups.reduce(
      (sum, group) => sum + group.translations.length,
      0,
    );
    if (total > 10_000)
      context.addIssue({
        code: "custom",
        path: ["translationGroups"],
        message: "At most 10000 translations per entry",
      });
  });
const sourceSchema = z.object({
  provider: z.literal("KAIKKI_WIKTEXTRACT"),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  retrievedAt: z.iso.datetime(),
  downloadUrl: sourceUrlSchema,
  upstreamPageUrl: sourceUrlSchema,
  upstreamRevision: nonblank(200).nullable(),
  attribution: nonblank(2_000),
  license: z.object({ name: nonblank(100), url: sourceUrlSchema }),
  changes: z.array(nonblank(1_000)).min(1).max(20),
});
const dataSchema = z
  .object({
    query: nonblank(200),
    targetLanguage: z.literal("en"),
    coverage: z.literal("SNAPSHOT_ONLY"),
    isCompleteForSource: z.literal(false),
    status: z.enum([
      "FOUND",
      "NO_CHINESE_TRANSLATION",
      "NOT_FOUND_IN_SNAPSHOT",
    ]),
    entries: z.array(entrySchema).max(100),
    source: sourceSchema,
  })
  .superRefine((data, context) => {
    const hasTranslation = data.entries.some(
      (entry) => entry.translationGroups.length > 0,
    );
    const expectedStatus =
      data.entries.length === 0
        ? "NOT_FOUND_IN_SNAPSHOT"
        : hasTranslation
          ? "FOUND"
          : "NO_CHINESE_TRANSLATION";
    if (data.status !== expectedStatus)
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Status must agree with snapshot entries and translations",
      });
    const lines = new Set<number>();
    data.entries.forEach((entry, index) => {
      if (lines.has(entry.snapshotLine))
        context.addIssue({
          code: "custom",
          path: ["entries", index, "snapshotLine"],
          message: "Snapshot lines must be unique",
        });
      lines.add(entry.snapshotLine);
    });
  });

/** Standalone component only: not yet an enabled LearningResult or a data-use approval.
 * Runtime refinements (https://zod.dev/api#superrefine) supplement generated JSON Schema.
 */
export const lexicalTranslationResultSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal("LEXICAL_TRANSLATION"),
  data: dataSchema,
});
export type LexicalTranslationResult = z.infer<
  typeof lexicalTranslationResultSchema
>;
