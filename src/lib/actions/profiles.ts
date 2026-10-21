"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { assertProfileOwnership, writeAuditLog } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors, profileCreateSchema, profileUpdateSchema } from "@/lib/validation";
import { toDate } from "@/lib/i18n/format";

export type ProfileActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  profileId?: string;
};

export async function createProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const parsed = profileCreateSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    relationship: String(formData.get("relationship") ?? "OTHER"),
    kind: String(formData.get("kind") ?? "ADULT"),
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
    avatarEmoji: String(formData.get("avatarEmoji") ?? "").trim() || undefined,
    bloodGroup: String(formData.get("bloodGroup") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  }

  const { name, relationship, kind, dateOfBirth, avatarEmoji, bloodGroup } = parsed.data;
  const profile = await prisma.healthProfile.create({
    data: {
      userId: user.id,
      name,
      relationship,
      kind,
      dateOfBirth: dateOfBirth ? toDate(dateOfBirth) : null,
      avatarEmoji: avatarEmoji ?? defaultEmoji(relationship, kind),
      bloodGroup: bloodGroup ?? null,
      isPrimary: false,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "profile.create",
    entityType: "HealthProfile",
    entityId: profile.id,
  });
  revalidatePath("/family");
  revalidatePath("/dashboard");
  return { ok: true, profileId: profile.id };
}

function defaultEmoji(relationship: string, kind: string): string {
  if (kind === "CHILD" || relationship === "CHILD") return "🧒";
  if (kind === "ELDER" || relationship === "PARENT") return "👵";
  if (relationship === "SPOUSE") return "💑";
  return "🧑";
}

export async function switchProfileAction(profileId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const parsed = z.string().min(1).safeParse(profileId);
  if (!parsed.success) return { ok: false };

  try {
    await assertProfileOwnership(user.id, parsed.data);
  } catch {
    return { ok: false };
  }

  await prisma.user.update({ where: { id: user.id }, data: { activeProfileId: parsed.data } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteProfileAction(profileId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  let profile;
  try {
    profile = await assertProfileOwnership(user.id, profileId);
  } catch {
    return { ok: false };
  }
  if (profile.isPrimary) return { ok: false }; // Never delete "My Health" from the family screen.

  await prisma.healthProfile.delete({ where: { id: profile.id } });
  await prisma.user.update({ where: { id: user.id }, data: { activeProfileId: null } });
  await writeAuditLog({
    userId: user.id,
    action: "profile.delete",
    entityType: "HealthProfile",
    entityId: profile.id,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Updates the primary profile's details (name, date of birth, blood group,
 * avatar) — used by the profile-setup step after first sign-in.
 */
export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const parsed = profileUpdateSchema.safeParse({
    profileId: String(formData.get("profileId") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "ADULT"),
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
    avatarEmoji: String(formData.get("avatarEmoji") ?? "").trim() || undefined,
    bloodGroup: String(formData.get("bloodGroup") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };

  let profile;
  try {
    profile = await assertProfileOwnership(user.id, parsed.data.profileId);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const { name, kind, dateOfBirth, avatarEmoji, bloodGroup } = parsed.data;
  await prisma.healthProfile.update({
    where: { id: profile.id },
    data: {
      name,
      kind,
      dateOfBirth: dateOfBirth ? toDate(dateOfBirth) : null,
      avatarEmoji: avatarEmoji || profile.avatarEmoji,
      bloodGroup: bloodGroup ?? profile.bloodGroup,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: "profile.update",
    entityType: "HealthProfile",
    entityId: profile.id,
  });

  revalidatePath("/", "layout");
  return { ok: true, profileId: profile.id };
}
