import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/client";
import { writeAuditLog } from "@/lib/auth/guards";
import { normalizePhone } from "./phone";
import { emergencyCardSchema, type EmergencyCardInput, type CardView } from "./card";
import { requestPhoneCode, checkPhoneCode } from "./verification";
import { isVerificationProviderConfigured } from "./emergency-number";

/**
 * Emergency-contact and emergency-card data access. Every function receives the
 * server-verified `userId` (never a client-supplied owner id) and checks
 * ownership inside the query, so a record belonging to another account is
 * reported as "not found".
 */

export const MAX_CONTACTS = 10;
const MAX_VERIFY_REQUESTS_PER_DAY = 3;
const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export type ServiceError =
  | "NOT_FOUND"
  | "LIMIT_REACHED"
  | "INVALID_PHONE"
  | "INVALID_INPUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INVALID_CODE"
  | "EXPIRED"
  | "TOO_MANY_ATTEMPTS";

export type ServiceResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: ServiceError; fieldErrors?: Record<string, string> };

const RELATIONSHIPS = ["FAMILY", "FRIEND", "DOCTOR", "NEIGHBOUR", "OTHER"] as const;
const METHODS = ["CALL", "SMS", "WHATSAPP"] as const;

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Keep the name under 80 characters."),
  relationship: z.enum(RELATIONSHIPS).default("OTHER"),
  phone: z.string().trim().min(1, "Enter a mobile number.").max(25),
  preferredMethod: z.enum(METHODS).default("CALL"),
  notes: z.string().trim().max(300, "Keep notes under 300 characters.").default(""),
  consentEmergencyInfo: z.boolean().default(false),
  consentLocation: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export type ContactView = {
  id: string;
  name: string;
  relationship: string;
  phoneE164: string;
  phoneDisplay: string;
  priority: number;
  preferredMethod: string;
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED";
  verifiedAt: string | null;
  consentEmergencyInfo: boolean;
  consentLocation: boolean;
  notes: string;
};

function toView(row: {
  id: string; name: string; relationship: string; phoneE164: string; priority: number; preferredMethod: string;
  verificationStatus: string; verifiedAt: Date | null; consentEmergencyInfo: boolean; consentLocation: boolean; notes: string | null;
}): ContactView {
  const display = normalizePhone(row.phoneE164);
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    phoneE164: row.phoneE164,
    phoneDisplay: display.ok ? display.display : row.phoneE164,
    priority: row.priority,
    preferredMethod: row.preferredMethod,
    verificationStatus: (row.verificationStatus === "VERIFIED" || row.verificationStatus === "PENDING" ? row.verificationStatus : "UNVERIFIED"),
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    consentEmergencyInfo: row.consentEmergencyInfo,
    consentLocation: row.consentLocation,
    notes: row.notes ?? "",
  };
}

async function ownsProfile(userId: string, profileId: string) {
  return prisma.healthProfile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
}

/**
 * Contact-level consents are stored as append-only rows in `Consent`, one row
 * per change, keyed by purpose and the contact id. The newest row is the
 * current state. Only changed flags write a row.
 */
const CONTACT_CONSENTS = [
  { flag: "consentEmergencyInfo", purpose: "EMERGENCY_CONTACT_INFO" },
  { flag: "consentLocation", purpose: "EMERGENCY_LOCATION_SHARING" },
] as const;

type ConsentFlags = { consentEmergencyInfo: boolean; consentLocation: boolean };

/** Appends consent rows for flags that changed. Returns the changes so the caller can audit them. */
async function recordConsentChanges(
  tx: Prisma.TransactionClient,
  userId: string,
  contactId: string,
  before: ConsentFlags | null,
  after: ConsentFlags,
): Promise<Array<{ purpose: string; status: "GRANTED" | "REVOKED" }>> {
  const changes: Array<{ purpose: string; status: "GRANTED" | "REVOKED" }> = [];
  for (const { flag, purpose } of CONTACT_CONSENTS) {
    const was = before?.[flag] ?? false;
    const now = after[flag];
    if (was === now) continue;
    const status = now ? "GRANTED" : "REVOKED";
    await tx.consent.create({ data: { userId, purpose, status, subjectId: contactId } });
    changes.push({ purpose, status });
  }
  return changes;
}

