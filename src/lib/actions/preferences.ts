"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/session";
import { preferencesSchema } from "@/lib/validation";

/**
 * Persist language / accessibility / notification preferences.
 * Zod validates the payload; the browser is never trusted to send a language
 * the dictionary does not contain.
 */
export async function updatePreferencesAction(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: { userId: user.id, ...parsed.data },
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}
