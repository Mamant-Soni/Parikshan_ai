"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import {
  createContact, updateContact, deleteContact, moveContact, requestVerification, confirmVerification, saveCard,
  type ServiceResult,
} from "@/lib/safety/service";

/**
 * Server actions for emergency contacts and the emergency card. The acting user
 * comes from the server session and the profile from the server-side active
 * profile — the browser never supplies a user or owner id.
 */

type ActionResult = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

async function run(fn: (userId: string, profileId: string) => Promise<ServiceResult<unknown> | ServiceResult>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };
  const profile = await getActiveProfile(user.id);
  const result = await fn(user.id, profile.id);
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/emergency");
  return { ok: true };
}

export async function createContactAction(input: unknown) {
  return run((userId, profileId) => createContact(userId, profileId, input));
}

export async function updateContactAction(contactId: string, input: unknown) {
  return run((userId) => updateContact(userId, String(contactId), input));
}

export async function deleteContactAction(contactId: string) {
  return run((userId) => deleteContact(userId, String(contactId)));
}

export async function moveContactAction(contactId: string, direction: "up" | "down") {
  if (direction !== "up" && direction !== "down") return { ok: false, error: "INVALID_INPUT" };
  return run((userId) => moveContact(userId, String(contactId), direction));
}

export async function requestVerificationAction(contactId: string) {
  return run((userId) => requestVerification(userId, String(contactId)));
}

export async function confirmVerificationAction(contactId: string, code: string) {
  return run((userId) => confirmVerification(userId, String(contactId), String(code)));
}

export async function saveCardAction(input: unknown) {
  return run((userId, profileId) => saveCard(userId, profileId, input));
}
