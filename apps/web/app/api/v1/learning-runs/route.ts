import { createLearningRunInputSchema } from "@english-teacher/contracts";
import { assertSameOrigin, readJson, RunError } from "@english-teacher/runtime";
import { boundary, json, owner, repository } from "../../../../lib/server";

export async function POST(request: Request) {
  return boundary(async () => {
    assertSameOrigin(request);
    const session = owner(request);
    const body = await readJson(request);
    if (
      body &&
      typeof body === "object" &&
      "rawText" in body &&
      typeof body.rawText === "string" &&
      Array.from(body.rawText).length > 5000
    )
      throw new RunError("INPUT_TOO_LONG", 413, "最多提交 5000 个字符。");
    const input = createLearningRunInputSchema.parse(body);
    if (input.targetLanguage !== "en")
      throw new RunError("UNSUPPORTED_LANGUAGE", 422, "当前仅支持英语。");
    return json(
      await repository().create(
        session,
        request.headers.get("idempotency-key") ?? "",
        input,
      ),
      202,
    );
  });
}
