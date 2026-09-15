import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runEvaluation } from "./evaluate-wiktextract.mjs";

let directory;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (directory) {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("eta-wiktextract-eval-")
    )
      throw Error("UNSAFE_TEST_CLEANUP");
    await rm(target, { recursive: true });
    directory = undefined;
  }
});

describe("fixed-corpus evaluation runner", () => {
  it("replays pinned samples offline, drops stale diagnostics and detects tampering", async () => {
    vi.stubGlobal("fetch", async (url) => {
      const word = decodeURIComponent(
        new URL(url).pathname.split("/").at(-1),
      ).replace(/\.jsonl$/u, "");
      if (word === "qzxvblorp123") return new Response(null, { status: 404 });
      return new Response(
        JSON.stringify({
          word,
          lang_code: "en",
          pos: "noun",
          senses: [],
          translations: [{ lang_code: "zh", word: "synthetic" }],
        }),
      );
    });
    const collected = await runEvaluation("collect");
    directory = collected.directory;
    expect(collected.report.summary).toMatchObject({
      probeCount: 100,
      validInputCount: 97,
      translatedProbeCount: 97,
    });
    collected.report.observations[0].reason = "obsolete parser diagnostic";
    collected.report.observations.find(
      (item) => item.id === "boundary-008",
    ).reason = "obsolete transport diagnostic";
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(collected.report),
    );
    vi.stubGlobal("fetch", () => {
      throw Error("Replay must not fetch");
    });
    const replayed = await runEvaluation("replay", directory);
    expect(replayed.report.observations[0]).not.toHaveProperty("reason");
    expect(
      replayed.report.observations.find((item) => item.id === "boundary-008"),
    ).not.toHaveProperty("reason");
    const path = join(directory, "common-001.jsonl");
    const bytes = await readFile(path);
    await writeFile(path, Buffer.concat([bytes, Buffer.from(" ")]));
    await expect(runEvaluation("replay", directory)).rejects.toThrow(
      "SNAPSHOT_HASH_MISMATCH",
    );
  });
});
