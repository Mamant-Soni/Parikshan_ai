import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "@/lib/safety/phone";
import { computeReadiness } from "@/lib/safety/readiness";
import { shareableItems, cardHasDetails } from "@/lib/safety/card";
import { buildLocationMessage, mapsLink, roundCoordinate } from "@/lib/safety/messages";
import { getEmergencyNumber, isVerificationProviderConfigured } from "@/lib/safety/emergency-number";

test("Indian mobile numbers normalise to +91 E.164 in several common formats", () => {
  for (const input of ["9876543210", "98765 43210", "+91 98765 43210", "+91-98765-43210", "09876543210", "919876543210", "0091 9876543210"]) {
    const result = normalizePhone(input);
    assert.equal(result.ok, true, input);
    if (result.ok) {
      assert.equal(result.e164, "+919876543210", input);
      assert.equal(result.region, "IN");
    }
  }
});

test("invalid Indian numbers are rejected (must start 6-9 and have 10 digits)", () => {
  for (const input of ["12345", "5876543210", "98765432101", "+91 12345 67890", "abcdefghij", ""]) {
    assert.equal(normalizePhone(input).ok, false, input);
  }
});

test("international numbers need a + and 8-15 digits and are normalised", () => {
  const result = normalizePhone("+44 20 7946 0958");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.e164, "+442079460958");
  assert.equal(normalizePhone("+123").ok, false);
});

test("format validity is never reported as verification", () => {
  const result = normalizePhone("9876543210");
  assert.equal(result.ok, true);
  assert.equal("verified" in (result as object), false);
});

test("emergency number defaults to 112 and rejects unsafe values", () => {
  assert.equal(getEmergencyNumber({}), "112");
  assert.equal(getEmergencyNumber({ EMERGENCY_NUMBER: "108" }), "108");
  assert.equal(getEmergencyNumber({ EMERGENCY_NUMBER: "tel:112;evil" }), "112");
  assert.equal(getEmergencyNumber({ EMERGENCY_NUMBER: "1234567890123" }), "112");
});

test("verification provider counts as configured only with all Twilio variables", () => {
  assert.equal(isVerificationProviderConfigured({}), false);
  assert.equal(isVerificationProviderConfigured({ OTP_PROVIDER: "twilio-verify", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "x" }), false);
  assert.equal(isVerificationProviderConfigured({ OTP_PROVIDER: "twilio-verify", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "x", TWILIO_VERIFY_SERVICE_SID: "VA" }), true);
});

test("readiness never reports READY without a verified contact that consented", () => {
  const unverified = computeReadiness({ contacts: [{ verificationStatus: "UNVERIFIED", consentEmergencyInfo: true }], cardHasDetails: true, verificationProviderConfigured: false });
  assert.equal(unverified.level, "NEEDS_ATTENTION");
  const none = computeReadiness({ contacts: [], cardHasDetails: true, verificationProviderConfigured: false });
  assert.equal(none.level, "ACTION_REQUIRED");
  const ready = computeReadiness({ contacts: [{ verificationStatus: "VERIFIED", consentEmergencyInfo: true }], cardHasDetails: true, verificationProviderConfigured: true });
  assert.equal(ready.level, "READY");
  const noConsent = computeReadiness({ contacts: [{ verificationStatus: "VERIFIED", consentEmergencyInfo: false }], cardHasDetails: true, verificationProviderConfigured: true });
  assert.equal(noConsent.level, "NEEDS_ATTENTION");
});

test("only ticked card fields are shared, and blood group is labelled self-reported", () => {
  const card = { bloodGroup: "O+", allergies: "Penicillin", conditions: "Asthma", notes: null, shareBloodGroup: true, shareAllergies: false, shareConditions: true, shareMedicines: false };
  const items = shareableItems(card, ["Metformin"]);
  assert.deepEqual(items.map((item) => item.label), ["Blood group (self-reported)", "Conditions (user-entered)"]);
  assert.equal(items.some((item) => /verified/i.test(item.label)), false);
  assert.equal(cardHasDetails(null, []), false);
  assert.equal(cardHasDetails(null, ["Metformin"]), true);
});

test("location message rounds coordinates to 3 decimals and states that it is not sent", () => {
  assert.equal(roundCoordinate(28.4595123), 28.46);
  assert.equal(mapsLink(28.4595123, 77.0266789), "https://maps.google.com/?q=28.460,77.027");
  const message = buildLocationMessage({ name: "Asha", lat: 28.4595, lng: 77.0266, fixTime: "10:05 IST", items: [] });
  assert.match(message, /approximate location at 10:05 IST/);
  assert.doesNotMatch(message, /\d\.\d{4}/);
});
