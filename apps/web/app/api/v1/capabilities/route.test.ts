import { describe, expect, it } from "vitest";

import { capabilityManifestSchema } from "@english-teacher/contracts";

import { GET } from "./route.js";

describe("GET /api/v1/capabilities", () => {
  it("returns a valid manifest with disabled speech", async () => {
    const response = GET();
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(capabilityManifestSchema.parse(body)).toMatchObject({
      schemaVersion: 1,
      speech: { status: "NOT_ENABLED" },
      targetLanguages: ["en"],
      uiLocales: ["zh-CN"],
    });
  });
});

