import { z } from "zod";

/**
 * Preventive-care task rules. Dates are calendar dates (YYYY-MM-DD) in the
 * user's own time zone; nothing here converts times between zones. Recurrence
 * exists only when the user explicitly selects it.
 */

export const CARE_CATEGORIES = ["GENERAL", "SCREENING", "VACCINATION", "CHECKUP", "FOLLOW_UP", "OTHER"] as const;
export const RECURRENCES = ["NONE", "MONTHLY", "EVERY_3_MONTHS", "EVERY_6_MONTHS", "YEARLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function nextOccurrence(dueDate: string, recurrence: Recurrence): string | null {
  switch (recurrence) {
    case "MONTHLY":
      return addMonths(dueDate, 1);
    case "EVERY_3_MONTHS":
      return addMonths(dueDate, 3);
    case "EVERY_6_MONTHS":
      return addMonths(dueDate, 6);
    case "YEARLY":
      return addMonths(dueDate, 12);
    default:
      return null;
  }
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.UTC(...(fromDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))) as [number, number, number]));
  const b = Date.UTC(...(toDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

export type TaskTiming = "OVERDUE" | "DUE_SOON" | "UPCOMING" | "CLOSED";

export function taskTiming(task: { status: string; dueDate: string }, today: string): TaskTiming {
  if (task.status !== "OPEN") return "CLOSED";
  const diff = daysBetween(today, task.dueDate);
  if (diff < 0) return "OVERDUE";
  if (diff <= 7) return "DUE_SOON";
  return "UPCOMING";
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const careTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a task title.").max(120, "Keep the title under 120 characters."),
    category: z.enum(CARE_CATEGORIES).default("GENERAL"),
    source: z.enum(["USER", "CLINICIAN"]).default("USER"),
    clinicianName: z.string().trim().max(80, "Keep the name under 80 characters.").default(""),
    dueDate: z.string().trim().refine(isValidCalendarDate, "Enter a valid date."),
    dueTime: z.string().trim().refine((v) => v === "" || TIME.test(v), "Enter a time as HH:MM.").default(""),
    recurrence: z.enum(RECURRENCES).default("NONE"),
    reminderDaysBefore: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7), z.null()]).default(null),
    notes: z.string().trim().max(500, "Keep notes under 500 characters.").default(""),
  })
  .transform((value) => ({
    ...value,
    clinicianName: value.source === "CLINICIAN" ? value.clinicianName : "",
    reminderDaysBefore: value.reminderDaysBefore === 0 ? null : value.reminderDaysBefore,
  }));
export type CareTaskInput = z.infer<typeof careTaskSchema>;