async function auditConsentChanges(userId: string, contactId: string, changes: Array<{ purpose: string; status: string }>) {
  for (const change of changes) {
    await writeAuditLog({
      userId,
      action: change.status === "GRANTED" ? "consent.grant" : "consent.revoke",
      entityType: "EmergencyContact",
      entityId: contactId,
      meta: { purpose: change.purpose },
    });
  }
}

/** Lists contacts for a profile the user owns. Returns [] (not an error) for a profile they do not own. */
export async function listContacts(userId: string, profileId: string): Promise<ContactView[]> {
  if (!(await ownsProfile(userId, profileId))) return [];
  const rows = await prisma.emergencyContact.findMany({ where: { profileId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  return rows.map(toView);
}

export async function createContact(userId: string, profileId: string, raw: unknown): Promise<ServiceResult<ContactView>> {
  if (!(await ownsProfile(userId, profileId))) return { ok: false, error: "NOT_FOUND" };
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone.ok) return { ok: false, error: "INVALID_PHONE", fieldErrors: { phone: "Enter a valid mobile number for the selected country." } };

  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.emergencyContact.count({ where: { profileId } });
    if (count >= MAX_CONTACTS) return null;
    const last = await tx.emergencyContact.findFirst({ where: { profileId }, orderBy: { priority: "desc" }, select: { priority: true } });
    const row = await tx.emergencyContact.create({
      data: {
        profileId,
        name: parsed.data.name,
        relationship: parsed.data.relationship,
        phoneE164: phone.e164,
        priority: (last?.priority ?? 0) + 1,
        preferredMethod: parsed.data.preferredMethod,
        verificationStatus: "UNVERIFIED", // format validity never equals verification
        consentEmergencyInfo: parsed.data.consentEmergencyInfo,
        consentLocation: parsed.data.consentLocation,
        notes: parsed.data.notes || null,
      },
    });
    const consents = await recordConsentChanges(tx, userId, row.id, null, row);
    return { row, consents };
  });
  if (!created) return { ok: false, error: "LIMIT_REACHED" };
  const { row: createdRow, consents } = created;
  await writeAuditLog({ userId, action: "emergency_contact.create", entityType: "EmergencyContact", entityId: createdRow.id, meta: { priority: createdRow.priority } });
  await auditConsentChanges(userId, createdRow.id, consents);
  return { ok: true, data: toView(createdRow) };
}

export async function updateContact(userId: string, contactId: string, raw: unknown): Promise<ServiceResult<ContactView>> {
  const existing = await prisma.emergencyContact.findFirst({ where: { id: contactId, profile: { userId } } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone.ok) return { ok: false, error: "INVALID_PHONE", fieldErrors: { phone: "Enter a valid mobile number for the selected country." } };

  const phoneChanged = phone.e164 !== existing.phoneE164;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.emergencyContact.update({
    where: { id: contactId },
    data: {
      name: parsed.data.name,
      relationship: parsed.data.relationship,
      phoneE164: phone.e164,
      preferredMethod: parsed.data.preferredMethod,
      consentEmergencyInfo: parsed.data.consentEmergencyInfo,
      consentLocation: parsed.data.consentLocation,
      notes: parsed.data.notes || null,
      // A changed number must be verified again; a cleared one is never "verified".
      ...(phoneChanged ? { verificationStatus: "UNVERIFIED", verifiedAt: null } : {}),
    },
    });
    const consents = await recordConsentChanges(tx, userId, contactId, existing, row);
    return { row, consents };
  });
  await writeAuditLog({ userId, action: "emergency_contact.update", entityType: "EmergencyContact", entityId: contactId, meta: { phoneChanged } });
  await auditConsentChanges(userId, contactId, updated.consents);
  return { ok: true, data: toView(updated.row) };
}

