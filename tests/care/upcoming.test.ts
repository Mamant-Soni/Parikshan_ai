import test from "node:test";
import assert from "node:assert/strict";
import { countDueWithin, selectUpcomingTasks, todayIso } from "@/lib/care/upcoming";
import type { CareTaskView } from "@/lib/care/service";

function task(overrides: Partial<CareTaskView> & { id: string; dueDate: string }): CareTaskView {
  const base: CareTaskView = {
    id: overrides.id,
    title: overrides.id,
    category: "GENERAL",
    source: "USER",
    clinicianName: "",
    dueDate: overrides.dueDate,
    dueTime: "",
    status: "OPEN",
    completedAt: null,
    recurrence: "NONE",
    reminderDaysBefore: null,
    notes: "",
  };
  return { ...base, ...overrides, title: overrides.title ?? base.title };
}

const TODAY = "2026-10-20";

test("dashboard shows only open tasks, soonest first, and flags overdue by date", () => {
  const items = selectUpcomingTasks(
    [
      task({ id: "later", dueDate: "2026-12-01" }),
      task({ id: "overdue", dueDate: "2026-10-01" }),
      task({ id: "done", dueDate: "2026-10-22", status: "DONE" }),
      task({ id: "cancelled", dueDate: "2026-10-23", status: "CANCELLED" }),
      task({ id: "soon", dueDate: "2026-10-25" }),
    ],
    TODAY,
    3,
  );

  assert.deepEqual(
    items.map((item) => item.task.id),
    ["overdue", "soon", "later"],
  );
  assert.equal(items[0]?.overdue, true);
  assert.equal(items[1]?.overdue, false);
});

test("a task due today is not overdue", () => {
  const [item] = selectUpcomingTasks([task({ id: "today", dueDate: TODAY })], TODAY);
  assert.equal(item?.overdue, false);
});

test("tasks with malformed dates are ignored rather than crashing the dashboard", () => {
  const items = selectUpcomingTasks(
    [
      task({ id: "bad", dueDate: "not-a-date" }),
      task({ id: "good", dueDate: "2026-10-21" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    items.map((item) => item.task.id),
    ["good"],
  );
});

test("the limit is respected and never negative", () => {
  const tasks = [task({ id: "a", dueDate: "2026-10-21" }), task({ id: "b", dueDate: "2026-10-22" })];
  assert.equal(selectUpcomingTasks(tasks, TODAY, 1).length, 1);
  assert.equal(selectUpcomingTasks(tasks, TODAY, 0).length, 0);
  assert.equal(selectUpcomingTasks(tasks, TODAY, -3).length, 0);
});

test("due-within counts only open tasks inside the window", () => {
  const tasks = [
    task({ id: "today", dueDate: TODAY }),
    task({ id: "in7", dueDate: "2026-10-27" }),
    task({ id: "in8", dueDate: "2026-10-28" }),
    task({ id: "past", dueDate: "2026-10-19" }),
    task({ id: "done", dueDate: "2026-10-21", status: "DONE" }),
  ];
  assert.equal(countDueWithin(tasks, TODAY, 7), 2);
});

test("todayIso uses local calendar fields with zero padding", () => {
  assert.equal(todayIso(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
  assert.equal(todayIso(new Date(2026, 10, 30, 0, 1)), "2026-11-30");
});
