import { assertSameOrigin } from "@english-teacher/runtime";
import { boundary, ensureSession } from "../../../../lib/server";
export async function POST(request: Request) {
  return boundary(async () => {
    assertSameOrigin(request);
    return ensureSession(request);
  });
}
