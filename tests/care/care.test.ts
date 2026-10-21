import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, addDays, careTaskSchema, isValidCalendarDate, nextOccurrence, taskTiming, daysBetween } from "@/lib/care/care";

test("calendar dates are validated (leap years and impossible days)", () => {
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2026-13-01"), false);
  assert.equal(isValidCalendarDate("26-10-20"), false);
});

test("adding months clamps the day to the end of the month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-10-20", 12), "2027-10-20");
  assert.equal(addDays("2026-10-20", 7), "2026-10-27");
});

test("recurrence is only produced for an explicitly chosen interval", () => {
  assert.equal(nextOccurrence("2026-10-20", "NONE"), null);
  assert.equal(nextOccurrence("2026-10-20", "EVERY_6_MONTHS"), "2027-04-20");
  assert.equal(nextOccurrence("2026-10-20", "YEARLY"), "2027-10-20");
});

test("timing uses calendar-day differences: overdue, due soon, upcoming, closed", () => {
  const today = "2026-10-20";
  assert.equal(taskTiming({ status: "OPEN", dueDate: "2026-10-19" }, today), "OVERDUE");
  assert.equal(taskTiming({ status: "OPEN", dueDate: "2026-10-20" }, today), "DUE_SOON");
  assert.equal(taskTiming({ status: "OPEN", dueDate: "2026-10-27" }, today), "DUE_SOON");
  assert.equal(taskTiming({ status: "OPEN", dueDate: "2026-10-28" }, today), "UPCOMING");
  assert.equal(taskTiming({ status: "DONE", dueDate: "2026-01-01" }, today), "CLOSED");
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
});

test("schema: clinician name is kept only for clinician-recommended tasks; reminder 0 means none", () => {
  const base = { title: "Eye check", dueDate: "2026-11-01", dueTime: "", recurrence: "NONE", reminderDaysBefore: 0, notes: "", category: "CHECKUP" };
  const user = careTaskSchema.parse({ ...base, source: "USER", clinicianName: "Dr X" });
  assert.equal(user.clinicianName, "");
  assert.equal(user.reminderDaysBefore, null);
  const clin = careTaskSchema.parse({ ...base, source: "CLINICIAN", clinicianName: "Dr X", reminderDaysBefore: 3 });
  assert.equal(clin.clinicianName, "Dr X");
  assert.equal(clin.reminderDaysBefore, 3);
});

test("schema rejects empty titles, bad times and unknown recurrence", () => {
  const base = { title: "x", dueDate: "2026-11-01", dueTime: "", recurrence: "NONE", reminderDaysBefore: null, notes: "", category: "GENERAL", source: "USER", clinicianName: "" };
  assert.equal(careTaskSchema.safeParse({ ...base, title: "" }).success, false);
  assert.equal(careTaskSchema.safeParse({ ...base, dueTime: "25:00" }).success, false);
  assert.equal(careTaskSchema.safeParse({ ...base, recurrence: "DAILY" }).success, false);
  assert.equal(careTaskSchema.safeParse({ ...base, dueTime: "09:30" }).success, true);
});
