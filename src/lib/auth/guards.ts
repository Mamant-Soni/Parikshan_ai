import { prisma } from "@/lib/database/client";
import type { ProfileKind, Relationship } from "@/types/domain";

/**
 * Ownership + profile helpers.
 *
 * Every read and write in the app is scoped to the signed-in user. A client can
 * send any profile id, so each accessor re-checks ownership server side instead
 * of trusting the id (a core healthcare-privacy requirement).
 */

export type ActiveProfile = {
  id: string;
  name: string;
  relationship: Relationship | string;
  kind: ProfileKind | string;
  dateOfBirth: Date | null;
  avatarEmoji: string;
  isPrimary: boolean;
  isDemo: boolean;
  userId: string;
};

export async function listProfiles(userId: string) {
  return prisma.healthProfile.findMany({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/** Loads the active profile, falling back to the primary one, then creating one. */
export async function getActiveProfile(
  userId: string,
  preferredProfileId?: string | null,
): Promise<ActiveProfile> {
  const candidateId = preferredProfileId ?? (await prisma.user.findUnique({ where: { id: userId } }))?.activeProfileId;

  if (candidateId) {
    const owned = await prisma.healthProfile.findFirst({
      where: { id: candidateId, userId },
    });
    if (owned) return owned as ActiveProfile;
  }

  const primary = await prisma.healthProfile.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (primary) return primary as ActiveProfile;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const created = await prisma.healthProfile.create({
    data: {
      userId,
      name: user?.name ?? "My Health",
      relationship: "SELF",
      kind: "ADULT",
      isPrimary: true,
      avatarEmoji: "🙂",
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { activeProfileId: created.id } });
  return created as ActiveProfile;
}

/** Throws when the profile does not belong to the user — used by server actions. */
export async function assertProfileOwnership(userId: string, profileId: string) {
  const profile = await prisma.healthProfile.findFirst({ where: { id: profileId, userId } });
  if (!profile) throw new Error("FORBIDDEN");
  return profile;
}

export async function getProfileById(userId: string, profileId: string) {
  return prisma.healthProfile.findFirst({ where: { id: profileId, userId } });
}

/** Confirms a record belongs to a profile owned by the user. */
export async function assertRecordOwnership(userId: string, recordId: string) {
  const record = await prisma.healthRecord.findFirst({
    where: { id: recordId, profile: { userId } },
  });
  if (!record) throw new Error("FORBIDDEN");
  return record;
}

export async function assertMedicationOwnership(userId: string, medicationId: string) {
  const medication = await prisma.medication.findFirst({
    where: { id: medicationId, profile: { userId } },
  });
  if (!medication) throw new Error("FORBIDDEN");
  return medication;
}

export async function writeAuditLog(input: {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        // Never store clinical payloads in the audit trail.
        meta: input.meta ? JSON.stringify(input.meta) : null,
      },
    })
    .catch(() => undefined);
}
