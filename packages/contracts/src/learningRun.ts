import { z } from "zod";

const unicodeTextSchema = z
  .string()
  .min(1)
  .max(10_000)
  .refine((value) => Array.from(value).length <= 5_000, {
    error: "Text must contain at most 5000 Unicode code points",
  })
  .meta({ minLength: 1, maxLength: 5_000 });

export const learningIntentSchema = z.enum([
  "AUTO",
  "LOOKUP",
  "EXAMPLES",
  "REVIEW",
  "WORD_FORMS",
]);

export const inputKindSchema = z.enum(["WORD", "SENTENCE", "INSTRUCTION", "UNKNOWN"]);

export const createLearningRunInputSchema = z.object({
  rawText: unicodeTextSchema,
  intent: learningIntentSchema,
  uiLocale: z.string().min(2).max(35),
  explanationLocale: z.string().min(2).max(35),
  targetLanguage: z.string().min(2).max(35),
  preferences: z
    .object({
      cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
      englishVariant: z.enum(["AUTO", "UK", "US"]).optional(),
      exampleCount: z.number().int().min(1).max(10).optional(),
      context: z.string().max(500).optional(),
    })
    .optional(),
});

export const learningItemSchema = z.object({
  schemaVersion: z.literal(1),
  itemId: z.string().min(1).max(100),
  position: z.number().int().min(0).max(19),
  originalText: unicodeTextSchema,
  normalizedText: unicodeTextSchema,
  detectedKind: inputKindSchema,
  detectedLanguage: z.string().min(2).max(35).optional(),
  status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
});

export const learningRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1).max(100),
    status: z.enum([
      "QUEUED",
      "RUNNING",
      "SUCCEEDED",
      "PARTIAL_SUCCESS",
      "FAILED",
      "CANCELLED",
    ]),
    itemCount: z.number().int().min(1).max(20),
    completedCount: z.number().int().min(0).max(20),
    items: z.array(learningItemSchema).min(1).max(20),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().optional(),
  })
  .superRefine((run, context) => {
    if (run.itemCount !== run.items.length) {
      context.addIssue({
        code: "custom",
        message: "itemCount must equal the number of items",
        path: ["itemCount"],
      });
    }

    if (run.completedCount > run.itemCount) {
      context.addIssue({
        code: "custom",
        message: "completedCount cannot exceed itemCount",
        path: ["completedCount"],
      });
    }
  });

export type CreateLearningRunInput = z.infer<typeof createLearningRunInputSchema>;
export type LearningItem = z.infer<typeof learningItemSchema>;
export type LearningRun = z.infer<typeof learningRunSchema>;

