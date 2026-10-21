"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { createCareTask, updateCareTask, changeCareTaskStatus, type CareResult } from "@/lib/care/service";

/** Server actions for the preventive-care calendar. Ownership is checked in the service layer. */

type ActionResult = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

async function finish(result: CareResult<unknown>): Promise<ActionResult> {
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/care");
  return { ok: true };
}

async function withUser(fn: (userId: string, profileId: string) => Promise<CareResult<unknown>>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };
  const profile = await getActiveProfile(user.id);
  return finish(await fn(user.id, profile.id));
}

export async function createCareTaskAction(input: unknown) {
  return withUser((userId, profileId) => createCareTask(userId, profileId, input));
}

export async function updateCareTaskAction(taskId: string, input: unknown) {
  return withUser((userId) => updateCareTask(userId, String(taskId), input));
}

export async function changeCareTaskStatusAction(taskId: string, action: "complete" | "postpone" | "cancel" | "reopen") {
  if (!["complete", "postpone", "cancel", "reopen"].includes(action)) return { ok: false, error: "INVALID_INPUT" };
  return withUser((userId) => changeCareTaskStatus(userId, String(taskId), action));
}