export async function deleteContact(userId: string, contactId: string): Promise<ServiceResult> {
  const existing = await prisma.emergencyContact.findFirst({ where: { id: contactId, profile: { userId } } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  const consents = await prisma.$transaction(async (tx) => {
    await tx.emergencyContact.delete({ where: { id: contactId } });
    // Deleting a contact withdraws any consent it held.
    const revoked = await recordConsentChanges(tx, userId, contactId, existing, {
      consentEmergencyInfo: false,
      consentLocation: false,
    });
    const rest = await tx.emergencyContact.findMany({ where: { profileId: existing.profileId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    for (const [index, row] of rest.entries()) {
      if (row.priority !== index + 1) await tx.emergencyContact.update({ where: { id: row.id }, data: { priority: index + 1 } });
    }
    return revoked;
  });
  await writeAuditLog({ userId, action: "emergency_contact.delete", entityType: "EmergencyContact", entityId: contactId });
  await auditConsentChanges(userId, contactId, consents);
  return { ok: true };
}

/** Moves one contact up or down. Priorities are rewritten as 1..n in one transaction. */
export async function moveContact(userId: string, contactId: string, direction: "up" | "down"): Promise<ServiceResult> {
  const target = await prisma.emergencyContact.findFirst({ where: { id: contactId, profile: { userId } }, select: { id: true, profileId: true } });
  if (!target) return { ok: false, error: "NOT_FOUND" };
  await prisma.$transaction(async (tx) => {
    const rows = await tx.emergencyContact.findMany({ where: { profileId: target.profileId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    const index = rows.findIndex((row) => row.id === contactId);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= rows.length) return;
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
    for (const [position, row] of rows.entries()) {
      await tx.emergencyContact.update({ where: { id: row.id }, data: { priority: position + 1 } });
    }
  });
  await writeAuditLog({ userId, action: "emergency_contact.reorder", entityType: "EmergencyContact", entityId: contactId, meta: { direction } });
  return { ok: true };
}

/** Starts OTP verification through the server-side provider. Returns PROVIDER_UNAVAILABLE when none is configured. */
export async function requestVerification(userId: string, contactId: string): Promise<ServiceResult> {
  const contact = await prisma.emergencyContact.findFirst({ where: { id: contactId, profile: { userId } } });
  if (!contact) return { ok: false, error: "NOT_FOUND" };
  if (!isVerificationProviderConfigured()) {
    await writeAuditLog({ userId, action: "emergency_contact.verify_unavailable", entityType: "EmergencyContact", entityId: contactId });
    return { ok: false, error: "PROVIDER_UNAVAILABLE" };
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.contactVerification.count({ where: { contactId, createdAt: { gte: since } } });
  if (recent >= MAX_VERIFY_REQUESTS_PER_DAY) return { ok: false, error: "RATE_LIMITED" };

  const result = await requestPhoneCode(contact.phoneE164);
  if (!result.ok) return { ok: false, error: result.code === "PROVIDER_UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR" };

  await prisma.$transaction([
    prisma.contactVerification.create({
      data: { contactId, provider: "twilio-verify", providerRef: result.providerRef, status: "PENDING", expiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS) },
    }),
    prisma.emergencyContact.update({ where: { id: contactId }, data: { verificationStatus: "PENDING" } }),
  ]);
  await writeAuditLog({ userId, action: "emergency_contact.verify_requested", entityType: "EmergencyContact", entityId: contactId });
  return { ok: true };
}

export async function confirmVerification(userId: string, contactId: string, rawCode: string): Promise<ServiceResult> {
  const code = (rawCode ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "INVALID_INPUT", fieldErrors: { code: "Enter the 6-digit code." } };
  const contact = await prisma.emergencyContact.findFirst({ where: { id: contactId, profile: { userId } } });
  if (!contact) return { ok: false, error: "NOT_FOUND" };
  const pending = await prisma.contactVerification.findFirst({
    where: { contactId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return { ok: false, error: "EXPIRED" };
  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.contactVerification.update({ where: { id: pending.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "EXPIRED" };
  }
  if (pending.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: "TOO_MANY_ATTEMPTS" };

  const check = await checkPhoneCode(contact.phoneE164, code);
  if (!check.ok) {
    if (check.code === "PROVIDER_UNAVAILABLE") return { ok: false, error: "PROVIDER_UNAVAILABLE" };
    if (check.code === "PROVIDER_ERROR") return { ok: false, error: "PROVIDER_ERROR" };
    const attempts = pending.attempts + 1;
    await prisma.contactVerification.update({
      where: { id: pending.id },
      data: { attempts, status: attempts >= MAX_CODE_ATTEMPTS ? "FAILED" : "PENDING" },
    });
    return { ok: false, error: attempts >= MAX_CODE_ATTEMPTS ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE" };
  }

  await prisma.$transaction([
    prisma.contactVerification.update({ where: { id: pending.id }, data: { status: "APPROVED", attempts: pending.attempts + 1 } }),
    prisma.emergencyContact.update({ where: { id: contactId }, data: { verificationStatus: "VERIFIED", verifiedAt: new Date() } }),
  ]);
  await writeAuditLog({ userId, action: "emergency_contact.verified", entityType: "EmergencyContact", entityId: contactId });
  return { ok: true };
}

/* ── Emergency card ─────────────────────────────────────────────────────── */

export async function getCard(userId: string, profileId: string): Promise<CardView | null> {
  if (!(await ownsProfile(userId, profileId))) return null;
  const row = await prisma.emergencyCard.findUnique({ where: { profileId } });
  if (!row) return null;
  return {
    bloodGroup: row.bloodGroup,
    allergies: row.allergies,
    conditions: row.conditions,
    notes: row.notes,
    shareBloodGroup: row.shareBloodGroup,
    shareAllergies: row.shareAllergies,
    shareConditions: row.shareConditions,
    shareMedicines: row.shareMedicines,
  };
}

/** Names of the profile's active medicines (read from the medicine list; never stored on the card). */
export async function activeMedicineNames(userId: string, profileId: string): Promise<string[]> {
  if (!(await ownsProfile(userId, profileId))) return [];
  const rows = await prisma.medication.findMany({ where: { profileId, status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" }, take: 50 });
  return rows.map((row) => row.name);
}

export async function saveCard(userId: string, profileId: string, raw: unknown): Promise<ServiceResult> {
  if (!(await ownsProfile(userId, profileId))) return { ok: false, error: "NOT_FOUND" };
  const parsed = emergencyCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT", fieldErrors: fieldErrorsOf(parsed.error) };
  const input: EmergencyCardInput = parsed.data;
  const data = {
    bloodGroup: input.bloodGroup || null,
    bloodGroupSource: input.bloodGroup ? "USER_ENTERED" : "NONE", // never VERIFIED: no verification source exists
    allergies: input.allergies || null,
    conditions: input.conditions || null,
    notes: input.notes || null,
    shareBloodGroup: input.shareBloodGroup,
    shareAllergies: input.shareAllergies,
    shareConditions: input.shareConditions,
    shareMedicines: input.shareMedicines,
  };
  await prisma.emergencyCard.upsert({ where: { profileId }, create: { profileId, ...data }, update: data });
  // Audit records which kinds of field changed, never their values.
  await writeAuditLog({ userId, action: "emergency_card.update", entityType: "EmergencyCard", entityId: profileId, meta: { sharedFields: [input.shareBloodGroup && "bloodGroup", input.shareAllergies && "allergies", input.shareConditions && "conditions", input.shareMedicines && "medicines"].filter(Boolean) } });
  return { ok: true };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
