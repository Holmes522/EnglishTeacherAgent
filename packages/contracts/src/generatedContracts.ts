import { z } from "zod";

import {
  createLearningRunInputSchema,
  learningRunSchema,
} from "./learningRun.js";
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

export function createJsonSchemas(): Record<
  keyof typeof contractSchemas,
  JsonSchema
> {
  return Object.fromEntries(
    Object.entries(contractSchemas).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: "draft-2020-12" }) as JsonSchema,
    ]),
  ) as Record<keyof typeof contractSchemas, JsonSchema>;
}

interface OpenApiOperation {
  summary: string;
  parameters?: Array<Record<string, unknown>>;
  security?: Array<Record<string, string[]>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
}

interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, { get?: OpenApiOperation; post?: OpenApiOperation }>;
  components: {
    schemas: Record<keyof typeof contractSchemas, JsonSchema>;
    securitySchemes: Record<string, unknown>;
  };
}

const jsonResponse = (
  schemaName: keyof typeof contractSchemas,
): Record<string, unknown> => ({
  description: schemaName === "PublicError" ? "Request failed" : "Success",
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaName}` },
    },
  },
});

export function createOpenApiDocument(): OpenApiDocument {
  const runParameter = {
    name: "runId",
    in: "path",
    required: true,
    schema: { type: "string" },
  };
  const keyParameter = {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" },
  };
  const security = [{ anonymousSession: [] }];
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 415, 422, 503].map((status) => [
      String(status),
      jsonResponse("PublicError"),
    ]),
  );
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
          security,
          parameters: [keyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateLearningRunInput" },
              },
            },
          },
          responses: {
            ...errors,
            "202": jsonResponse("LearningRun"),
            "422": jsonResponse("PublicError"),
          },
        },
      },
      "/api/v1/session": {
        post: {
          summary:
            "Establish an HttpOnly anonymous session before submitting runs",
          responses: {
            "200": {
              description: "Session ready; Set-Cookie establishes eta_session",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ready"],
                    properties: { ready: { const: true } },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
      "/api/v1/learning-runs/{runId}": {
        get: {
          summary: "Read the authoritative current run state",
          security,
          parameters: [runParameter],
          responses: { "200": jsonResponse("LearningRun"), ...errors },
        },
      },
      "/api/v1/learning-runs/{runId}/cancel": {
        post: {
          summary: "Cancel unfinished items; terminal runs return 409",
          security,
          parameters: [runParameter],
          responses: { "200": jsonResponse("LearningRun"), ...errors },
        },
      },
      "/api/v1/learning-runs/{runId}/retry": {
        post: {
          summary:
            "Create a linked run for retryable failed items without changing history",
          security,
          parameters: [runParameter, keyParameter],
          responses: { "202": jsonResponse("LearningRun"), ...errors },
        },
      },
      "/api/v1/learning-runs/{runId}/events": {
        get: {
          summary:
            "Replay run.updated, item.completed and run.completed SSE events",
          security,
          parameters: [
            runParameter,
            {
              name: "Last-Event-ID",
              in: "header",
              schema: { type: "integer", minimum: 0, maximum: 2147483647 },
            },
          ],
          responses: {
            "200": {
              description:
                "Per-run monotonic event IDs. Reconnect after 25 seconds using Last-Event-ID. GET remains authoritative.",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            ...errors,
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
      securitySchemes: {
        anonymousSession: { type: "apiKey", in: "cookie", name: "eta_session" },
      },
    },
  };
}
