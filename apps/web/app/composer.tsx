"use client";

import { useEffect, useRef, useState } from "react";
import { PendingRequestKey } from "../lib/request-key";
import {
  learningRunSchema,
  type LearningRun,
} from "@english-teacher/contracts";

const labels: Record<string, string> = {
  QUEUED: "排队中",
  PENDING: "等待处理",
  RUNNING: "处理中",
  SUCCEEDED: "已完成",
  PARTIAL_SUCCESS: "部分完成",
  FAILED: "处理失败",
  CANCELLED: "已取消",
};
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "请求失败，请稍后重试。");
  return data;
}

export function Composer({
  demo,
  initialRunId,
}: {
  demo: boolean;
  initialRunId?: string;
}) {
  const [text, setText] = useState("hello\nHe goes to school.");
  const [runId, setRunId] = useState(initialRunId);
  const [run, setRun] = useState<LearningRun | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [connection, setConnection] = useState("");
  const pending = useRef(new PendingRequestKey());
  const pendingAction = useRef(new PendingRequestKey());

  useEffect(() => {
    if (!runId) return;
    const abort = new AbortController();
    const source = new EventSource(
      `/api/v1/learning-runs/${encodeURIComponent(runId)}/events`,
    );
    let finished = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching || finished) return;
      fetching = true;
      try {
        const data = learningRunSchema.parse(
          await responseData(
            await fetch(`/api/v1/learning-runs/${encodeURIComponent(runId)}`, {
              cache: "no-store",
              signal: abort.signal,
            }),
          ),
        );
        if (abort.signal.aborted) return;
        setRun(data);
        setConnection("");
        if (data.completedCount === data.itemCount) {
          finished = true;
          source.close();
        }
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : "无法读取任务。");
      } finally {
        fetching = false;
      }
    };
    source.addEventListener("run.updated", () => {
      void refresh();
    });
    source.addEventListener("item.completed", () => {
      void refresh();
    });
    source.addEventListener("run.completed", () => {
      void refresh();
    });
    source.onerror = () => {
      if (!finished) setConnection("连接恢复中，正在补读任务进度…");
    };
    source.addEventListener("stream.unavailable", () => {
      void refresh();
    });
    void refresh();
    const polling = setInterval(() => {
      void refresh();
    }, 2_000);
    return () => {
      abort.abort();
      source.close();
      clearInterval(polling);
    };
  }, [runId]);

  function showRun(data: unknown) {
    const next = learningRunSchema.parse(data);
    setRun(next);
    setRunId(next.runId);
    window.history.replaceState(
      null,
      "",
      `?run=${encodeURIComponent(next.runId)}`,
    );
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const body = JSON.stringify({
      rawText: text,
      intent: "AUTO",
      uiLocale: "zh-CN",
      explanationLocale: "zh-CN",
      targetLanguage: "en",
    });
    const key = pending.current.get(body);
    try {
      await responseData(await fetch("/api/v1/session", { method: "POST" }));
      showRun(
        await responseData(
          await fetch("/api/v1/learning-runs", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body,
          }),
        ),
      );
      pending.current.clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败。");
    } finally {
      setSending(false);
    }
  }

  async function act(action: "cancel" | "retry") {
    if (!run) return;
    setSending(true);
    setError("");
    try {
      showRun(
        await responseData(
          await fetch(`/api/v1/learning-runs/${run.runId}/${action}`, {
            method: "POST",
            headers: {
              "Idempotency-Key": pendingAction.current.get(
                `${action}:${run.runId}`,
              ),
            },
          }),
        ),
      );
      pendingAction.current.clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败。");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="workspace" aria-label="学习任务">
      <p className="notice">
        {demo
          ? "演示模式 · 可体验提交、进度与重试；真实释义和评分尚未启用。"
          : "学习服务尚未配置，当前不提供真实释义和评分。"}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="learning-input">输入单词或句子</label>
        <textarea
          id="learning-input"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="input-help"
          required
        />
        <div className="form-footer">
          <p id="input-help">
            每行一项，最多 20 项 · {Array.from(text).length}/5000 字符
          </p>
          <button
            type="submit"
            disabled={sending || !text.trim() || Array.from(text).length > 5000}
          >
            {sending ? "正在提交…" : "开始学习"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {runId && !run && <p role="status">正在加载任务…</p>}
      {run && (
        <section className="results" aria-label="处理结果">
          <div className="result-heading">
            <h2>本次学习</h2>
            <span role="status">
              {labels[run.status]} · {run.completedCount}/{run.itemCount}
            </span>
          </div>
          <progress
            value={run.completedCount}
            max={run.itemCount}
            aria-label="任务完成进度"
          />
          {connection && <p role="status">{connection}</p>}
          <ol className="result-list">
            {run.items.map((item) => (
              <li key={item.itemId}>
                <div className="result-heading">
                  <h3>{item.originalText}</h3>
                  <span>{labels[item.status]}</span>
                </div>
                {item.result?.type === "CLARIFICATION" && (
                  <p>{item.result.data.message}</p>
                )}
                {item.error && (
                  <p className="error">{item.error.error.message}</p>
                )}
              </li>
            ))}
          </ol>
          <div className="actions">
            {run.completedCount < run.itemCount && (
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  void act("cancel");
                }}
              >
                取消剩余项目
              </button>
            )}
            {run.completedCount === run.itemCount &&
              run.items.some((item) => item.error?.error.retryable) && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    void act("retry");
                  }}
                >
                  重试失败项目
                </button>
              )}
          </div>
        </section>
      )}
    </section>
  );
}
