import { lookupWiktextract, readWiktextract } from "./wiktextract.js";
import { kaikkiSampleUrl } from "./sourceUrls.js";
export { kaikkiSampleUrl } from "./sourceUrls.js";

type DownloadStatus =
  "HTTP_NOT_FOUND" | "HTTP_ERROR" | "FETCH_ERROR" | "SOURCE_TOO_LARGE";
type Download =
  | { url: string; status: DownloadStatus; httpStatus?: number }
  | { url: string; status: "DOWNLOADED"; httpStatus: number; bytes: Buffer };

/** Evaluation only: fixed public host, no redirects, 20s total timeout and 2MB actual-byte limit. */
export async function fetchKaikkiSample(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<Download> {
  const url = kaikkiSampleUrl(query);
  try {
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        url,
        status: response.status === 404 ? "HTTP_NOT_FOUND" : "HTTP_ERROR",
        httpStatus: response.status,
      };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2_000_000) {
            await reader.cancel();
            return {
              url,
              status: "SOURCE_TOO_LARGE",
              httpStatus: response.status,
            };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    return {
      url,
      status: "DOWNLOADED",
      httpStatus: response.status,
      bytes: Buffer.concat(chunks),
    };
  } catch {
    return { url, status: "FETCH_ERROR" };
  }
}

export function observeSample(bytes: Uint8Array, hash: string, query: string) {
  try {
    const result = lookupWiktextract(readWiktextract(bytes, hash), query);
    const groups = result.entries.flatMap((entry) => entry.translationGroups);
    return {
      status: result.status,
      incompleteTranslationCount: result.entries.reduce(
        (n, entry) => n + entry.incompleteTranslationCount,
        0,
      ),
      entryCount: result.entries.length,
      senseCount: result.entries.reduce(
        (n, entry) => n + entry.senses.length,
        0,
      ),
      translationGroupCount: groups.length,
      translationCount: groups.reduce(
        (n, group) => n + group.translations.length,
        0,
      ),
      sourceSenseIdCount: result.entries
        .flatMap((entry) => entry.senses)
        .reduce((n, sense) => n + sense.senseid.length, 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason =
      /^(INVALID_SOURCE_(SIZE|ENCODING|RECORD:\d+)|SOURCE_HASH_MISMATCH|SOURCE_RECORD_LIMIT|INVALID_QUERY)$/u.test(
        message,
      )
        ? message
        : "SOURCE_REJECTED";
    return { status: "INVALID_SOURCE" as const, reason };
  }
}

export type ProbeStatus =
  ReturnType<typeof observeSample>["status"] | DownloadStatus;
export function summarizeProbes(
  observations: { id: string; excluded: boolean; status: ProbeStatus }[],
) {
  if (new Set(observations.map((item) => item.id)).size !== observations.length)
    throw new Error("DUPLICATE_PROBE");
  const valid = observations.filter((item) => !item.excluded);
  const count = (status: ProbeStatus) =>
    valid.filter((item) => item.status === status).length;
  const verifiedProbeCount =
    count("FOUND") + count("NOT_FOUND") + count("NO_CHINESE_TRANSLATION");
  return {
    probeCount: observations.length,
    validInputCount: valid.length,
    excludedProbeCount: observations.length - valid.length,
    translatedProbeCount: count("FOUND"),
    verifiedProbeCount,
    unresolvedProbeCount: valid.length - verifiedProbeCount,
    translatedPercentOfValidInputs:
      valid.length && verifiedProbeCount === valid.length
        ? Math.round((count("FOUND") / valid.length) * 10_000) / 100
        : null,
  };
}
