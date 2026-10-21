import type { CareTaskView } from "./service";

/**
 * Selection for the dashboard's preventive-care card.
 *
 * Only OPEN tasks are shown, oldest due date first. A task is "overdue" when its
 * calendar date is before today (local date, YYYY-MM-DD). This is a pure helper
 * so the dashboard summary is unit-tested instead of being re-derived inline.
 */
export type UpcomingCareItem = {
  task: CareTaskView;
  overdue: boolean;
};

export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function selectUpcomingTasks(
  tasks: readonly CareTaskView[],
  today: string,
  limit = 3,
): UpcomingCareItem[] {
  return tasks
    .filter((task) => task.status === "OPEN" && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))
    .sort((a, b) => (a.dueDate === b.dueDate ? a.title.localeCompare(b.title) : a.dueDate < b.dueDate ? -1 : 1))
    .slice(0, Math.max(0, limit))
    .map((task) => ({ task, overdue: task.dueDate < today }));
}

/** Number of open tasks due within the next `days` calendar days (inclusive). */
export function countDueWithin(tasks: readonly CareTaskView[], today: string, days: number): number {
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(todayTime)) return 0;
  const horizon = todayTime + days * 86_400_000;
  return tasks.filter((task) => {
    if (task.status !== "OPEN") return false;
    const due = Date.parse(`${task.dueDate}T00:00:00Z`);
    return !Number.isNaN(due) && due >= todayTime && due <= horizon;
  }).length;
}
