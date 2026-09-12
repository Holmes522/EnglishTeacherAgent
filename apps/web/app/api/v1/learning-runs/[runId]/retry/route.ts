import { assertSameOrigin } from "@english-teacher/runtime";
import {
  boundary,
  json,
  owner,
  repository,
} from "../../../../../../lib/server";
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return boundary(async () => {
    assertSameOrigin(request);
    return json(
      await repository().retry(
        owner(request),
        (await context.params).runId,
        request.headers.get("idempotency-key") ?? "",
      ),
      202,
    );
  });
}
