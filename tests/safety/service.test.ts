import test, { before, after } from "node:test";
import type { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { useTempDatabase, makeUser } from "./db-fixture";

let url = "";
let prisma: PrismaClient;
let service: typeof import("@/lib/safety/service");

const ALICE_CONTACT = { name: "Ravi", relationship: "FAMILY", phone: "98765 43210", preferredMethod: "CALL", notes: "", consentEmergencyInfo: true, consentLocation: true };

before(async () => {
  url = useTempDatabase(); // must precede the client import
  delete process.env.OTP_PROVIDER; // no provider configured in tests
  ({ prisma } = await import("@/lib/database/client"));
  service = await import("@/lib/safety/service");
});

after(async () => {
  await prisma.$disconnect();
});

test("database fixture points at a temporary file, never prisma/dev.db", () => {
  assert.match(url, /phc-test-/);
});

test("a new contact is stored as UNVERIFIED with E.164 phone and an audit entry without the phone", async () => {
  const { user, profile } = await makeUser(prisma, "a1");
  const result = await service.createContact(user.id, profile.id, ALICE_CONTACT);
  assert.equal(result.ok, true);
  if (!result.ok || !("data" in result)) return;
  assert.equal(result.data.verificationStatus, "UNVERIFIED");
  assert.equal(result.data.phoneE164, "+919876543210");
  const audit = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "emergency_contact.create" } });
  assert.ok(audit);
  assert.doesNotMatch(audit.meta ?? "", /9876543210|Ravi/);
});

test("cross-user access: another account cannot read, edit, delete, reorder or verify a contact", async () => {
  const owner = await makeUser(prisma, "owner");
  const intruder = await makeUser(prisma, "intruder");
  const created = await service.createContact(owner.user.id, owner.profile.id, ALICE_CONTACT);
  assert.equal(created.ok, true);
  if (!created.ok || !("data" in created)) return;
  const contactId = created.data.id;

  assert.deepEqual(await service.listContacts(intruder.user.id, owner.profile.id), []);
  assert.deepEqual(await service.updateContact(intruder.user.id, contactId, ALICE_CONTACT), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await service.deleteContact(intruder.user.id, contactId), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await service.moveContact(intruder.user.id, contactId, "up"), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await service.requestVerification(intruder.user.id, contactId), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await service.createContact(intruder.user.id, owner.profile.id, ALICE_CONTACT), { ok: false, error: "NOT_FOUND" });
  assert.deepEqual(await service.saveCard(intruder.user.id, owner.profile.id, {}), { ok: false, error: "NOT_FOUND" });
  assert.equal(await service.getCard(intruder.user.id, owner.profile.id), null);

  // The row is untouched.
  const still = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
  assert.ok(still);
  assert.equal(still.name, "Ravi");
});

test("verification without a configured provider fails closed and never marks a contact verified", async () => {
  const { user, profile } = await makeUser(prisma, "noprov");
  const created = await service.createContact(user.id, profile.id, ALICE_CONTACT);
  assert.equal(created.ok, true);
  if (!created.ok || !("data" in created)) return;
  const result = await service.requestVerification(user.id, created.data.id);
  assert.deepEqual(result, { ok: false, error: "PROVIDER_UNAVAILABLE" });
  const row = await prisma.emergencyContact.findUnique({ where: { id: created.data.id } });
  assert.equal(row?.verificationStatus, "UNVERIFIED");
  assert.equal(row?.verifiedAt, null);
  const confirm = await service.confirmVerification(user.id, created.data.id, "123456");
  assert.equal(confirm.ok, false);
  assert.equal((await prisma.emergencyContact.findUnique({ where: { id: created.data.id } }))?.verificationStatus, "UNVERIFIED");
});

test("changing a verified contact's number resets verification", async () => {
  const { user, profile } = await makeUser(prisma, "reset");
  const created = await service.createContact(user.id, profile.id, ALICE_CONTACT);
  if (!created.ok || !("data" in created)) throw new Error("setup");
  await prisma.emergencyContact.update({ where: { id: created.data.id }, data: { verificationStatus: "VERIFIED", verifiedAt: new Date() } });
  const sameNumber = await service.updateContact(user.id, created.data.id, { ...ALICE_CONTACT, name: "Ravi K" });
  assert.equal(sameNumber.ok && sameNumber.data.verificationStatus, "VERIFIED");
  const changed = await service.updateContact(user.id, created.data.id, { ...ALICE_CONTACT, phone: "9123456780" });
  assert.equal(changed.ok && changed.data.verificationStatus, "UNVERIFIED");
});

