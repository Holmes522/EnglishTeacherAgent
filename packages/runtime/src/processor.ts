import type { LearningItem } from "@english-teacher/contracts";
import type { Outcome } from "./repository.js";

export type ItemProcessor = (
  item: LearningItem,
  signal: AbortSignal,
) => Promise<Outcome>;
export const fixtureProcessor: ItemProcessor = async (item) => {
  if (item.normalizedText === "fixture:fail")
    return {
      error: {
        schemaVersion: 1,
        error: {
          code: "FIXTURE_FAILURE",
          message: "演示失败：用于验证部分失败和重试。",
          retryable: true,
          traceId: item.itemId,
        },
      },
    };
  return {
    result: {
      schemaVersion: 1,
      type: "CLARIFICATION",
      data: {
        message:
          "演示结果：文本已通过异步任务处理。真实词典与模型尚未接入，此结果不包含释义或评分。",
        options: ["等待真实学习能力接入"],
      },
    },
  };
};
export const disabledProcessor: ItemProcessor = async (item) => ({
  error: {
    schemaVersion: 1,
    error: {
      code: "NOT_ENABLED",
      message: "学习服务尚未配置。",
      retryable: false,
      traceId: item.itemId,
    },
  },
});
