"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { assertMedicationOwnership, assertProfileOwnership, writeAuditLog } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors, medicationCreateSchema } from "@/lib/validation";
import { toDate, toDayKey } from "@/lib/i18n/format";
import { DOSE_SLOTS } from "@/types/domain";

export type MedicationState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createMedicationAction(
  _prevState: MedicationState,
  formData: FormData,
): Promise<MedicationState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const profileId = String(formData.get("profileId") ?? "");
  try {
    await assertProfileOwnership(user.id, profileId);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const slots = formData.getAll("slots").map(String).filter((slot) => (DOSE_SLOTS as readonly string[]).includes(slot));

  const parsed = medicationCreateSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    dosage: String(formData.get("dosage") ?? "").trim(),
    frequency: String(formData.get("frequency") ?? "").trim(),
    duration: String(formData.get("duration") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? "").trim(),
    endDate: String(formData.get("endDate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    slots,
  });

  if (!parsed.success) {
    return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  }

  const startDate = toDate(parsed.data.startDate);
  if (!startDate) {
    return { ok: false, error: "VALIDATION", fieldErrors: { startDate: "Please choose a start date" } };
  }
  const endDate = toDate(parsed.data.endDate ?? "");
  const today = toDayKey();

  const medication = await prisma.medication.create({
    data: {
      profileId,
      name: parsed.data.name,
      dosage: parsed.data.dosage || null,
      frequency: parsed.data.frequency || null,
      duration: parsed.data.duration || null,
      startDate,
      endDate,
      notes: parsed.data.notes || null,
      slots: JSON.stringify(parsed.data.slots ?? []),
      // A medicine whose start date is in the future is "Upcoming", otherwise active.
      status: startDate > new Date() ? "UPCOMING" : "ACTIVE",
      isVerified: true,
    },
  });

  void today;
  await writeAuditLog({
    userId: user.id,
    action: "medication.create",
    entityType: "Medication",
    entityId: medication.id,
  });

  revalidatePath("/medications");
  revalidatePath("/dashboard");
  revalidatePath("/interactions");
  return { ok: true };
}

export async function deleteMedicationAction(medicationId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  try {
    const medication = await assertMedicationOwnership(user.id, medicationId);
    await prisma.medication.delete({ where: { id: medication.id } });
    await writeAuditLog({
      userId: user.id,
      action: "medication.delete",
      entityType: "Medication",
      entityId: medication.id,
    });
  } catch {
    return { ok: false as const };
  }
  revalidatePath("/medications");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

const doseToggleSchema = z.object({
  medicationId: z.string().min(1),
  slot: z.enum(DOSE_SLOTS),
  status: z.enum(["PENDING", "TAKEN", "SKIPPED"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Tick off a dose for today (demo reminders are local to the app). */
export async function toggleDoseAction(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = doseToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };

  const { medicationId, slot, status } = parsed.data;
  const day = parsed.data.day ?? toDayKey();

  let medication;
  try {
    medication = await assertMedicationOwnership(user.id, medicationId);
  } catch {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  await prisma.doseLog.upsert({
    where: { medicationId_day_slot: { medicationId, day, slot } },
    update: { status, takenAt: status === "TAKEN" ? new Date() : null },
    create: {
      medicationId,
      profileId: medication.profileId,
      day,
      slot,
      time: slot === "MORNING" ? "08:00" : slot === "AFTERNOON" ? "14:00" : slot === "EVENING" ? "18:00" : "20:00",
      status,
      takenAt: status === "TAKEN" ? new Date() : null,
    },
  });

  revalidatePath("/medications");
  revalidatePath("/dashboard");
  revalidatePath("/caregiver");
  return { ok: true as const };
}

/** Marks every scheduled dose for today as taken (a common elderly-user need). */
export async function markAllDosesTakenAction(profileId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  try {
    await assertProfileOwnership(user.id, profileId);
  } catch {
    return { ok: false as const };
  }

  const day = toDayKey();
  const medications = await prisma.medication.findMany({ where: { profileId, status: "ACTIVE" } });
  for (const medication of medications) {
    const slots = safeSlots(medication.slots);
    for (const slot of slots) {
      await prisma.doseLog.upsert({
        where: { medicationId_day_slot: { medicationId: medication.id, day, slot } },
        update: { status: "TAKEN", takenAt: new Date() },
        create: {
          medicationId: medication.id,
          profileId,
          day,
          slot,
          time: slot === "MORNING" ? "08:00" : slot === "AFTERNOON" ? "14:00" : slot === "EVENING" ? "18:00" : "20:00",
          status: "TAKEN",
          takenAt: new Date(),
        },
      });
    }
  }

  revalidatePath("/medications");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

function safeSlots(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((slot) => typeof slot === "string") : [];
  } catch {
    return [];
  }
}
