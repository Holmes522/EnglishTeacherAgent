import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  fetchKaikkiSample,
  observeSample,
  summarizeProbes,
  kaikkiSampleUrl,
} from "../../packages/lexical-knowledge/src/evaluation.ts";

const probeHash =
  "55e4f18d10d9f64bf585037687c8289a776678ee02e6ce88759908de662a19d1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function runEvaluation(mode, directory) {
  if (!["collect", "replay"].includes(mode))
    throw Error("Use collect or replay <local-directory>");
  const input = await readFile(
    new URL("../../tests/golden/lexical-probes.json", import.meta.url),
  );
  if (sha256(input) !== probeHash) throw Error("PROBE_HASH_MISMATCH");
  const probes = JSON.parse(input.toString("utf8"));
  const rows = probes.groups.flatMap((group) =>
    Object.entries(group.probes).map(([id, query]) => ({
      id,
      query,
      group: group.id,
      excluded: Object.hasOwn(probes.coverageExclusions, id),
    })),
  );
  const target =
    mode === "collect"
      ? await mkdtemp(join(tmpdir(), "eta-wiktextract-eval-"))
      : resolve(directory);
  const previous =
    mode === "replay"
      ? JSON.parse(await readFile(join(target, "report.json"), "utf8"))
      : null;
  if (
    previous &&
    (previous.probeSha256 !== probeHash ||
      previous.observations.length !== rows.length)
  )
    throw Error("REPORT_PROBE_MISMATCH");
  const observations = [];
  const collectedAt = previous?.collectedAt ?? new Date().toISOString();
  for (const row of rows) {
    let observation;
    if (previous) {
      const stored = previous.observations.find((item) => item.id === row.id);
      if (
        !stored ||
        stored.query !== row.query ||
        stored.excluded !== row.excluded ||
        stored.group !== row.group
      )
        throw Error("REPORT_PROBE_MISMATCH");
      if (stored.url !== kaikkiSampleUrl(row.query))
        throw Error("REPORT_URL_MISMATCH");
      if (
        !stored.sha256 &&
        ![
          "HTTP_NOT_FOUND",
          "HTTP_ERROR",
          "FETCH_ERROR",
          "SOURCE_TOO_LARGE",
        ].includes(stored.status)
      )
        throw Error("REPORT_MISSING_SNAPSHOT");
      if (
        stored.httpStatus !== undefined &&
        (!Number.isInteger(stored.httpStatus) ||
          stored.httpStatus < 100 ||
          stored.httpStatus > 599)
      )
        throw Error("REPORT_HTTP_STATUS_INVALID");
      observation = {
        ...row,
        url: stored.url,
        status: stored.status,
        ...(stored.httpStatus === undefined
          ? {}
          : { httpStatus: stored.httpStatus }),
      };
      if (stored.sha256) {
        const bytes = await readFile(join(target, `${row.id}.jsonl`));
        if (sha256(bytes) !== stored.sha256)
          throw Error(`SNAPSHOT_HASH_MISMATCH:${row.id}`);
        observation = {
          ...row,
          url: stored.url,
          httpStatus: stored.httpStatus,
          bytes: bytes.length,
          sha256: stored.sha256,
          ...observeSample(bytes, stored.sha256, row.query),
        };
      }
    } else {
      const download = await fetchKaikkiSample(row.query);
      if (download.status === "DOWNLOADED") {
        const hash = sha256(download.bytes);
        await writeFile(join(target, `${row.id}.jsonl`), download.bytes, {
          flag: "wx",
        });
        observation = {
          ...row,
          url: download.url,
          httpStatus: download.httpStatus,
          bytes: download.bytes.length,
          sha256: hash,
          ...observeSample(download.bytes, hash, row.query),
        };
      } else {
        observation = { ...row, ...download };
      }
    }
    observations.push(observation);
    if (mode === "collect") {
      // Checkpoint only task-owned generated output, never the application database.
      await writeFile(
        join(target, "report.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            collectedAt,
            probeSha256: probeHash,
            observations,
            summary: summarizeProbes(observations),
          },
          null,
          2,
        ) + "\n",
      );
      if (observations.length % 10 === 0)
        process.stderr.write(
          `Collected ${observations.length}/${rows.length}\n`,
        );
    }
  }
  return {
    directory: target,
    report: {
      schemaVersion: 1,
      collectedAt,
      probeSha256: probeHash,
      observations,
      summary: summarizeProbes(observations),
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { directory, report } = await runEvaluation(
      process.argv[2],
      process.argv[3],
    );
    process.stdout.write(
      JSON.stringify({ directory, summary: report.summary }) + "\n",
    );
  } catch {
    process.stderr.write(
      "Evaluation failed; check mode, local files, probe hash and snapshot hashes.\n",
    );
    process.exitCode = 1;
  }
}
