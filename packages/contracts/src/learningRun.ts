import { z } from "zod";

import { learningResultSchema, publicErrorSchema } from "./results.js";

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

export const learningItemSchema = z
  .object({
    schemaVersion: z.literal(1),
    itemId: z.string().min(1).max(100),
    position: z.number().int().min(0).max(19),
    originalText: unicodeTextSchema,
    normalizedText: unicodeTextSchema,
    detectedKind: inputKindSchema,
    detectedLanguage: z.string().min(2).max(35).optional(),
    status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    result: learningResultSchema.optional(),
    error: publicErrorSchema.optional(),
  })
  .superRefine((item, context) => {
    if (item.status === "SUCCEEDED" && item.result === undefined) {
      context.addIssue({
        code: "custom",
        message: "A succeeded item must contain a result",
        path: ["result"],
      });
    }

    if (item.status === "SUCCEEDED" && item.error !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A succeeded item cannot contain an error",
        path: ["error"],
      });
    }

    if (item.status === "FAILED" && item.error === undefined) {
      context.addIssue({
        code: "custom",
        message: "A failed item must contain a public error",
        path: ["error"],
      });
    }

    if (item.status === "FAILED" && item.result !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A failed item cannot contain a result",
        path: ["result"],
      });
    }
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

    run.items.forEach((item, index) => {
      if (item.position !== index) {
        context.addIssue({
          code: "custom",
          message: "Item position must match its order in the run",
          path: ["items", index, "position"],
        });
      }
    });
  });

export type CreateLearningRunInput = z.infer<typeof createLearningRunInputSchema>;
export type InputKind = z.infer<typeof inputKindSchema>;
export type LearningIntent = z.infer<typeof learningIntentSchema>;
export type LearningItem = z.infer<typeof learningItemSchema>;
export type LearningRun = z.infer<typeof learningRunSchema>;
