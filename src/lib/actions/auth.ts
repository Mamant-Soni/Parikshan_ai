"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/database/client";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import { fieldErrors, signInSchema } from "@/lib/validation";
import { validateAbhaNumber } from "@/lib/fhir/abha";
import { DEMO_ACCOUNT_EMAIL, seedDemoAccount } from "@/lib/demo/demo-seed";
import { deleteDataSchema } from "@/lib/validation";
import { removeUploadedFile } from "@/lib/uploads/storage";

/**
 * Demo authentication.
 *
 * ⚠️ This is a hackathon demo: there is no password, no OTP and no ABHA
 * verification. It exists so judges can experience the product instantly.
 * See src/lib/fhir/abha.ts for the production ABDM checklist and the README
 * section "How to integrate official ABHA/ABDM services".
 */

export type SignInState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
};

export async function signInAction(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    abhaNumber: String(formData.get("abhaNumber") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error), error: "VALIDATION" };
  }

  const { name, email } = parsed.data;
  const abhaNumber = parsed.data.abhaNumber || null;
  const abhaCheck = abhaNumber ? validateAbhaNumber(abhaNumber) : null;
  // Demo mode accepts any 14-digit number but tells the truth about the checksum.
  const notice = abhaCheck?.message ?? undefined;

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { name, abhaNumber: abhaNumber ?? existing.abhaNumber },
    });
    userId = updated.id;
  } else {
    const created = await prisma.user.create({
      data: {
        name,
        email,
        abhaNumber,
        isDemo: false,
        preferences: { create: { language: "en" } },
        consents: { create: { purpose: "SELF_CARE", status: "GRANTED" } },
        profiles: {
          create: {
            name,
            relationship: "SELF",
            kind: "ADULT",
            isPrimary: true,
            avatarEmoji: "🙂",
          },
        },
      },
      include: { profiles: true },
    });
    userId = created.id;

    // New accounts land on the profile they just created.
    const primaryProfile = created.profiles[0];
    if (primaryProfile) {
      await prisma.user.update({ where: { id: created.id }, data: { activeProfileId: primaryProfile.id } });
    }
  }

  await createSession(userId);
  await writeAuditLog({ userId, action: "auth.signin.demo", entityType: "User", entityId: userId });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** One click: create (or reuse) the seeded demo account and sign in. */
export async function demoSignInAction(): Promise<never> {
  let user = await prisma.user.findUnique({ where: { email: DEMO_ACCOUNT_EMAIL } });

  if (!user) {
    await seedDemoAccount(prisma);
    user = await prisma.user.findUnique({ where: { email: DEMO_ACCOUNT_EMAIL } });
  }

  if (!user) {
    // Should not happen; give the user a clear path rather than a crash.
    redirect("/login?error=demo-unavailable");
  }

  await createSession(user.id);
  await writeAuditLog({ userId: user.id, action: "auth.signin.demo-account", entityType: "User", entityId: user.id });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Right to erasure: removes the account, profiles, records, files and chat. */
export async function deleteAccountAction(_prevState: { ok: boolean; error?: string }, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const parsed = deleteDataSchema.safeParse({ confirm: String(formData.get("confirm") ?? "").trim() });
  if (!parsed.success) return { ok: false, error: "CONFIRM_REQUIRED" };

  // Remove uploaded files from disk before deleting the rows that point at them.
  const files = await prisma.healthRecord.findMany({
    where: { profile: { userId: user.id }, filePath: { not: null } },
    select: { filePath: true },
  });
  for (const file of files) {
    if (file.filePath) await removeUploadedFile(file.filePath);
  }

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
