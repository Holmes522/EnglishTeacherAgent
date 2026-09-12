import { setTimeout as delay } from "node:timers/promises";
import { RunError } from "@english-teacher/runtime";
import { boundary, owner, repository } from "../../../../../../lib/server";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return boundary(async () => {
    const session = owner(request);
    const { runId } = await context.params;
    const rawCursor = request.headers.get("last-event-id") ?? "0";
    if (!/^\d{1,10}$/u.test(rawCursor) || Number(rawCursor) > 2_147_483_647)
      throw new RunError("INVALID_EVENT_ID", 400, "事件游标无效。");
    let cursor = Number(rawCursor);
    const store = repository();
    if (!(await store.get(session, runId)))
      throw new RunError("RUN_NOT_FOUND", 404, "任务不存在或已过期。");
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const deadline = Date.now() + 25_000;
        try {
          controller.enqueue(encoder.encode("retry: 1000\n\n"));
          while (!abort.signal.aborted && Date.now() < deadline) {
            const events = await store.events(session, runId, cursor);
            if (!events || abort.signal.aborted) break;
            for (const event of events) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
                ),
              );
              cursor = event.id;
            }
            if (events.some((event) => event.type === "run.completed")) break;
            if (!events.length) {
              const run = await store.get(session, runId);
              if (!run || run.completedCount === run.itemCount) break;
              if (!abort.signal.aborted)
                controller.enqueue(encoder.encode(": heartbeat\n\n"));
            }
            await delay(500, undefined, { signal: abort.signal });
          }
        } catch {
          if (!abort.signal.aborted)
            controller.enqueue(
              encoder.encode("event: stream.unavailable\ndata: {}\n\n"),
            );
        } finally {
          request.signal.removeEventListener("abort", onAbort);
          if (!abort.signal.aborted) controller.close();
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
