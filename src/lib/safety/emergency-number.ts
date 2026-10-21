/**
 * The emergency number shown on the site. India's single emergency number is
 * 112. It is configurable (EMERGENCY_NUMBER) for other deployments, but only
 * short digit strings are accepted so a bad value cannot create an odd `tel:` link.
 */
export const DEFAULT_EMERGENCY_NUMBER = "112";

export function getEmergencyNumber(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.EMERGENCY_NUMBER ?? "").trim();
  return /^\d{2,6}$/.test(raw) ? raw : DEFAULT_EMERGENCY_NUMBER;
}

/** Whether a real phone-verification provider is configured on the server. */
export function isVerificationProviderConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.OTP_PROVIDER ?? "none").trim() === "twilio-verify" && Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID);
}
