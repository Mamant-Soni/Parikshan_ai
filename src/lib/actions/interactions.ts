"use server";

import { prisma } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import { getInteractionProvider } from "@/lib/interactions";
import type { InteractionCheckResult } from "@/lib/interactions/types";
import { interactionCheckSchema } from "@/lib/validation";

/**
 * Drug-interaction check.
 *
 * Safety rules baked into this action:
 *  • The medicines are re-read from the database (never trusted from the client),
 *    which also enforces ownership of every selected id.
 *  • A "no interaction found" result is explicitly NOT a safety guarantee.
 *  • The response never contains advice to stop or change a medicine.
 */
export async function checkInteractionsAction(input: unknown): Promise<
  { ok: true; result: InteractionCheckResult } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const parsed = interactionCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "SELECT_TWO" };

  const medications = await prisma.medication.findMany({
    where: { id: { in: parsed.data.medicationIds }, profile: { userId: user.id } },
  });
  if (medications.length < 2) return { ok: false, error: "SELECT_TWO" };

  const provider = getInteractionProvider();
  const findings = await provider.check({
    medicines: medications.map((medication) => ({
      id: medication.id,
      name: medication.name,
      dosage: medication.dosage,
    })),
  });

  const pairCount = (medications.length * (medications.length - 1)) / 2;

  await writeAuditLog({
    userId: user.id,
    action: "interaction.check",
    entityType: "Medication",
    meta: { medicines: medications.length, findings: findings.length, provider: provider.name },
  });

  return {
    ok: true,
    result: {
      findings,
      providerName: provider.name,
      isVerifiedSource: provider.isVerifiedSource,
      checkedPairs: pairCount,
      disclaimer:
        "This check uses a small demo dataset, not a clinical reference. A missing warning does not mean a combination is safe — always ask your doctor or pharmacist.",
    },
  };
}
