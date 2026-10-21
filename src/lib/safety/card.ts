import { z } from "zod";

/** Field-level sharing flags. A field is only ever included in a message when ticked. */
export const CARD_SHARE_FIELDS = ["bloodGroup", "allergies", "conditions", "medicines"] as const;
export type CardShareField = (typeof CARD_SHARE_FIELDS)[number];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const emergencyCardSchema = z.object({
  bloodGroup: z.enum(["", ...BLOOD_GROUPS]).default(""),
  allergies: z.string().trim().max(500, "Keep allergies under 500 characters.").default(""),
  conditions: z.string().trim().max(500, "Keep conditions under 500 characters.").default(""),
  notes: z.string().trim().max(500, "Keep notes under 500 characters.").default(""),
  shareBloodGroup: z.boolean().default(false),
  shareAllergies: z.boolean().default(false),
  shareConditions: z.boolean().default(false),
  shareMedicines: z.boolean().default(false),
});
export type EmergencyCardInput = z.infer<typeof emergencyCardSchema>;

export type CardView = {
  bloodGroup: string | null;
  allergies: string | null;
  conditions: string | null;
  notes: string | null;
  shareBloodGroup: boolean;
  shareAllergies: boolean;
  shareConditions: boolean;
  shareMedicines: boolean;
};

export function cardHasDetails(card: Partial<CardView> | null, medicineNames: string[]): boolean {
  if (!card) return medicineNames.length > 0;
  return Boolean(card.bloodGroup || card.allergies || card.conditions || card.notes || medicineNames.length > 0);
}

/**
 * Items that may be included in a shared message. Only ticked fields appear.
 * Blood group is labelled self-reported; nothing is labelled verified.
 */
export function shareableItems(card: CardView | null, medicineNames: string[]): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  if (!card) return items;
  if (card.shareBloodGroup && card.bloodGroup) items.push({ label: "Blood group (self-reported)", value: card.bloodGroup });
  if (card.shareAllergies && card.allergies) items.push({ label: "Allergies (user-entered)", value: card.allergies });
  if (card.shareConditions && card.conditions) items.push({ label: "Conditions (user-entered)", value: card.conditions });
  if (card.shareMedicines && medicineNames.length > 0) items.push({ label: "Medicines (from your list)", value: medicineNames.join(", ") });
  return items;
}
