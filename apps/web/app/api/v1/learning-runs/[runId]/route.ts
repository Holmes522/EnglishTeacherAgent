import { RunError } from "@english-teacher/runtime";
import {
  boundary,
  json,
  owner,
  repository,
} from "../../../../../lib/server";
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return boundary(async () => {
    const run = await repository().get(
      owner(request),
      (await context.params).runId,
    );
    if (!run) throw new RunError("RUN_NOT_FOUND", 404, "任务不存在或已过期。");
    return json(run);
  });
}
