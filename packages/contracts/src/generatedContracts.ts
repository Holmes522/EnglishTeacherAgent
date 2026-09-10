import { z } from "zod";

import { createLearningRunInputSchema, learningRunSchema } from "./learningRun.js";
import {
  capabilityManifestSchema,
  learningResultSchema,
  publicErrorSchema,
  sentenceReviewSchema,
  wordAnalysisSchema,
} from "./results.js";

const contractSchemas = {
  CreateLearningRunInput: createLearningRunInputSchema,
  LearningRun: learningRunSchema,
  LearningResult: learningResultSchema,
  WordAnalysis: wordAnalysisSchema,
  SentenceReview: sentenceReviewSchema,
  PublicError: publicErrorSchema,
  CapabilityManifest: capabilityManifestSchema,
} satisfies Record<string, z.ZodType>;

type JsonSchema = Record<string, unknown>;

export function createJsonSchemas(): Record<keyof typeof contractSchemas, JsonSchema> {
  return Object.fromEntries(
    Object.entries(contractSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: "draft-2020-12" }) as JsonSchema,
    ]),
  ) as Record<keyof typeof contractSchemas, JsonSchema>;
}

interface OpenApiOperation {
  summary: string;
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
}

interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, { get?: OpenApiOperation; post?: OpenApiOperation }>;
  components: {
    schemas: Record<keyof typeof contractSchemas, JsonSchema>;
  };
}

const jsonResponse = (schemaName: keyof typeof contractSchemas): Record<string, unknown> => ({
  description: "Success",
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaName}` },
    },
  },
});

export function createOpenApiDocument(): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "English Teacher AI Agent API",
      version: "0.1.0",
    },
    paths: {
      "/api/v1/learning-runs": {
        post: {
          summary: "Create a single or batch learning run",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateLearningRunInput" },
              },
            },
          },
          responses: {
            "202": jsonResponse("LearningRun"),
            "422": jsonResponse("PublicError"),
          },
        },
      },
      "/api/v1/capabilities": {
        get: {
          summary: "Discover enabled product capabilities",
          responses: {
            "200": jsonResponse("CapabilityManifest"),
          },
        },
      },
    },
    components: {
      schemas: createJsonSchemas(),
    },
  };
}
