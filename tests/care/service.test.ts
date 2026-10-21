import test, { after, before } from "node:test";
import type { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { useTempDatabase, makeUser } from "../safety/db-fixture";

let prisma: PrismaClient;
let care: typeof import("@/lib/care/service");

before(async () => {
  useTempDatabase(); // must precede the client import
  ({ prisma } = await import("@/lib/database/client"));
  care = await import("@/lib/care/service");
});

after(async () => {
  await prisma.$disconnect();
});

const TASK = { title: "Annual eye check", category: "CHECKUP", source: "CLINICIAN", clinicianName: "Dr Mehta", dueDate: "2026-11-01", dueTime: "", recurrence: "NONE", reminderDaysBefore: 7, notes: "" };

test("tasks persist per profile and are listed for the owner only", async () => {
  const owner = await makeUser(prisma, "care-owner");
  const other = await makeUser(prisma, "care-other");
  const created = await care.createCareTask(owner.user.id, owner.profile.id, TASK);
  assert.equal(created.ok, true);
  assert.equal((await care.listCareTasks(owner.user.id, owner.profile.id)).length, 1);
  assert.deepEqual(await care.listCareTasks(other.user.id, owner.profile.id), []);
  if (created.ok && "data" in created) {
    assert.equal(created.data.source, "CLINICIAN");
    assert.equal(created.data.clinicianName, "Dr Mehta");
  }
});

test("cross-user writes on care tasks are blocked", async () => {
  const owner = await makeUser(prisma, "care-owner2");
  const other = await makeUser(prisma, "care-intruder");
  const created = await care.createCareTask(owner.user.id, owner.profile.id, TASK);
  if (!created.ok || !("data" in created)) throw new Error("setup");
  assert.deepEqual(await care.updateCareTask(other.user.id, created.data.id, TASK), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await care.changeCareTaskStatus(other.user.id, created.data.id, "cancel"), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await care.createCareTask(other.user.id, owner.profile.id, TASK), { ok: false, error: "NOT_FOUND" });
  assert.equal((await prisma.careTask.findUnique({ where: { id: created.data.id } }))?.status, "OPEN");
});

test("completing a task without a repeat interval does not create another one", async () => {
  const owner = await makeUser(prisma, "care-once");
  const created = await care.createCareTask(owner.user.id, owner.profile.id, TASK);
  if (!created.ok || !("data" in created)) throw new Error("setup");
  const done = await care.changeCareTaskStatus(owner.user.id, created.data.id, "complete");
  assert.equal(done.ok && done.data.status, "DONE");
  assert.equal(await prisma.careTask.count({ where: { profileId: owner.profile.id } }), 1);
});

test("completing a task with an explicit repeat interval creates the next occurrence", async () => {
  const owner = await makeUser(prisma, "care-repeat");
  const created = await care.createCareTask(owner.user.id, owner.profile.id, { ...TASK, recurrence: "EVERY_6_MONTHS", dueDate: "2026-10-20" });
  if (!created.ok || !("data" in created)) throw new Error("setup");
  await care.changeCareTaskStatus(owner.user.id, created.data.id, "complete");
  const rows = await prisma.careTask.findMany({ where: { profileId: owner.profile.id }, orderBy: { dueDate: "asc" } });
  assert.deepEqual(rows.map((r) => [r.dueDate, r.status]), [["2026-10-20", "DONE"], ["2027-04-20", "OPEN"]]);
});

test("postpone moves one week; cancel keeps the record", async () => {
  const owner = await makeUser(prisma, "care-move");
  const created = await care.createCareTask(owner.user.id, owner.profile.id, TASK);
  if (!created.ok || !("data" in created)) throw new Error("setup");
  const postponed = await care.changeCareTaskStatus(owner.user.id, created.data.id, "postpone");
  assert.equal(postponed.ok && postponed.data.dueDate, "2026-11-08");
  const cancelled = await care.changeCareTaskStatus(owner.user.id, created.data.id, "cancel");
  assert.equal(cancelled.ok && cancelled.data.status, "CANCELLED");
  assert.equal(await prisma.careTask.count({ where: { id: created.data.id } }), 1);
});

test("invalid task input is rejected with field errors", async () => {
  const owner = await makeUser(prisma, "care-invalid");
  const result = await care.createCareTask(owner.user.id, owner.profile.id, { ...TASK, title: "", dueDate: "2026-02-30" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.fieldErrors?.title);
    assert.ok(result.fieldErrors?.dueDate);
  }
});
