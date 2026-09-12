import type { LearningItem, LearningRun } from "@english-teacher/contracts";

type ItemStatus = LearningItem["status"];
const transitions: Record<ItemStatus, readonly ItemStatus[]> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function assertItemTransition(from: ItemStatus, to: ItemStatus): void {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid item transition: ${from} -> ${to}`);
}

export function summarizeStatuses(
  statuses: ItemStatus[],
): Pick<LearningRun, "status" | "completedCount"> {
  const completedCount = statuses.filter(
    (status) => transitions[status].length === 0,
  ).length;
  const status = statuses.every((value) => value === "PENDING")
    ? "QUEUED"
    : completedCount < statuses.length
      ? "RUNNING"
      : statuses.includes("CANCELLED")
        ? "CANCELLED"
        : statuses.every((value) => value === "SUCCEEDED")
          ? "SUCCEEDED"
          : statuses.includes("SUCCEEDED")
            ? "PARTIAL_SUCCESS"
            : "FAILED";
  return { status, completedCount };
}