test("priorities are 1..n and survive reorder and delete", async () => {
  const { user, profile } = await makeUser(prisma, "order");
  const ids: string[] = [];
  for (const phone of ["9000000001", "9000000002", "9000000003"]) {
    const result = await service.createContact(user.id, profile.id, { ...ALICE_CONTACT, name: `C ${phone}`, phone });
    if (!result.ok || !("data" in result)) throw new Error("setup");
    ids.push(result.data.id);
  }
  await service.moveContact(user.id, ids[2], "up");
  let rows = await service.listContacts(user.id, profile.id);
  assert.deepEqual(rows.map((r) => r.id), [ids[0], ids[2], ids[1]]);
  assert.deepEqual(rows.map((r) => r.priority), [1, 2, 3]);
  await service.deleteContact(user.id, ids[0]);
  rows = await service.listContacts(user.id, profile.id);
  assert.deepEqual(rows.map((r) => r.priority), [1, 2]);
});

test("contact limit is enforced server-side", async () => {
  const { user, profile } = await makeUser(prisma, "limit");
  for (let i = 0; i < service.MAX_CONTACTS; i += 1) {
    const r = await service.createContact(user.id, profile.id, { ...ALICE_CONTACT, phone: `90000000${String(i).padStart(2, "0")}` });
    assert.equal(r.ok, true);
  }
  assert.deepEqual(await service.createContact(user.id, profile.id, { ...ALICE_CONTACT, phone: "9111111111" }), { ok: false, error: "LIMIT_REACHED" });
});

test("invalid contact input returns field errors and writes nothing", async () => {
  const { user, profile } = await makeUser(prisma, "invalid");
  const result = await service.createContact(user.id, profile.id, { ...ALICE_CONTACT, name: "", phone: "12345" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "INVALID_INPUT");
  assert.ok(result.fieldErrors?.name);
  assert.equal(await prisma.emergencyContact.count({ where: { profileId: profile.id } }), 0);
});

test("emergency card: blood group is stored as user-entered and never as verified", async () => {
  const { user, profile } = await makeUser(prisma, "card");
  const saved = await service.saveCard(user.id, profile.id, { bloodGroup: "B+", allergies: "Dust", shareBloodGroup: true });
  assert.equal(saved.ok, true);
  const row = await prisma.emergencyCard.findUnique({ where: { profileId: profile.id } });
  assert.equal(row?.bloodGroupSource, "USER_ENTERED");
  const view = await service.getCard(user.id, profile.id);
  assert.equal(view?.bloodGroup, "B+");
  assert.equal(view?.shareAllergies, false); // field-level: unticked means not shared
});

test("emergency card rejects an unknown blood group value", async () => {
  const { user, profile } = await makeUser(prisma, "badbg");
  const result = await service.saveCard(user.id, profile.id, { bloodGroup: "Z+" });
  assert.equal(result.ok, false);
});

test("contact consents are appended to Consent per change and revoked on delete", async () => {
  const { user, profile } = await makeUser(prisma, "consent");
  const created = await service.createContact(user.id, profile.id, ALICE_CONTACT);
  assert.equal(created.ok, true);
  if (!created.ok || !("data" in created)) return;
  const contactId = created.data.id;

  const rowsFor = (purpose: string) =>
    prisma.consent.findMany({ where: { userId: user.id, purpose, subjectId: contactId }, orderBy: { createdAt: "asc" } });
  assert.deepEqual((await rowsFor("EMERGENCY_CONTACT_INFO")).map((r) => r.status), ["GRANTED"]);
  assert.deepEqual((await rowsFor("EMERGENCY_LOCATION_SHARING")).map((r) => r.status), ["GRANTED"]);

  // Withdrawing location consent appends one REVOKED row and leaves the other flag alone.
  const withdrawn = await service.updateContact(user.id, contactId, { ...ALICE_CONTACT, consentLocation: false });
  assert.equal(withdrawn.ok, true);
  assert.deepEqual((await rowsFor("EMERGENCY_LOCATION_SHARING")).map((r) => r.status), ["GRANTED", "REVOKED"]);
  assert.deepEqual((await rowsFor("EMERGENCY_CONTACT_INFO")).map((r) => r.status), ["GRANTED"]);

  // Saving again with no change adds no rows.
  await service.updateContact(user.id, contactId, { ...ALICE_CONTACT, consentLocation: false });
  assert.equal((await rowsFor("EMERGENCY_LOCATION_SHARING")).length, 2);

  // Deleting the contact revokes what is still granted, and the audit log records the change without contact details.
  assert.deepEqual(await service.deleteContact(user.id, contactId), { ok: true });
  assert.deepEqual((await rowsFor("EMERGENCY_CONTACT_INFO")).map((r) => r.status), ["GRANTED", "REVOKED"]);
  const revokeAudit = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "consent.revoke", entityId: contactId } });
  assert.ok(revokeAudit);
  assert.doesNotMatch(revokeAudit.meta ?? "", /Ravi|9876543210/);
});
