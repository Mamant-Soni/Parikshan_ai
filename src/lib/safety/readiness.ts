/**
 * Readiness check. It reports what has been SET UP in Parikshan. It never
 * measures medical safety, never promises that help will arrive, and never
 * counts an unverified number as verified.
 */

export type ReadinessLevel = "READY" | "NEEDS_ATTENTION" | "ACTION_REQUIRED";

export type ReadinessInput = {
  contacts: { verificationStatus: string; consentEmergencyInfo: boolean }[];
  cardHasDetails: boolean;
  verificationProviderConfigured: boolean;
};

export type ReadinessCheck = { id: string; passed: boolean };

export function computeReadiness(input: ReadinessInput): { level: ReadinessLevel; checks: ReadinessCheck[] } {
  const hasContact = input.contacts.length > 0;
  const hasVerified = input.contacts.some((c) => c.verificationStatus === "VERIFIED");
  const hasConsent = input.contacts.some((c) => c.consentEmergencyInfo);
  const checks: ReadinessCheck[] = [
    { id: "contacts", passed: hasContact },
    { id: "verified", passed: hasVerified },
    { id: "consent", passed: hasConsent },
    { id: "card", passed: input.cardHasDetails },
    { id: "provider", passed: input.verificationProviderConfigured },
  ];

  let level: ReadinessLevel;
  if (!hasContact) level = "ACTION_REQUIRED";
  else if (hasVerified && hasConsent && input.cardHasDetails) level = "READY";
  else level = "NEEDS_ATTENTION";

  return { level, checks };
}
