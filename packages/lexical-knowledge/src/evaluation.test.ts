import { describe, expect, it } from "vitest";
import {
  fetchKaikkiSample,
  observeSample,
  summarizeProbes,
  kaikkiSampleUrl,
} from "./evaluation.js";
import { createHash } from "node:crypto";

describe("Kaikki evaluation boundaries", () => {
  it("constructs encoded, normalized single-letter, phrase and Unicode sample paths", () => {
    expect(kaikkiSampleUrl(" Ａ ")).toBe(
      "https://kaikki.org/dictionary/English/meaning/a/a/a.jsonl",
    );
    expect(kaikkiSampleUrl("look up")).toContain("/l/lo/look%20up.jsonl");
    expect(kaikkiSampleUrl("résumé")).toContain(
      "/r/r%C3%A9/r%C3%A9sum%C3%A9.jsonl",
    );
    expect(() => kaikkiSampleUrl("../secret")).toThrow("INVALID_QUERY");
  });
  it("preserves 404 as a download observation, not a dictionary not-found claim", async () => {
    const sample = await fetchKaikkiSample(
      "unknown",
      async () => new Response(null, { status: 404 }),
    );
    expect(sample).toMatchObject({ status: "HTTP_NOT_FOUND", httpStatus: 404 });
    expect(sample).not.toHaveProperty("bytes");
  });
  it("records non-404 errors without parsing their content", async () => {
    const sample = await fetchKaikkiSample(
      "sample",
      async () => new Response("secret error", { status: 503 }),
    );
    expect(sample).toMatchObject({ status: "HTTP_ERROR", httpStatus: 503 });
    expect(JSON.stringify(sample)).not.toContain("secret");
  });
  it("uses a fixed HTTPS host, disallows redirects and sets an abort signal", async () => {
    const sample = await fetchKaikkiSample("sample", async (url, init) => {
      expect(new URL(String(url)).hostname).toBe("kaikki.org");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("abc");
    });
    expect(sample.status).toBe("DOWNLOADED");
    if (sample.status === "DOWNLOADED")
      expect(sample.bytes.toString()).toBe("abc");
  });
  it("caps actual streamed bytes even without a content-length header", async () => {
    const sample = await fetchKaikkiSample(
      "sample",
      async () => new Response(new Uint8Array(2_000_001)),
    );
    expect(sample.status).toBe("SOURCE_TOO_LARGE");
  });
  it("records transport exceptions without leaking diagnostics", async () => {
    const sample = await fetchKaikkiSample("sample", async () => {
      throw Error("secret address");
    });
    expect(sample.status).toBe("FETCH_ERROR");
    expect(JSON.stringify(sample)).not.toContain("secret");
  });
  it("records malformed source as invalid, rather than zero coverage", () => {
    const bytes = Buffer.from("bad source");
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(observeSample(bytes, hash, "sample")).toMatchObject({
      status: "INVALID_SOURCE",
      reason: "INVALID_SOURCE_RECORD:1",
    });
  });
  it("counts structures only and returns no source definitions", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        word: "sample",
        lang_code: "en",
        pos: "noun",
        senses: [{ glosses: ["private definition"] }],
        translations: [{ lang_code: "zh", word: "译词", sense: "label" }],
      }),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    const result = observeSample(bytes, hash, "sample");
    expect(result).toEqual({
      status: "FOUND",
      incompleteTranslationCount: 0,
      entryCount: 1,
      senseCount: 1,
      translationGroupCount: 1,
      translationCount: 1,
      sourceSenseIdCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private definition");
  });
  it("keeps denominator fixed, separates unresolved failures and excluded controls", () => {
    const summary = summarizeProbes([
      { id: "1", excluded: false, status: "FOUND" },
      { id: "2", excluded: false, status: "FETCH_ERROR" },
      { id: "3", excluded: false, status: "NO_CHINESE_TRANSLATION" },
      { id: "4", excluded: true, status: "FOUND" },
    ]);
    expect(summary).toMatchObject({
      probeCount: 4,
      validInputCount: 3,
      translatedProbeCount: 1,
      verifiedProbeCount: 2,
      unresolvedProbeCount: 1,
      excludedProbeCount: 1,
    });
    expect(summary.translatedPercentOfValidInputs).toBeNull();
    expect(() =>
      summarizeProbes([
        { id: "1", excluded: false, status: "FOUND" },
        { id: "1", excluded: true, status: "FOUND" },
      ]),
    ).toThrow("DUPLICATE_PROBE");
  });
});
