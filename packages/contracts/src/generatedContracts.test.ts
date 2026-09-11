import { describe, expect, it } from "vitest";

import { createJsonSchemas, createOpenApiDocument } from "./generatedContracts.js";

describe("generated contracts", () => {
  it("derives JSON Schema limits from the runtime schemas", () => {
    const schemas = createJsonSchemas();
    const createInput = schemas.CreateLearningRunInput as {
      properties?: { rawText?: { maxLength?: number } };
    };

    expect(createInput.properties?.rawText?.maxLength).toBe(5_000);
  });

  it("publishes the learning-runs API with shared component schemas", () => {
    const document = createOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/api/v1/learning-runs"]?.post?.responses["202"]).toBeDefined();
    expect(document.components.schemas.LearningRun).toBeDefined();
    expect(document.components.schemas.PublicError).toBeDefined();
  });
});
