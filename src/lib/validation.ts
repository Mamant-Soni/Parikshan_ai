import { z } from "zod";
import { DOSE_SLOTS, MEDICATION_STATUSES, PROFILE_KINDS, RECORD_TYPES, RELATIONSHIPS } from "@/types/domain";

/**
 * Every value that crosses a trust boundary (browser → server) is parsed with
 * one of these schemas. Server Actions and Route Handlers never trust the
 * shape of incoming data, and never trust an ID supplied by the client without
 * an ownership check (see src/lib/auth/guards.ts).
 */

export const abhaNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{14}$/, { message: "ABHA number must be exactly 14 digits" });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "Please enter a valid email address" });

/** Demo sign-in. Deliberately minimal: no passwords in the hackathon build. */
export const signInSchema = z.object({
  abhaNumber: z
    .string()
    .trim()
    .regex(/^\d{14}$/, { message: "ABHA number must be exactly 14 digits" })
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(2, { message: "Please enter your full name" }).max(80),
  email: emailSchema,
});

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Please enter a name" }).max(80),
  relationship: z.enum(RELATIONSHIPS),
  kind: z.enum(PROFILE_KINDS).default("ADULT"),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Please enter a valid date" }),
  avatarEmoji: z.string().trim().max(8).optional(),
  bloodGroup: z.string().trim().max(8).optional(),
});

export const profileUpdateSchema = z.object({
  profileId: z.string().trim().min(1),
  name: z.string().trim().min(1, { message: "Please enter a name" }).max(80),
  kind: z.enum(PROFILE_KINDS).default("ADULT"),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Please enter a valid date" }),
  avatarEmoji: z.string().trim().max(8).optional(),
  bloodGroup: z.string().trim().max(8).optional(),
});

export const preferencesSchema = z.object({
  language: z.enum(["en", "hi"]).optional(),
  easyRead: z.boolean().optional(),
  largeText: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  readAloud: z.boolean().optional(),
  autoReadAloud: z.boolean().optional(),
  notifyMeds: z.boolean().optional(),
  notifyRecords: z.boolean().optional(),
});

export const medicationCreateSchema = z.object({
  name: z.string().trim().min(1, { message: "Please enter the medicine name" }).max(120),
  dosage: z.string().trim().max(60).optional().or(z.literal("")),
  frequency: z.string().trim().max(80).optional().or(z.literal("")),
  duration: z.string().trim().max(60).optional().or(z.literal("")),
  startDate: z.string().trim().min(1, { message: "Please choose a start date" }),
  endDate: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  slots: z.array(z.enum(DOSE_SLOTS)).max(4).optional(),
  status: z.enum(MEDICATION_STATUSES).optional(),
});

export const medicationUpdateSchema = medicationCreateSchema.partial().extend({
  id: z.string().min(1),
});

export const recordMetaSchema = z.object({
  type: z.enum(RECORD_TYPES),
  title: z.string().trim().min(1).max(120).optional(),
  recordDate: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Please enter a valid date" }),
  doctorName: z.string().trim().max(120).optional().or(z.literal("")),
  facilityName: z.string().trim().max(160).optional().or(z.literal("")),
  diagnosisTerms: z.array(z.string().trim().max(120)).max(20).optional(),
});

/** Field-level corrections a user makes after reviewing OCR output. */
export const recordCorrectionSchema = z.object({
  recordId: z.string().min(1),
  field: z.string().min(1).max(120),
  value: z.union([z.string().max(500), z.number()]),
  target: z.enum(["record", "labResult", "medication"]).default("record"),
  targetId: z.string().optional(),
});

export const interactionCheckSchema = z
  .object({
    medicationIds: z.array(z.string().min(1)).min(2, { message: "Select at least two medicines" }).max(12),
  })
  .strict();

export const chatAskSchema = z.object({
  question: z.string().trim().min(2, { message: "Please type a question" }).max(400),
  /** Voice turns are treated exactly like typed text for authorization. */
  inputMode: z.enum(["text", "voice"]).default("text"),
});

/** Server-side text-to-speech only accepts a message id, never free text. */
export const voiceSpeakSchema = z
  .object({
    messageId: z.string().trim().min(1).max(64),
    language: z.enum(["en", "hi"]).optional(),
  })
  .strict();

export const voiceTranscribeMetaSchema = z.object({
  language: z.enum(["en", "hi"]).default("en"),
});

export const deleteDataSchema = z.object({
  confirm: z.literal("DELETE", { message: 'Type DELETE to confirm' }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type MedicationCreateInput = z.infer<typeof medicationCreateSchema>;
export type InteractionCheckInput = z.infer<typeof interactionCheckSchema>;

/** Flattens a ZodError into `{ field: message }` for form UIs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
