import { z } from "zod";

export const speakableContentSchema = z.object({
  contentId: z.string().min(1).max(100),
  text: z.string().min(1).max(5_000),
  language: z.string().min(2).max(35),
  variant: z.enum(["UK", "US"]).optional(),
  contentType: z.enum(["WORD", "EXAMPLE", "CORRECTION", "EXPLANATION"]),
  audio: z
    .object({
      status: z.enum(["NOT_ENABLED", "PENDING", "READY", "FAILED"]),
      url: z.url().optional(),
      expiresAt: z.iso.datetime().optional(),
    })
    .optional(),
});

const pronunciationSchema = z.object({
  variant: z.enum(["UK", "US"]),
  ipa: z.string().min(1).max(200),
});

const lexicalSenseSchema = z.object({
  senseId: z.string().min(1).max(200),
  zhDefinition: z.string().min(1).max(1_000),
  enDefinition: z.string().min(1).max(1_000).optional(),
  register: z.string().max(100).optional(),
  domain: z.string().max(100).optional(),
  frequencyBand: z.string().max(100).optional(),
});

const lexicalEntrySchema = z.object({
  entryId: z.string().min(1).max(200),
  partOfSpeech: z.string().min(1).max(50),
  partOfSpeechLabel: z.string().min(1).max(100),
  grammarLabels: z.array(z.string().min(1).max(100)).max(20),
  senses: z.array(lexicalSenseSchema).min(1).max(100),
});

const exampleSentenceSchema = z.object({
  exampleId: z.string().min(1).max(100),
  sentence: z.string().min(1).max(1_000),
  translation: z.string().min(1).max(1_000),
  senseId: z.string().min(1).max(200),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  highlightedRanges: z
    .array(
      z.object({
        start: z.number().int().min(0),
        end: z.number().int().min(1),
      }),
    )
    .max(20),
  speakable: speakableContentSchema,
});

const wordFormSchema = z.object({
  label: z.string().min(1).max(100),
  form: z.string().min(1).max(200),
});

const derivedWordSchema = z.object({
  word: z.string().min(1).max(200),
  partOfSpeech: z.string().min(1).max(50),
  zhDefinition: z.string().min(1).max(1_000),
  frequencyBand: z.string().max(100).optional(),
});

export const wordAnalysisSchema = z.object({
  headword: z.string().min(1).max(200),
  pronunciations: z.array(pronunciationSchema).max(10),
  entries: z.array(lexicalEntrySchema).min(1).max(50),
  examples: z.array(exampleSentenceSchema).max(10),
  inflections: z.array(wordFormSchema).max(50).optional(),
  derivations: z.array(derivedWordSchema).max(100).optional(),
  source: z.object({
    provider: z.string().min(1).max(100),
    dictionaryVersion: z.string().min(1).max(100),
    retrievedAt: z.iso.datetime(),
    isCompleteForSource: z.boolean(),
  }),
  speakable: z.array(speakableContentSchema).max(20),
});

export const sentenceIssueSchema = z.object({
  issueId: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  severity: z.enum(["ERROR", "WARNING", "STYLE"]),
  range: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
  }),
  originalText: z.string().min(1).max(1_000),
  replacement: z.string().max(1_000).optional(),
  explanation: z.string().min(1).max(2_000),
});

export const sentenceReviewSchema = z
  .object({
    original: z.string().min(1).max(5_000),
    totalScore: z.number().int().min(0).max(100),
    dimensions: z.object({
      grammar: z.number().int().min(0).max(40),
      vocabulary: z.number().int().min(0).max(25),
      naturalness: z.number().int().min(0).max(20),
      spellingAndPunctuation: z.number().int().min(0).max(15),
    }),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    assumptions: z.array(z.string().min(1).max(1_000)).max(20),
    issues: z.array(sentenceIssueSchema).max(100),
    minimalCorrection: z.string().min(1).max(5_000),
    naturalRewrite: z.string().min(1).max(5_000).optional(),
    summary: z.string().min(1).max(2_000),
    speakable: z.array(speakableContentSchema).max(20),
    rubricVersion: z.string().min(1).max(100),
  })
  .superRefine((review, context) => {
    const dimensionTotal =
      review.dimensions.grammar +
      review.dimensions.vocabulary +
      review.dimensions.naturalness +
      review.dimensions.spellingAndPunctuation;

    if (review.totalScore !== dimensionTotal) {
      context.addIssue({
        code: "custom",
        message: "totalScore must equal the sum of all dimensions",
        path: ["totalScore"],
      });
    }

    const codePoints = Array.from(review.original);
    review.issues.forEach((issue, index) => {
      const selectedText = codePoints.slice(issue.range.start, issue.range.end).join("");
      if (issue.range.end <= issue.range.start || selectedText !== issue.originalText) {
        context.addIssue({
          code: "custom",
          message: "Issue range must select originalText using Unicode code-point offsets",
          path: ["issues", index, "range"],
        });
      }
    });
  });

const clarificationSchema = z.object({
  message: z.string().min(1).max(1_000),
  options: z.array(z.string().min(1).max(200)).min(1).max(10),
});

export const learningResultSchema = z.discriminatedUnion("type", [
  z.object({
    schemaVersion: z.literal(1),
    type: z.literal("WORD_ANALYSIS"),
    data: wordAnalysisSchema,
  }),
  z.object({
    schemaVersion: z.literal(1),
    type: z.literal("SENTENCE_REVIEW"),
    data: sentenceReviewSchema,
  }),
  z.object({
    schemaVersion: z.literal(1),
    type: z.literal("CLARIFICATION"),
    data: clarificationSchema,
  }),
]);

export const publicErrorSchema = z.object({
  schemaVersion: z.literal(1),
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
    traceId: z.string().min(1).max(100),
  }),
});

export const capabilityManifestSchema = z.object({
  schemaVersion: z.literal(1),
  speech: z.object({
    status: z.enum(["NOT_ENABLED", "AVAILABLE"]),
  }),
  targetLanguages: z.array(z.string().min(2).max(35)).min(1),
  uiLocales: z.array(z.string().min(2).max(35)).min(1),
  extensionSlots: z.array(
    z.enum(["header", "composer.before", "result.card.after", "sidebar"]),
  ),
});

export type WordAnalysis = z.infer<typeof wordAnalysisSchema>;
export type SentenceReview = z.infer<typeof sentenceReviewSchema>;
export type LearningResult = z.infer<typeof learningResultSchema>;
export type PublicError = z.infer<typeof publicErrorSchema>;
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;

