import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createPool,
  hash,
  RunError,
  RunRepository,
  runtimeSettings,
} from "@english-teacher/runtime";
import {
  IntakeLimitError,
  IntakeValidationError,
} from "@english-teacher/content-intake";

const globalRuntime = globalThis as typeof globalThis & {
  learningRepository?: RunRepository;
};
export function repository(): RunRepository {
  if (!globalRuntime.learningRepository) {
    const settings = runtimeSettings();
    const pool = createPool(settings.databaseUrl);
    pool.on("error", () =>
      console.error(JSON.stringify({ event: "database.connection_error" })),
    );
    globalRuntime.learningRepository = new RunRepository(
      pool,
      settings.retentionDays,
    );
  }
  return globalRuntime.learningRepository;
}

export const sessionCookie = "eta_session";
export function sessionToken(request: Request): string | undefined {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
  return value && /^[a-f0-9]{64}$/u.test(value) ? value : undefined;
}
export function owner(request: Request): string {
  const token = sessionToken(request);
  if (!token) throw new RunError("SESSION_REQUIRED", 401, "请先建立学习会话。");
  return hash(token);
}
export function ensureSession(request: Request): NextResponse {
  const response = NextResponse.json(
    { ready: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(
    sessionCookie,
    sessionToken(request) ?? randomBytes(32).toString("hex"),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 7 * 86400,
    },
  );
  return response;
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function boundary(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    let mapped =
      error instanceof RunError
        ? error
        : new RunError(
            "SERVICE_UNAVAILABLE",
            503,
            "服务暂时不可用，请稍后重试。",
          );
    if (error instanceof IntakeLimitError)
      mapped = new RunError(error.code, 413, "最多提交 20 项、5000 个字符。");
    if (error instanceof IntakeValidationError)
      mapped = new RunError(error.code, 422, "请输入学习内容。");
    if (error instanceof Error && error.name === "ZodError")
      mapped = new RunError("INVALID_INPUT", 422, "输入字段不符合要求。");
    const traceId = randomUUID();
    if (mapped.status >= 500)
      console.error(
        JSON.stringify({ event: "api.failed", code: mapped.code, traceId }),
      );
    return json(
      {
        schemaVersion: 1,
        error: {
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.status >= 500,
          traceId,
        },
      },
      mapped.status,
    );
  }
}
