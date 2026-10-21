import { prisma } from "@/lib/database/client";
import { writeAuditLog } from "@/lib/auth/guards";
import { addDays, careTaskSchema, nextOccurrence, type Recurrence } from "./care";

/**
 * Preventive-care task persistence. All functions take the server-verified
 * `userId` and check ownership of the profile or task inside the query.
 * Audit entries never contain task titles or notes.
 */

export type CareTaskView = {
  id: string;
  title: string;
  category: string;
  source: "USER" | "CLINICIAN";
  clinicianName: string;
  dueDate: string;
  dueTime: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  completedAt: string | null;
  recurrence: Recurrence;
  reminderDaysBefore: number | null;
  notes: string;
};

type Row = {
  id: string; title: string; category: string; source: string; clinicianName: string | null; dueDate: string; dueTime: string | null;
  status: string; completedAt: Date | null; recurrence: string; reminderDaysBefore: number | null; notes: string | null;
};

function toView(row: Row): CareTaskView {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    source: row.source === "CLINICIAN" ? "CLINICIAN" : "USER",
    clinicianName: row.clinicianName ?? "",
    dueDate: row.dueDate,
    dueTime: row.dueTime ?? "",
    status: row.status === "DONE" || row.status === "CANCELLED" ? row.status : "OPEN",
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    recurrence: (row.recurrence as Recurrence) ?? "NONE",
    reminderDaysBefore: row.reminderDaysBefore,
    notes: row.notes ?? "",
  };
}

export type CareError = "NOT_FOUND" | "INVALID_INPUT";
export type CareResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: CareError; fieldErrors?: Record<string, string> };

export async function listCareTasks(userId: string, profileId: string): Promise<CareTaskView[]> {
  const owned = await prisma.healthProfile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
  if (!owned) return [];
  const rows = await prisma.careTask.findMany({ where: { profileId }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  return rows.map(toView);
}

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function dataFrom(parsed: ReturnType<typeof careTaskSchema.parse>) {
  return {
    title: parsed.title,
    category: parsed.category,
    source: parsed.source,
    clinicianName: parsed.clinicianName || null,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime || null,
    recurrence: parsed.recurrence,
    reminderDaysBefore: parsed.reminderDaysBefore,
    notes: parsed.notes || null,
  };
}

export async function createCareTask(userId: string, profileId: string, raw: unknown): Promise<CareResult<CareTaskView>> {
  const owned = await prisma.healthProfile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
  if (!owned) return { ok: false, error: "NOT_FOUND" };
  const parsed = careTaskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const row = await prisma.careTask.create({ data: { profileId, status: "OPEN", ...dataFrom(parsed.data) } });
  await writeAuditLog({ userId, action: "care_task.create", entityType: "CareTask", entityId: row.id, meta: { source: row.source, recurrence: row.recurrence } });
  return { ok: true, data: toView(row) };
}

export async function updateCareTask(userId: string, taskId: string, raw: unknown): Promise<CareResult<CareTaskView>> {
  const existing = await prisma.careTask.findFirst({ where: { id: taskId, profile: { userId } } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  const parsed = careTaskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const row = await prisma.careTask.update({ where: { id: taskId }, data: dataFrom(parsed.data) });
  await writeAuditLog({ userId, action: "care_task.update", entityType: "CareTask", entityId: taskId });
  return { ok: true, data: toView(row) };
}

/**
 * Status changes. `complete` marks the task done and, only when the user chose a
 * repeat interval, creates the next occurrence in the same transaction.
 * `postpone` moves the due date forward by one week. `cancel` keeps the record.
 */
export async function changeCareTaskStatus(
  userId: string,
  taskId: string,
  action: "complete" | "postpone" | "cancel" | "reopen",
): Promise<CareResult<CareTaskView>> {
  const existing = await prisma.careTask.findFirst({ where: { id: taskId, profile: { userId } } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };

  let updated: Row;
  if (action === "complete") {
    updated = await prisma.$transaction(async (tx) => {
      const done = await tx.careTask.update({ where: { id: taskId }, data: { status: "DONE", completedAt: new Date() } });
      const nextDate = nextOccurrence(existing.dueDate, existing.recurrence as Recurrence);
      if (nextDate) {
        await tx.careTask.create({
          data: {
            profileId: existing.profileId,
            title: existing.title,
            category: existing.category,
            source: existing.source,
            clinicianName: existing.clinicianName,
            dueDate: nextDate,
            dueTime: existing.dueTime,
            status: "OPEN",
            recurrence: existing.recurrence,
            reminderDaysBefore: existing.reminderDaysBefore,
            notes: existing.notes,
          },
        });
      }
      return done;
    });
  } else if (action === "postpone") {
    updated = await prisma.careTask.update({ where: { id: taskId }, data: { dueDate: addDays(existing.dueDate, 7) } });
  } else if (action === "cancel") {
    updated = await prisma.careTask.update({ where: { id: taskId }, data: { status: "CANCELLED" } });
  } else {
    updated = await prisma.careTask.update({ where: { id: taskId }, data: { status: "OPEN", completedAt: null } });
  }
  await writeAuditLog({ userId, action: `care_task.${action}`, entityType: "CareTask", entityId: taskId });
  return { ok: true, data: toView(updated) };
}
