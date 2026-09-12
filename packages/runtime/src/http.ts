import { RunError } from "./repository.js";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new RunError("ORIGIN_REJECTED", 403, "请求来源不被允许。");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new RunError("UNSUPPORTED_MEDIA_TYPE", 415, "请发送 JSON 请求。");
  const reader = request.body?.getReader();
  if (!reader) throw new RunError("INVALID_JSON", 400, "请求体不能为空。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32_768) {
        await reader.cancel();
        throw new RunError("INPUT_TOO_LONG", 413, "请求体超过大小限制。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RunError("INVALID_JSON", 400, "JSON 格式错误。");
  }
}
